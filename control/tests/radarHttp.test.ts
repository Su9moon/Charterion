import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { ControlPlane } from '../src/controlPlane';
import { startRadarHttp, radarPort } from '../src/radarHttp';
import { readRadarSnapshot } from '../src/radarSnapshot';
import { RpcRouter } from '../src/rpc';
import type { RadarSnapshot } from '../../shared/radar';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()?.(); });
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'charterion-radar-'));
  const db = new ControlDatabase(join(dir, 'test.db')); const plane = new ControlPlane(db);
  cleanup.push(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  // Source assets suffice for the HTTP contract; the built JS is exercised in browser integration.
  for (const name of ['index.html', 'radar.css']) writeFileSync(join(dir, name), readFileSync(resolve('dashboard', name)));
  writeFileSync(join(dir, 'radar.js'), '// HTTP contract fixture; browser integration uses the built bundle');
  const server = await startRadarHttp({ port: 0, assetsDir: dir, snapshot: id => readRadarSnapshot(plane, 'test-instance', id) });
  cleanup.push(server.close);
  const url = new URL(server.openUrl); const origin = url.origin;
  const headers = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get('read')}` };
  return { db, plane, server, origin, headers, dir };
}

describe('loopback read-only radar', () => {
  it('requires explicit valid port opt-in', () => {
    expect(radarPort(undefined)).toBeUndefined(); expect(radarPort('0')).toBe(0); expect(radarPort('49152')).toBe(49152);
    for (const value of ['', ' ', '-1', '65536', '1.5', '0.0.0.0:3000', '01']) expect(() => radarPort(value)).toThrow(/GAM_RADAR_PORT/);
  });

  it('serves only assets and authenticated GET snapshots, without Kernel writes or event payloads', async () => {
    const h = await setup();
    const p = h.plane.createProject({ name: 'Real Kernel record', rootPath: h.origin });
    const a = h.plane.createAgentSlot(p.id, 'chief_engineer');
    h.db.db.prepare("INSERT INTO events(project_id,type,subject,payload_json,created_at) VALUES(?, 'SECRET_EVENT','subject',?,1)").run(p.id, JSON.stringify({ token: 'must-not-leak' }));
    const changes = () => h.db.db.prepare('SELECT total_changes() AS n').get(); const before = changes();
    const page = await fetch(h.origin + '/pcp/'); expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await page.text()).not.toContain(new URL(h.server.openUrl).hash.slice(6));
    expect((await fetch(h.origin + '/pcp/api/snapshot')).status).toBe(401);
    for (const token of ['admin-secret', 'browser-secret', 'wrong']) expect((await fetch(h.origin + '/pcp/api/snapshot', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
    const response = await fetch(h.origin + '/pcp/api/snapshot', { headers: h.headers });
    const data = await response.json() as RadarSnapshot; expect(response.headers.get('cache-control')).toBe('no-store');
    expect(data.projects).toMatchObject([{ id: p.id, fleet: { lifecycleLocked: false, revision: 0 } }]);
    expect(data.agents).toMatchObject([{ id: a.id, observationState: 'offline', conversationKey: null }]);
    expect(JSON.stringify(data)).not.toContain('must-not-leak'); expect(data.events[0]).not.toHaveProperty('payload');
    expect(changes()).toEqual(before);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) expect((await fetch(h.origin + '/pcp/api/snapshot', { method, headers: h.headers })).status).toBe(405);
    expect((await fetch(h.origin + '/pcp/api/rpc?method=agent.spawn', { headers: h.headers })).status).toBe(404);
    expect((await fetch(h.origin + '/admin.token', { headers: h.headers })).status).toBe(404);
  });

  it('rejects rebinding Hosts, foreign Origins, cross-site fetches and other process sessions', async () => {
    const h = await setup(), other = await setup();
    for (const headers of [{ Origin: 'https://untrusted.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }]) {
      const response = await fetch(h.origin + '/pcp/api/snapshot', { headers: { ...h.headers, ...headers } });
      expect(response.status).toBe(403); expect(response.headers.has('access-control-allow-origin')).toBe(false);
    }
    const status = await new Promise<number>(resolve => {
      const req = request(h.origin + '/pcp/api/snapshot', { headers: { ...h.headers, Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode!); }); req.end();
    });
    expect(status).toBe(403);
    expect((await fetch(h.origin + '/pcp/api/snapshot', { headers: other.headers })).status).toBe(401);
    expect((await fetch(h.origin + '/pcp/api/snapshot', { headers: { ...h.headers, Origin: h.origin } })).status).toBe(200);
  });

  it('filters by project and returns the latest 100 events rather than the first 100', async () => {
    const h = await setup(); const a = h.plane.createProject({ name: 'A', rootPath: 'A' }); const b = h.plane.createProject({ name: 'B', rootPath: 'B' });
    h.plane.createAgentSlot(a.id, 'chief_engineer'); h.plane.createAgentSlot(b.id, 'chief_engineer');
    for (let n = 0; n < 125; n++) h.db.db.prepare("INSERT INTO events(project_id,type,subject,payload_json,created_at) VALUES(?,'POLL_TEST',?,'{}',?)").run(b.id, String(n), n);
    const data = await (await fetch(h.origin + '/pcp/api/snapshot?projectId=' + b.id, { headers: h.headers })).json() as RadarSnapshot;
    expect(data.projects.map(p => p.id)).toEqual([b.id]); expect(data.agents).toHaveLength(1); expect(data.agents[0]!.projectId).toBe(b.id);
    expect(data.events).toHaveLength(100); expect(data.events[0]!.subject).toBe('124'); expect(data.events[99]!.subject).toBe('25');
    expect(data.events.every(e => e.projectId === b.id)).toBe(true);
    expect((await fetch(h.origin + '/pcp/api/snapshot?projectId=missing', { headers: h.headers })).status).toBe(404);
    for (const query of ['?projectId=', '?projectId=a&projectId=b', '?method=project.create']) expect((await fetch(h.origin + '/pcp/api/snapshot' + query, { headers: h.headers })).status).toBe(400);
  });

  it('distinguishes fresh, expired and absent browser evidence without changing canonical identity', async () => {
    const h = await setup(); const p = h.plane.createProject({ name: 'A', rootPath: 'A' }, 1); const a = h.plane.createAgentSlot(p.id, 'ROLE', 2);
    h.plane.bindAgentConversation(a.id, 'conversation:durable', 3);
    h.plane.reportAgentBrowser({ slotId: a.id, profileId: 'isolated', tabId: 1, browserState: 'open', conversationKey: 'conversation:durable' }, 10);
    expect(readRadarSnapshot(h.plane, 'test', undefined, 20).agents[0]).toMatchObject({ observationState: 'fresh', conversationKey: 'conversation:durable' });
    expect(readRadarSnapshot(h.plane, 'test', undefined, 180011).agents[0]?.observationState).toBe('unavailable');
    h.plane.reportAgentBrowser({ slotId: a.id, profileId: 'isolated', browserState: 'absent' }, 180012);
    expect(readRadarSnapshot(h.plane, 'test', undefined, 180013).agents[0]).toMatchObject({ observationState: 'offline', conversationKey: 'conversation:durable' });
  });

  it('returns explicit 503 when the Kernel read fails, without stack or credential details', async () => {
    const h = await setup();
    const server = await startRadarHttp({ port: 0, assetsDir: h.dir, snapshot: () => { throw new Error('private token and database path'); } }); cleanup.push(server.close);
    const url = new URL(server.openUrl); const token = new URLSearchParams(url.hash.slice(1)).get('read');
    const response = await fetch(url.origin + '/pcp/api/snapshot', { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'STATE_UNAVAILABLE' });
  });

  it('discovers the read session only through authenticated instance-scoped RPC', async () => {
    const h = await setup(); const router = new RpcRouter(h.plane, 'admin', 'browser', 'instance', () => h.server.openUrl);
    const request = { id: 'radar', method: 'radar.open', instanceId: 'instance' };
    expect(router.handle(request)).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(router.handle({ ...request, instanceId: 'other', auth: { adminToken: 'admin' } })).toMatchObject({ ok: false, error: { code: 'INSTANCE_MISMATCH' } });
    for (const auth of [{ adminToken: 'admin' }, { browserToken: 'browser' }]) expect(router.handle({ ...request, auth })).toMatchObject({ ok: true, result: { url: h.server.openUrl } });
    expect(JSON.stringify(router.handle({ id: 'health', method: 'health' }))).not.toContain('#read=');
    const disabled = new RpcRouter(h.plane, 'admin', 'browser', 'instance');
    expect(disabled.handle({ ...request, auth: { adminToken: 'admin' } })).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  });
});
