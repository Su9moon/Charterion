import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ControlDatabase, CONTROL_SCHEMA_VERSION } from '../src/database';
import { ControlPlane } from '../src/controlPlane';
import { RpcRouter } from '../src/rpc';

const cleanup: Array<() => void> = [];
function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'pcp-fleet-control-'));
  const dbPath = join(dir, 'global.db');
  const database = new ControlDatabase(dbPath);
  const plane = new ControlPlane(database);
  cleanup.push(() => { database.close(); rmSync(dir, { force: true, recursive: true }); });
  return { plane, database, dbPath };
}
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); });

describe('PCP project Fleet control (first live code slice)', () => {
  it('keeps legacy projects elastic and does not mutate their state on read', () => {
    const { plane, database } = harness();
    const project = plane.createProject({ name: 'Legacy', rootPath: 'C:/legacy', minSlots: 0, maxSlots: 1 });
    expect(plane.getPcpProjectFleetControl(project.id)).toEqual({
      projectId: project.id, mode: 'elastic', lifecycleLocked: false, revision: 0,
    });
    expect(database.db.prepare('SELECT COUNT(*) AS n FROM pcp_project_fleet_controls').get()).toMatchObject({ n: 0 });
    expect(CONTROL_SCHEMA_VERSION).toBe(28);
  });

  it('persists explicit controlled mode, respects revisions, and audits changes', () => {
    const { plane } = harness();
    const a = plane.createProject({ name: 'A', rootPath: 'C:/project-a', minSlots: 0, maxSlots: 1 });
    const b = plane.createProject({ name: 'B', rootPath: 'C:/project-b', minSlots: 0, maxSlots: 1 });
    const first = plane.setPcpProjectFleetControl(a.id, {
      mode: 'controlled', expectedRevision: 0, actor: 'human-controller', reason: 'PCP fixed WebGPT role',
    }, 1000);
    expect(first).toMatchObject({ mode: 'controlled', lifecycleLocked: false, revision: 1, actor: 'human-controller' });
    expect(plane.getPcpProjectFleetControl(b.id).mode).toBe('elastic');
    expect(plane.setPcpProjectFleetControl(a.id, {
      mode: 'controlled', expectedRevision: 1, actor: 'human-controller', reason: 'no actual change',
    }, 1100).revision).toBe(1);
    expect(() => plane.setPcpProjectFleetControl(a.id, {
      mode: 'elastic', expectedRevision: 0, actor: 'human-controller', reason: 'stale write',
    }, 1200)).toThrow(/revision conflict/);
    expect(plane.getPcpProjectFleetControl(a.id).mode).toBe('controlled');
    const events = plane.listEvents(a.id).filter((event) => event.type === 'PCP_PROJECT_FLEET_CONTROL_CHANGED');
    expect(events).toHaveLength(1);
    expect(events[0]?.subject).toBe(a.id);
  });

  it('prevents Elastic Fleet from auto-suspending controlled or manually locked projects', () => {
    const { plane } = harness();
    const p = plane.createProject({ name: 'PCP', rootPath: 'C:/pcp', minSlots: 0, maxSlots: 1 });
    const slot = plane.createAgentSlot(p.id, 'CHIEF_ENGINEER', 10);
    plane.database.db.prepare(`
      UPDATE agent_slots
      SET browser_state='open', browser_page_status='idle',
          browser_runtime_observed_at=100, rollover_state='idle',
          browser_quarantined=0 WHERE id=?
    `).run(slot.id);
    plane.setPcpProjectFleetControl(p.id, {
      mode: 'controlled', expectedRevision: 0, actor: 'human', reason: 'pin fixed role',
    }, 20);
    expect(plane.reconcileElasticFleet(200_000, 0)).toEqual([]);
    expect(plane.getAgentSlot(slot.id).desiredState).toBe('active');
    plane.setPcpProjectFleetControl(p.id, {
      mode: 'elastic', lifecycleLocked: true, expectedRevision: 1, actor: 'human', reason: 'explicit lifecycle lock',
    }, 30);
    expect(plane.reconcileElasticFleet(200_000, 0)).toEqual([]);
    plane.setPcpProjectFleetControl(p.id, {
      lifecycleLocked: false, expectedRevision: 2, actor: 'human', reason: 'allow legacy behavior',
    }, 40);
    const planned = plane.reconcileElasticFleet(200_000, 0);
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ kind: 'suspend', slotId: slot.id });
    expect(plane.getAgentSlot(slot.id).desiredState).toBe('suspended');
  });

  it('requires admin for write RPC and serves read RPC only to authenticated callers', () => {
    const { plane } = harness();
    const p = plane.createProject({ name: 'PCP', rootPath: 'C:/pcp', minSlots: 0, maxSlots: 1 });
    const router = new RpcRouter(plane, 'secret-admin', 'secret-browser', 'instance-one');
    const call = (method: string, auth?: { adminToken?: string; browserToken?: string }, params: Record<string, unknown> = {}) =>
      router.handle({ id: method, instanceId: 'instance-one', method, auth, params });
    expect(call('project.fleet-control-get', undefined, { projectId: p.id }).ok).toBe(false);
    expect(call('project.fleet-control-set', { browserToken: 'secret-browser' }, {
      projectId: p.id, mode: 'controlled', expectedRevision: 0, actor: 'browser', reason: 'unapproved',
    }).ok).toBe(false);
    expect(call('project.fleet-control-set', { adminToken: 'secret-admin' }, {
      projectId: p.id, mode: 'controlled', expectedRevision: 0, actor: 'human', reason: 'authorized',
    }).ok).toBe(true);
    const view = call('project.fleet-control-get', { browserToken: 'secret-browser' }, { projectId: p.id });
    expect(view.ok).toBe(true);
    if (view.ok) expect(view.result).toMatchObject({ mode: 'controlled', revision: 1 });
  });

  it('blocks scoped fleet capabilities from overriding the manual controller', () => {
    const { plane } = harness();
    const p = plane.createProject({ name: 'Controlled', rootPath: 'C:/pcp-control', minSlots: 0, maxSlots: 2 });
    const token = plane.issueCapability({
      projectId: p.id, subject: 'fleet-worker', scopes: ['agent:fleet'], ttlMs: 60_000,
    }).token;
    const router = new RpcRouter(plane, 'secret-admin', 'secret-browser');
    const create = () => router.handle({
      id: 'create', method: 'agent.create', auth: { capabilityToken: token },
      params: { projectId: p.id, role: 'CHIEF_ENGINEER' },
    });
    expect(create().ok).toBe(true);
    plane.setPcpProjectFleetControl(p.id, {
      mode: 'controlled', expectedRevision: 0, actor: 'human', reason: 'manual control',
    });
    expect(create().ok).toBe(false);
    plane.setPcpProjectFleetControl(p.id, {
      mode: 'elastic', lifecycleLocked: true, expectedRevision: 1, actor: 'human', reason: 'lock project',
    });
    expect(create().ok).toBe(false);
    plane.setPcpProjectFleetControl(p.id, {
      lifecycleLocked: false, expectedRevision: 2, actor: 'human', reason: 'unlock project',
    });
    expect(create().ok).toBe(true);
  });

  it('survives reopening SQLite and does not overwrite the project or agents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pcp-fleet-restart-'));
    const path = join(dir, 'global.db');
    let db = new ControlDatabase(path);
    cleanup.push(() => { try { db.close(); } catch { /* already closed */ } rmSync(dir, { force: true, recursive: true }); });
    const plane = new ControlPlane(db);
    const project = plane.createProject({ name: 'PCP', rootPath: 'C:/pcp', minSlots: 0, maxSlots: 1 });
    const agent = plane.createAgentSlot(project.id, 'SUPERVISOR');
    plane.setPcpProjectFleetControl(project.id, {
      mode: 'controlled', lifecycleLocked: true, expectedRevision: 0,
      actor: 'human-controller', reason: 'resume after kernel restart',
    });
    db.close();
    db = new ControlDatabase(path);
    const reopened = new ControlPlane(db);
    expect(reopened.getPcpProjectFleetControl(project.id)).toMatchObject({
      mode: 'controlled', lifecycleLocked: true, revision: 1,
    });
    expect(reopened.getAgentSlot(agent.id).id).toBe(agent.id);
  });
});
