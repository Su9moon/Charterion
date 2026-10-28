import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { ControlPlane } from '../src/controlPlane';
import { RpcRouter } from '../src/rpc';
import type { RpcRequest } from '../src/contracts';

const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'cb-rpc-'));
  const db = new ControlDatabase(join(dir, 'control.db'));
  cleanups.push(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const plane = new ControlPlane(db);
  const router = (clientId = 'host-client', project = 'fixture', enabled = true) =>
    new RpcRouter(plane, 'admin', 'browser', 'instance', enabled ? { enabled: true, clientId, project } : undefined);
  return { db, dir, router };
}
const input = { dispatchId: 'dispatch-1', workItemId: 'work-1', project: 'fixture',
  task: '  精确\r\ntext\n ', sourceRef: 'repo@sha', inputRef: 'sha256:input', options: { a: [1, '文字'] } };
function call(router: RpcRouter, method = 'prepare', params: unknown = input, auth: RpcRequest['auth'] = { adminToken: 'admin' }, instanceId = 'instance') {
  return router.handle({ id: 'rpc-1', method: `cb-dispatch.${method}`, params, auth, instanceId } as RpcRequest);
}
function snapshot(db: ControlDatabase) {
  const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'charterion_cb_%' ORDER BY name").all() as { name: string }[];
  return tables.map(({ name }) => ({ name, rows: db.db.prepare(`SELECT * FROM "${name}"`).all() }));
}

it('defaults disabled; rejects unauthenticated, browser and wrong-instance access before creating journal tables', () => {
  const { db, router } = setup();
  const before = snapshot(db);
  expect(call(router('', '', false))).toMatchObject({ ok: false });
  for (const auth of [{}, { browserToken: 'browser' }, { capabilityToken: 'untrusted' }, { adminToken: 'wrong' }]) {
    expect(call(router(), 'prepare', input, auth)).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(call(router(), 'lookup', { dispatchId: input.dispatchId, project: input.project }, auth)).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  }
  expect(call(router(), 'prepare', input, { adminToken: 'admin' }, 'wrong')).toMatchObject({ ok: false, error: { code: 'INSTANCE_MISMATCH' } });
  expect(db.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'charterion_cb_%'").all()).toEqual([]);
  expect(snapshot(db)).toEqual(before);
});

it('persists exact deterministic inputs, survives router recreation, deduplicates and rejects mutation without materialization', () => {
  const { db, dir, router } = setup();
  const before = snapshot(db);
  const files = readdirSync(dir).sort();
  const first = call(router());
  expect(first).toMatchObject({ ok: true, result: { ...input, clientId: 'host-client',
    intentSha256: createHash('sha256').update(input.task, 'utf8').digest('hex'), taskId: null, instanceId: null } });
  expect(call(router())).toEqual(first);
  expect(call(router(), 'lookup', { dispatchId: input.dispatchId, project: input.project })).toEqual(first);
  for (const mutation of [{ task: 'changed' }, { sourceRef: 'other' }, { options: { changed: true } }]) {
    expect(call(router(), 'prepare', { ...input, ...mutation })).toMatchObject({ ok: false });
  }
  expect(db.db.prepare('SELECT * FROM charterion_cb_dispatch').all()).toHaveLength(1);
  expect(snapshot(db)).toEqual(before);
  expect(readdirSync(dir).sort()).toEqual(files);
});

it('rejects scope overrides and cross-scope access for both prepare and lookup', () => {
  const { router } = setup();
  const first = call(router());
  for (const method of ['prepare', 'lookup']) {
    const params = method === 'prepare' ? input : { dispatchId: input.dispatchId, project: input.project };
    expect(call(router(), method, { ...params, clientId: 'victim' })).toMatchObject({ ok: false });
    expect(call(router('host-client', 'other'), method, params)).toMatchObject({ ok: false });
    expect(call(router(), method, { ...params, project: 'other' })).toMatchObject({ ok: false });
  }
  expect(call(router('other-client'), 'lookup', { dispatchId: input.dispatchId, project: input.project })).toMatchObject({ ok: true, result: null });
  expect(call(router(), 'lookup', { dispatchId: input.dispatchId, project: input.project })).toEqual(first);
});
