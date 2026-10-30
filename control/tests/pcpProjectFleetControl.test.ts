import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ControlDatabase, CONTROL_SCHEMA_VERSION } from '../src/database';
import { ControlPlane } from '../src/controlPlane';
import { RpcRouter } from '../src/rpc';
import type { RpcRequest } from '../src/contracts';

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
    expect(CONTROL_SCHEMA_VERSION).toBe(30);
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
      router.handle({ id: method, instanceId: 'instance-one', method, ...(auth ? { auth } : {}), params });
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
    const create = (role = 'CHIEF_ENGINEER') => router.handle({
      id: 'create', method: 'agent.create', auth: { capabilityToken: token },
      params: { projectId: p.id, role },
    });
    expect(create()).toMatchObject({ ok: true });
    plane.setPcpProjectFleetControl(p.id, {
      mode: 'controlled', expectedRevision: 0, actor: 'human', reason: 'manual control',
    });
    expect(create('REVIEWER')).toMatchObject({ ok: false, error: { message: 'PCP project fleet is controlled or lifecycle-locked' } });
    plane.setPcpProjectFleetControl(p.id, {
      mode: 'elastic', lifecycleLocked: true, expectedRevision: 1, actor: 'human', reason: 'lock project',
    });
    expect(create('REVIEWER')).toMatchObject({ ok: false, error: { message: 'PCP project fleet is controlled or lifecycle-locked' } });
    plane.setPcpProjectFleetControl(p.id, {
      lifecycleLocked: false, expectedRevision: 2, actor: 'human', reason: 'unlock project',
    });
    expect(create('REVIEWER')).toMatchObject({ ok: true });
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

  it.each([
    { mode: 'controlled' as const, lifecycleLocked: false },
    { mode: 'elastic' as const, lifecycleLocked: true },
  ])('blocks auto-resume and spawn with %j while an elastic peer still scales', (settings) => {
    const { plane } = harness();
    const p = plane.createProject({ name: 'Pinned', rootPath: 'C:/pinned', minSlots: 0, maxSlots: 3 });
    const peer = plane.createProject({ name: 'Elastic peer', rootPath: 'C:/elastic-peer', minSlots: 0, maxSlots: 1 });
    const suspended = plane.createAgentSlot(p.id, 'WORKER');
    plane.suspendAgentSlot(suspended.id);
    plane.work.replace({
      expectedRevision: 0, transportGeneration: 'fleet-test', transportSequence: 1, transportMessageId: 'fleet-test-1',
      tasks: [
        { id: 'resume', project: p.name, targetRole: 'WORKER', dependsOn: [], attemptIds: [] },
        { id: 'spawn', project: p.name, targetRole: 'REVIEWER', dependsOn: [], attemptIds: [] },
        { id: 'peer', project: peer.name, targetRole: 'WORKER', dependsOn: [], attemptIds: [] },
      ], attempts: [], messages: [],
    });
    plane.setPcpProjectFleetControl(p.id, { ...settings, expectedRevision: 0, actor: 'human', reason: 'hold capacity' });
    expect(plane.reconcileElasticFleet()).toMatchObject([{ kind: 'spawn' }]);
    expect(plane.getAgentSlot(suspended.id).desiredState).toBe('suspended');
    expect(plane.listAgentSlots(p.id)).toHaveLength(1);
    expect(plane.listAgentSlots(peer.id)).toHaveLength(1);
    plane.setPcpProjectFleetControl(p.id, { mode: 'elastic', lifecycleLocked: false, expectedRevision: 1, actor: 'human', reason: 'release capacity' });
    const decisions = plane.reconcileElasticFleet();
    expect(decisions.map((d) => d.kind).sort()).toEqual(['resume', 'spawn']);
    expect(plane.getAgentSlot(suspended.id).desiredState).toBe('active');
    expect(plane.listAgentSlots(p.id)).toHaveLength(2);
  });

  it.each([
    { mode: 'controlled' as const, lifecycleLocked: false },
    { mode: 'elastic' as const, lifecycleLocked: true },
  ])('rejects every scoped lifecycle RPC with %j and keeps explicit admin operations available', (settings) => {
    const { plane } = harness();
    const p = plane.createProject({ name: 'RPC PCP', rootPath: 'C:/rpc-pcp', minSlots: 0, maxSlots: 3 });
    const active = plane.createAgentSlot(p.id, 'CHIEF_ENGINEER');
    const suspended = plane.createAgentSlot(p.id, 'REVIEWER');
    plane.suspendAgentSlot(suspended.id);
    const token = plane.issueCapability({ projectId: p.id, subject: 'fleet-worker', scopes: ['agent:fleet'], ttlMs: 60_000 }).token;
    plane.setPcpProjectFleetControl(p.id, { ...settings, expectedRevision: 0, actor: 'human', reason: 'manual operations only' });
    const router = new RpcRouter(plane, 'secret-admin', 'secret-browser', 'instance-one');
    const operations = [
      { method: 'agent.create', params: { projectId: p.id, role: 'OPERATIONS' } },
      { method: 'agent.spawn', params: { projectId: p.id, role: 'OPERATIONS' } },
      { method: 'agent.suspend', params: { slotId: active.id } },
      { method: 'agent.resume', params: { slotId: suspended.id } },
      { method: 'agent.retire', params: { slotId: active.id } },
    ];
    const before = plane.listAgentSlots(p.id);
    for (const operation of operations) {
      const request = { id: operation.method, instanceId: 'instance-one', ...operation };
      expect(router.handle({ ...request, auth: { capabilityToken: token } })).toMatchObject({
        ok: false, error: { code: 'INVALID_REQUEST', message: 'PCP project fleet is controlled or lifecycle-locked' },
      });
      expect(router.handle({ ...request, auth: { capabilityToken: token, adminToken: 'wrong' } })).toMatchObject({
        ok: false, error: { code: 'UNAUTHORIZED' },
      });
    }
    expect(plane.listAgentSlots(p.id)).toEqual(before);
    for (const operation of operations.filter((op) => op.method !== 'agent.spawn')) {
      expect(router.handle({ id: operation.method, instanceId: 'instance-one', ...operation, auth: { adminToken: 'secret-admin' } })).toMatchObject({ ok: true });
    }
    expect(plane.getAgentSlot(active.id).desiredState).toBe('retired');
    expect(plane.getAgentSlot(suspended.id).desiredState).toBe('active');
  });

  it('rejects invalid writes and cross-instance access without changing data or audit', () => {
    const { plane } = harness();
    const p = plane.createProject({ name: 'Validation', rootPath: 'C:/validation', minSlots: 0, maxSlots: 1 });
    const router = new RpcRouter(plane, 'secret-admin', 'secret-browser', 'instance-one');
    const request: RpcRequest = {
      id: 'set', method: 'project.fleet-control-set', instanceId: 'instance-one', auth: { adminToken: 'secret-admin' },
    };
    const params = { projectId: p.id, mode: 'controlled', expectedRevision: 0, actor: 'human', reason: 'valid' };
    for (const invalid of [
      { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: '0' },
      { mode: 'automatic' }, { lifecycleLocked: null }, { actor: ' ' }, { reason: '' },
      { mode: undefined, lifecycleLocked: undefined }, { projectId: 'missing' },
    ]) {
      expect(router.handle({ ...request, params: { ...params, ...invalid } })).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    }
    expect(router.handle({ ...request, instanceId: 'other-instance', params })).toMatchObject({ ok: false, error: { code: 'INSTANCE_MISMATCH' } });
    expect(plane.getPcpProjectFleetControl(p.id).revision).toBe(0);
    expect(plane.listEvents(p.id).filter((e) => e.type === 'PCP_PROJECT_FLEET_CONTROL_CHANGED')).toEqual([]);
  });

  it('rolls back a control change if its audit cannot be stored', () => {
    const { plane, database } = harness();
    const p = plane.createProject({ name: 'Atomic audit', rootPath: 'C:/atomic-audit', minSlots: 0, maxSlots: 1 });
    const update = { mode: 'controlled' as const, expectedRevision: 0, actor: 'human', reason: 'atomic audit' };
    database.db.exec(`CREATE TRIGGER reject_fleet_audit BEFORE INSERT ON events
      WHEN NEW.type='PCP_PROJECT_FLEET_CONTROL_CHANGED'
      BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;`);
    expect(() => plane.setPcpProjectFleetControl(p.id, update)).toThrow('audit unavailable');
    expect(plane.getPcpProjectFleetControl(p.id)).toEqual({ projectId: p.id, mode: 'elastic', lifecycleLocked: false, revision: 0 });
    database.db.exec('DROP TRIGGER reject_fleet_audit');
    const changed = plane.setPcpProjectFleetControl(p.id, update, 1000);
    expect(plane.setPcpProjectFleetControl(p.id, { ...update, expectedRevision: 1 }, 2000)).toEqual(changed);
    expect(plane.listEvents(p.id).filter((e) => e.type === 'PCP_PROJECT_FLEET_CONTROL_CHANGED')).toMatchObject([
      { createdAt: 1000, payload: { actor: 'human', reason: 'atomic audit', from: { mode: 'elastic', revision: 0 }, to: { mode: 'controlled', revision: 1 } } },
    ]);
  });

  it('adds V28 to a V27-shaped database without changing any legacy table rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pcp-fleet-migrate-'));
    const path = join(dir, 'global.db');
    let db = new ControlDatabase(path);
    cleanup.push(() => { try { db.close(); } catch { /* already closed */ } rmSync(dir, { force: true, recursive: true }); });
    const plane = new ControlPlane(db);
    const p = plane.createProject({ name: 'V27 project', rootPath: 'C:/v27-project', minSlots: 0, maxSlots: 1 }, 10);
    const slot = plane.createAgentSlot(p.id, 'SUPERVISOR', 20);
    plane.bindAgentConversation(slot.id, 'conversation:v27-preserved', 30);
    plane.work.replace({
      expectedRevision: 0, transportGeneration: 'v27', transportSequence: 1, transportMessageId: 'v27-1',
      tasks: [{ id: 'v27-task', project: p.name, targetRole: 'SUPERVISOR', dependsOn: [], attemptIds: [] }], attempts: [], messages: [],
    }, 40);
    // V28 is strictly additive: removing its sole new table reconstructs the
    // full V27 schema. Separate rehearsal also uses the unmodified base build.
    db.db.exec("DROP TABLE pcp_project_fleet_controls; UPDATE schema_meta SET value='27' WHERE key='schema_version';");
    const tables = (db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'schema_meta' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
    const snapshot = () => Object.fromEntries(tables.map((table) => [table, db.db.prepare(`SELECT * FROM "${table}"`).all()]));
    const before = snapshot();
    db.close();
    db = new ControlDatabase(path);
    expect(snapshot()).toEqual(before);
    expect(db.db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()).toMatchObject({ value: String(CONTROL_SCHEMA_VERSION) });
    expect(db.health()).toEqual({ ok: true, quickCheck: ['ok'], foreignKeyViolations: 0 });
    const reopened = new ControlPlane(db);
    expect(reopened.getPcpProjectFleetControl(p.id)).toEqual({ projectId: p.id, mode: 'elastic', lifecycleLocked: false, revision: 0 });
    reopened.setPcpProjectFleetControl(p.id, { mode: 'controlled', lifecycleLocked: true, expectedRevision: 0, actor: 'human', reason: 'after migration' });
    db.close();
    db = new ControlDatabase(path);
    expect(new ControlPlane(db).getPcpProjectFleetControl(p.id)).toMatchObject({ mode: 'controlled', lifecycleLocked: true, revision: 1 });
    const insert = db.db.prepare('INSERT INTO pcp_project_fleet_controls VALUES(?,?,?,?,?,?,?)');
    expect(() => insert.run('nonexistent-project', 'elastic', 0, 1, 'human', 'invalid reference', 50)).toThrow(/FOREIGN KEY/);
    for (const [mode, lock, revision] of [['invalid', 0, 1], ['controlled', 2, 1], ['controlled', 1, 0]]) {
      expect(() => db.db.prepare('UPDATE pcp_project_fleet_controls SET mode=?,lifecycle_locked=?,revision=? WHERE project_id=?')
        .run(mode!, lock!, revision!, p.id)).toThrow(/CHECK/);
    }
    expect(db.health().ok).toBe(true);
  });

  it.each([
    { mode: 'controlled' as const, lifecycleLocked: false },
    { mode: 'elastic' as const, lifecycleLocked: true },
  ])('blocks Organization automatic slot creation with %j but permits an explicitly created slot', (settings) => {
    const { plane } = harness();
    const project = plane.createProject({ name: 'Organization PCP', rootPath: 'C:/org-pcp', minSlots: 0, maxSlots: 2 });
    const organization = plane.organization.createOrganization({ name: 'PCP org' });
    const agent = plane.organization.registerAgent({ organizationId: organization.id, displayName: 'Reviewer' });
    const workspace = plane.organization.activeAgentWorkspace(agent.id)!;
    plane.organization.configureAgentWorkspace({
      workspaceId: workspace.id, rootRef: 'workspace://reviewer',
      browserProfileId: 'pcp-test-profile', toolProfileRef: 'pcp-test-tools',
    });
    plane.setPcpProjectFleetControl(project.id, {
      ...settings, expectedRevision: 0, actor: 'human', reason: 'manual lifecycle',
    });
    const input = { organizationId: organization.id, agentId: agent.id, projectId: project.id, role: 'REVIEWER', idempotencyKey: 'review-runtime' };
    const blocked = plane.organizationRuntime.requestAndAcquire(input);
    expect(blocked).toMatchObject({ status: 'failed', error: 'Cannot automatically create an AgentSlot in a controlled or lifecycle-locked PCP project' });
    expect(plane.listAgentSlots(project.id)).toEqual([]);
    const slot = plane.createAgentSlot(project.id, 'REVIEWER');
    plane.organizationRuntime.retry(blocked.id);
    expect(plane.organizationRuntime.acquire(blocked.id)).toMatchObject({ status: 'acquired', runtimeSlotId: slot.id });
    expect(plane.listAgentSlots(project.id)).toHaveLength(1);
  });
});
