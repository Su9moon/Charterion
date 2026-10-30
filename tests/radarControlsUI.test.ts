import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountFleetControls } from '../dashboard/fleetControls';
import type { RadarSnapshot } from '../shared/radar';

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); });
function data(revision = 1): RadarSnapshot {
  return { schemaVersion: 1, instanceId: 'test', observedAt: 1, refreshAfterMs: 3000, observationTtlMs: 180000,
    projects: ['A', 'B'].map(id => ({ id, name: id, rootPath: id, status: 'active', minSlots: 0, maxSlots: 1, fleet: { mode: 'controlled', lifecycleLocked: false, revision } })), agents: [], events: [] };
}
function setup(fetcher: typeof fetch, reload = vi.fn<() => Promise<RadarSnapshot | undefined>>().mockResolvedValue(data(2))) {
  const dom = new JSDOM(readFileSync('dashboard/index.html', 'utf8'), { url: 'http://127.0.0.1:34567/pcp/' });
  const doc = dom.window.document;
  const get = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const view = mountFleetControls(doc, dom.window as unknown as Window, fetcher, { readToken: () => 'read-only', reload });
  cleanup.push(() => { view.dispose(); dom.window.close(); }); view.update(data(), true);
  function ready() {
    const project = get<HTMLSelectElement>('control-project'); project.value = 'A'; project.dispatchEvent(new dom.window.Event('change'));
    get<HTMLInputElement>('control-credential').value = 'fleet_' + 'c'.repeat(43);
    get<HTMLTextAreaElement>('control-reason').value = 'maintenance';
    get<HTMLInputElement>('control-confirm').checked = true;
    get('fleet-form').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  const submit = () => get('fleet-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  return { doc, get, view, ready, submit, reload };
}
describe('manual Fleet form', () => {
  it('keeps read-only users disabled; requires a scoped credential, reason and explicit confirmation', () => {
    const fetcher = vi.fn<typeof fetch>(); const h = setup(fetcher);
    expect(h.get<HTMLButtonElement>('control-submit').disabled).toBe(true); h.submit(); expect(fetcher).not.toHaveBeenCalled();
    h.ready(); h.get<HTMLInputElement>('control-credential').value = 'read-only';
    h.get('fleet-form').dispatchEvent(new h.doc.defaultView!.Event('input')); h.submit(); expect(fetcher).not.toHaveBeenCalled();
    h.ready(); h.get<HTMLInputElement>('control-confirm').checked = false;
    h.get('fleet-form').dispatchEvent(new h.doc.defaultView!.Event('input')); expect(h.get<HTMLButtonElement>('control-submit').disabled).toBe(true);
  });
  it('uses the reviewed revision despite polling, prevents duplicate submits and confirms only a real readback', async () => {
    let release!: (response: Response) => void; const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(r => { release = r; }));
    const h = setup(fetcher); h.ready(); h.view.update(data(2), true); h.submit(); h.submit();
    expect(fetcher).toHaveBeenCalledTimes(1); const options = fetcher.mock.calls[0]![1]!; const command = JSON.parse(options.body as string);
    expect(command).toMatchObject({ projectId: 'A', expectedRevision: 1, mode: 'controlled', reason: 'maintenance' });
    expect(options.headers).toMatchObject({ Authorization: 'Bearer read-only', 'X-Charterion-Control': 'fleet_' + 'c'.repeat(43) });
    release(Response.json({ requestId: command.requestId, revision: 2, changed: true }));
    await vi.waitFor(() => expect(h.get('control-result').dataset.state).toBe('success'));
    expect(h.reload).toHaveBeenCalledTimes(1); expect(h.get<HTMLInputElement>('control-confirm').checked).toBe(false);
    expect(h.doc.defaultView!.sessionStorage.length).toBe(0); expect(h.doc.defaultView!.location.hash).toBe('');
  });
  it('reports conflict without optimistic mutation and requires reloading the reviewed revision', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'REVISION_CONFLICT' }, { status: 409 }));
    const h = setup(fetcher); h.ready(); h.submit();
    await vi.waitFor(() => expect(h.get('control-result').textContent).toContain('版本或请求冲突'));
    expect(h.get('control-result').dataset.state).toBe('error'); expect(h.get('control-revision').textContent).toContain('Revision 1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('never claims success when an accepted write cannot be read back or was superseded', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => Response.json({ requestId: JSON.parse(options!.body as string).requestId, revision: 2, changed: true }));
    const h = setup(fetcher, vi.fn().mockResolvedValue(undefined)); h.ready(); h.submit();
    await vi.waitFor(() => expect(h.get('control-result').textContent).toContain('回读未确认'));
    expect(h.get('control-result').dataset.state).toBe('error'); expect(h.get('control-result').textContent).not.toContain('已保存');
  });
  it('clears authorization on disconnect or project change and reports ambiguous transport failure', async () => {
    const h = setup(vi.fn<typeof fetch>().mockRejectedValue(new Error('network lost'))); h.ready(); h.submit();
    await vi.waitFor(() => expect(h.get('control-result').textContent).toContain('可能已写入'));
    h.view.update(data(), false); expect(h.get<HTMLInputElement>('control-credential').value).toBe(''); expect(h.get<HTMLButtonElement>('control-submit').disabled).toBe(true);
    h.view.update(data(), true); h.ready(); const project = h.get<HTMLSelectElement>('control-project'); project.value = 'B'; project.dispatchEvent(new h.doc.defaultView!.Event('change'));
    expect(h.get<HTMLInputElement>('control-credential').value).toBe('');
  });
  it('clears an expired authorization and never retries an unauthorized operation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'CONTROL_AUTHORIZATION_REQUIRED' }, { status: 403 }));
    const h = setup(fetcher); h.ready(); h.submit(); await vi.waitFor(() => expect(h.get('control-result').textContent).toContain('授权无效'));
    expect(h.get<HTMLInputElement>('control-credential').value).toBe(''); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
