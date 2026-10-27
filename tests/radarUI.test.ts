import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountRadar } from '../dashboard/radar';
import { validatedRadarUrl } from '../src/radarLauncher';
import type { RadarSnapshot } from '../shared/radar';

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); vi.useRealTimers(); });
function snapshot(): RadarSnapshot {
  return { schemaVersion: 1, instanceId: 'isolated-test', observedAt: 1000, refreshAfterMs: 3000, observationTtlMs: 180000,
    projects: ['A', 'B'].map(id => ({ id, name: `Project ${id}`, rootPath: `test/${id}`, status: 'active', minSlots: 0, maxSlots: 1, fleet: { mode: 'elastic', lifecycleLocked: id === 'A', revision: 1 } })),
    agents: ['A', 'B'].map(projectId => ({ id: `slot-${projectId}`, projectId, role: 'chief_engineer', status: 'assigned', desiredState: 'active', browserState: 'open',
      conversationKey: `conversation:${projectId}`, conversationGeneration: 1, leaseEpoch: 1, rolloverState: 'idle', pageStatus: 'idle', observationState: 'fresh',
      browserObservedAt: 1000, runtimeObservedAt: 1000, browserTabId: 1, quarantined: false, error: null })),
    events: ['A', 'B'].map((projectId, i) => ({ seq: i + 1, projectId, type: 'AGENT_CREATED', subject: `slot-${projectId}`, createdAt: 1000 })) };
}
function setup(fetcher: typeof fetch) {
  const dom = new JSDOM(readFileSync('dashboard/index.html', 'utf8'), { url: 'http://127.0.0.1:34567/pcp/#read=' + 'r'.repeat(43) });
  const view = mountRadar(dom.window.document, dom.window as unknown as Window, fetcher);
  cleanup.push(() => { view.dispose(); dom.window.close(); });
  return { doc: dom.window.document, win: dom.window, view };
}

describe('standalone radar page', () => {
  it('filters identical roles by project, exposes status details, and renders untrusted text safely', async () => {
    const data = snapshot(); data.projects[0]!.name = '<img src=x onerror=alert(1)>';
    data.agents[0]!.error = '<script>private error</script>';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(data));
    const h = setup(fetcher); await vi.waitFor(() => expect(h.doc.body.dataset.state).toBe('connected'));
    expect(h.win.location.hash).toBe(''); expect(h.win.sessionStorage.getItem('charterion.radar.read')).toBe('r'.repeat(43));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer ' + 'r'.repeat(43) });
    expect(h.doc.querySelectorAll('.agent')).toHaveLength(2); expect(h.doc.querySelector('img')).toBeNull();
    const filter = h.doc.querySelector<HTMLSelectElement>('#project-filter')!; filter.value = 'A'; filter.dispatchEvent(new h.win.Event('change'));
    expect(h.doc.querySelectorAll('.agent')).toHaveLength(1); expect(h.doc.querySelectorAll('.event')).toHaveLength(1);
    expect(h.doc.querySelector('#events')?.textContent).not.toContain('slot-B');
    h.doc.querySelector<HTMLButtonElement>('.agent button')!.click();
    expect(h.doc.querySelector('#details')?.textContent).toContain('conversation:A');
    expect(h.doc.querySelector('#details')?.textContent).toContain('<script>private error</script>');
    expect(h.doc.querySelector('#details script')).toBeNull(); expect(h.doc.querySelector('#details')?.textContent).toContain('锁定');
  });

  it('marks retained state historical on failures, preserves it, and recovers real updates', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(snapshot())).mockRejectedValueOnce(new Error('offline'));
    const h = setup(fetcher); await vi.waitFor(() => expect(h.doc.body.dataset.state).toBe('connected'));
    await h.view.refresh(); expect(h.doc.body.dataset.state).toBe('unavailable');
    expect(h.doc.querySelector('#connection-detail')?.textContent).toContain('历史快照');
    expect(h.doc.querySelector('.agent')?.textContent).toContain('不可用 · 历史快照');
    expect(h.doc.querySelector('#online-count')?.textContent).toBe('—'); expect(h.doc.querySelectorAll('.agent')).toHaveLength(2);
    const changed = snapshot(); changed.projects[0]!.fleet.lifecycleLocked = false; changed.agents[0]!.observationState = 'unavailable';
    fetcher.mockResolvedValueOnce(Response.json(changed)); await h.view.refresh();
    expect(h.doc.body.dataset.state).toBe('connected'); expect(h.doc.querySelector('#locked-count')?.textContent).toBe('0');
    expect(h.doc.querySelector('.agent')?.textContent).toContain('观测过期');
  });

  it('has no fabricated data on initial failure and explains expired authorization', async () => {
    const h = setup(vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 })));
    await vi.waitFor(() => expect(h.doc.body.dataset.state).toBe('unavailable'));
    expect(h.doc.querySelector('#connection-detail')?.textContent).toContain('从 Chrome 插件重新打开');
    expect(h.doc.querySelector('#project-count')?.textContent).toBe('—'); expect(h.doc.querySelectorAll('.agent')).toHaveLength(0);
  });

  it('fails closed on malformed data and retains keyboard focus across refresh', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(snapshot()));
    const h = setup(fetcher); await vi.waitFor(() => expect(h.doc.body.dataset.state).toBe('connected'));
    const inspect = h.doc.querySelector<HTMLButtonElement>('[data-inspect-slot]')!; inspect.focus();
    await h.view.refresh(); expect(h.doc.activeElement?.getAttribute('data-inspect-slot')).toBe('slot-A');
    fetcher.mockResolvedValueOnce(Response.json({ ...snapshot(), projects: [null] }));
    await h.view.refresh(); expect(h.doc.body.dataset.state).toBe('unavailable');
    expect(h.doc.querySelectorAll('.agent')).toHaveLength(2);
  });

  it('does not present an old idle page as healthy when the current browser is in error', async () => {
    const data = snapshot(); data.agents[0]!.browserState = 'error'; data.agents[0]!.pageStatus = 'idle';
    const h = setup(vi.fn<typeof fetch>().mockResolvedValue(Response.json(data)));
    await vi.waitFor(() => expect(h.doc.body.dataset.state).toBe('connected'));
    const row = h.doc.querySelector('.agent')!;
    expect(row.querySelector('.tag.bad')?.textContent).toBe('错误'); expect(row.querySelector('.tag.good')).toBeNull();
  });

  it('polls every three seconds without overlapping requests', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(snapshot()));
    const h = setup(fetcher); await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2); h.view.dispose();
    await vi.advanceTimersByTimeAsync(30000); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('times out hanging requests and visibly reports unavailable', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const h = setup(fetcher); await vi.advanceTimersByTimeAsync(8000);
    expect(h.doc.body.dataset.state).toBe('unavailable'); expect(h.doc.querySelector('#connection-detail')?.textContent).toContain('尚无可用快照');
  });

  it('validates the Kernel URL before any extension tab is created', () => {
    const valid = `http://127.0.0.1:49152/pcp/#read=${'r'.repeat(43)}`; expect(validatedRadarUrl(valid)).toBe(valid);
    expect(validatedRadarUrl(valid.replace(':49152', ':80'))).toBe(valid.replace(':49152', ''));
    for (const url of ['https://example.com/pcp/', 'http://0.0.0.0:3000/pcp/', 'javascript:alert(1)', valid.replace('/pcp/', '/admin/'),
      valid.replace('/pcp/', '/pcp/?adminToken=secret'), valid.replace('127.0.0.1', 'user@127.0.0.1'), valid.slice(0, -1)]) expect(() => validatedRadarUrl(url)).toThrow();
  });
});
