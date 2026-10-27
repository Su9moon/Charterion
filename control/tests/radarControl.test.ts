import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { ControlPlane } from '../src/controlPlane';
import { RadarControl } from '../src/radarControl';
import { readRadarSnapshot } from '../src/radarSnapshot';
import { startRadarHttp } from '../src/radarHttp';
import { RpcRouter } from '../src/rpc';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()?.(); });
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'charterion-control-'));
  const db = new ControlDatabase(join(dir, 'test.db')), plane = new ControlPlane(db);
  cleanup.push(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  for (const name of ['index.html', 'radar.css', 'radar.js']) writeFileSync(join(dir, name), 'HTTP test fixture');
  const a = plane.createProject({ name: 'A', rootPath: 'A' }), b = plane.createProject({ name: 'B', rootPath: 'B' });
  let time = 1000; const control = new RadarControl(plane, () => time);
  const server = await startRadarHttp({ port: 0, assetsDir: dir, control, snapshot: id => readRadarSnapshot(plane, 'test', id) }); cleanup.push(server.close);
  const url = new URL(server.openUrl), origin = url.origin, read = new URLSearchParams(url.hash.slice(1)).get('read')!;
  const grant = control.issue(a.id, 'authorized-human');
  const headers = { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${read}`, 'X-Charterion-Control': grant.token };
  const command = { projectId: a.id, expectedRevision: 0, mode: 'controlled', lifecycleLocked: true, reason: 'manual maintenance', requestId: 'request_0000000001' };
  const post = (body: unknown = command, extra: Record<string, string> = {}) => fetch(origin + '/pcp/api/fleet-control', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  const events = () => plane.listEvents(a.id).filter(e => e.type === 'PCP_PROJECT_FLEET_CONTROL_CHANGED');
  return { plane, control, server, origin, read, grant, headers, command, post, events, a, b, advance: (n: number) => { time += n; } };
}
describe('radar manual Fleet control boundary', () => {
  it('issues project grants only through admin instance-scoped RPC; neither browser nor read session can issue one', async () => {
    const h = await setup(); const rpc = new RpcRouter(h.plane, 'admin', 'browser', 'test', () => h.server.openUrl, (p, a) => h.control.issue(p, a));
    const request = { id: 'grant', method: 'radar.authorize-control', instanceId: 'test', params: { projectId: h.a.id, actor: 'human' } };
    for (const auth of [undefined, { browserToken: 'browser' }, { adminToken: h.read }]) expect(rpc.handle({ ...request, ...(auth ? { auth } : {}) })).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(rpc.handle({ ...request, instanceId: 'wrong', auth: { adminToken: 'admin' } })).toMatchObject({ ok: false, error: { code: 'INSTANCE_MISMATCH' } });
    expect(rpc.handle({ ...request, auth: { adminToken: 'admin' } })).toMatchObject({ ok: true, result: { projectId: h.a.id, actor: 'human', expiresAt: 601000 } });
    expect(new RpcRouter(h.plane, 'admin', 'browser', 'test').handle({ ...request, auth: { adminToken: 'admin' } })).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  });
  it('requires both independent credentials, an exact project scope and same-origin JSON POST', async () => {
    const h = await setup();
    expect((await h.post(h.command, { 'X-Charterion-Control': '' })).status).toBe(403);
    expect((await h.post(h.command, { 'X-Charterion-Control': h.read })).status).toBe(403);
    expect((await h.post(h.command, { 'X-Charterion-Control': 'fleet_' + 'x'.repeat(43) })).status).toBe(403);
    expect((await h.post(h.command, { Authorization: '' })).status).toBe(401);
    expect((await h.post({ ...h.command, projectId: h.b.id })).status).toBe(403);
    for (const extra of [{ Origin: '' }, { Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { Host: 'evil.example' }]) {
      // Fetch normalizes/owns Host; use a raw HTTP request to exercise the exact hostile headers.
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(h.origin + '/pcp/api/fleet-control', { method: 'POST', headers: { ...h.headers, ...extra } }, res => { res.resume(); resolve(res.statusCode!); });
        req.on('error', reject); req.end(JSON.stringify(h.command));
      });
      expect(status, JSON.stringify(extra)).toBe(403);
    }
    expect((await h.post(h.command, { 'Content-Type': 'text/plain' })).status).toBe(400);
    expect(h.plane.getPcpProjectFleetControl(h.a.id).revision).toBe(0); expect(h.events()).toHaveLength(0);
    expect((await fetch(h.origin + '/pcp/api/rpc', { method: 'POST', headers: h.headers, body: '{}' })).status).toBe(405);
  });
  it('commits via existing Kernel CAS and persists the grant actor, human reason and before/after audit', async () => {
    const h = await setup(); expect((await h.post()).status).toBe(200);
    expect(h.plane.getPcpProjectFleetControl(h.a.id)).toMatchObject({ mode: 'controlled', lifecycleLocked: true, revision: 1, actor: 'authorized-human', reason: 'manual maintenance' });
    expect(h.events()).toHaveLength(1); expect(h.events()[0]?.payload).toMatchObject({ actor: 'authorized-human', reason: 'manual maintenance', from: { revision: 0 }, to: { revision: 1 } });
    const snapshot = await (await fetch(h.origin + '/pcp/api/snapshot', { headers: { Authorization: 'Bearer ' + h.read } })).text();
    expect(snapshot).not.toContain(h.grant.token); expect(snapshot).not.toContain('manual maintenance');
    expect(h.plane.getPcpProjectFleetControl(h.b.id).revision).toBe(0);
  });
  it('deduplicates concurrent identical submissions and rejects request ID reuse without extra audits', async () => {
    const h = await setup(); const replies = await Promise.all([h.post(), h.post()]);
    expect(replies.map(r => r.status)).toEqual([200, 200]); expect(await replies[0]!.json()).toEqual(await replies[1]!.json()); expect(h.events()).toHaveLength(1);
    const reused = await h.post({ ...h.command, lifecycleLocked: false }); expect(reused.status).toBe(409); expect(await reused.json()).toMatchObject({ error: 'REQUEST_ID_REUSED' });
    expect(h.events()).toHaveLength(1);
  });
  it('rejects a stale revision and never retries/rebases it, including duplicate stale requests', async () => {
    const h = await setup(); h.plane.setPcpProjectFleetControl(h.a.id, { expectedRevision: 0, mode: 'controlled', actor: 'other', reason: 'concurrent' });
    for (let i = 0; i < 2; i++) { const r = await h.post(); expect(r.status).toBe(409); expect(await r.json()).toMatchObject({ error: 'REVISION_CONFLICT' }); }
    expect(h.events()).toHaveLength(1); expect(h.plane.getPcpProjectFleetControl(h.a.id).lifecycleLocked).toBe(false);
  });
  it('does not create a fake change or audit for an unchanged setting', async () => {
    const h = await setup(); const r = await h.post({ ...h.command, mode: 'elastic', lifecycleLocked: false });
    expect(await r.json()).toMatchObject({ changed: false, revision: 0 }); expect(h.events()).toHaveLength(0);
  });
  it('rejects malformed, oversized and out-of-scope commands without state changes', async () => {
    const h = await setup();
    for (const change of [{ reason: ' ' }, { expectedRevision: undefined }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { mode: 'paused' }, { lifecycleLocked: 'true' }, { actor: 'spoof' }, { requestId: 'short' }, { taskId: 'other' }]) expect((await h.post({ ...h.command, ...change })).status).toBe(400);
    expect((await h.post({ ...h.command, reason: 'x'.repeat(9000) })).status).toBe(413);
    expect((await fetch(h.origin + '/pcp/api/fleet-control', { method: 'POST', headers: h.headers, body: '{' })).status).toBe(400);
    expect(h.events()).toHaveLength(0);
  });
  it('expires grants and makes old process grants unusable while retaining the existing Kernel lock', async () => {
    const h = await setup(); await h.post(); h.advance(600000);
    expect((await h.post({ ...h.command, expectedRevision: 1 })).status).toBe(403);
    const restarted = new RadarControl(h.plane);
    expect(() => restarted.execute(h.grant.token, h.command)).toThrow('CONTROL_AUTHORIZATION_REQUIRED');
    expect(h.plane.getPcpProjectFleetControl(h.a.id)).toMatchObject({ revision: 1, lifecycleLocked: true });
  });
  it('rejects incomplete or aborted bodies without writes and remains available', async () => {
    const h = await setup();
    const timeout = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(h.origin + '/pcp/api/fleet-control', { method: 'POST', headers: h.headers }, res => { res.resume(); resolve(res.statusCode!); });
      req.on('error', reject); req.write('{');
    });
    expect(timeout).toBe(408);
    await new Promise<void>(resolve => {
      const req = httpRequest(h.origin + '/pcp/api/fleet-control', { method: 'POST', headers: h.headers });
      req.on('error', () => {}); req.write('{'); setTimeout(() => { req.destroy(); resolve(); }, 30);
    });
    expect((await fetch(h.origin + '/pcp/api/snapshot', { headers: { Authorization: 'Bearer ' + h.read } })).status).toBe(200);
    expect(h.events()).toHaveLength(0);
  }, 10000);
  it('bounds live grants and receipts without evicting replay protection', async () => {
    const h = await setup(); for (let n = 1; n < 32; n++) h.control.issue(h.a.id, 'human');
    expect(() => h.control.issue(h.a.id, 'human')).toThrow('AUTHORIZATION_LIMIT');
    const noop = { ...h.command, mode: 'elastic', lifecycleLocked: false };
    for (let n = 0; n < 128; n++) expect(h.control.execute(h.grant.token, { ...noop, requestId: 'request_' + String(n).padStart(10, '0') }).status).toBe(200);
    expect(() => h.control.execute(h.grant.token, { ...noop, requestId: 'request_new_0000000' })).toThrow('REQUEST_LIMIT');
    expect(h.control.execute(h.grant.token, { ...noop, requestId: 'request_0000000000' }).status).toBe(200);
    h.advance(600000); expect(h.control.issue(h.a.id, 'human').token).toMatch(/^fleet_/);
  });
});
