import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSnapshot, ContentRequest, RuntimeNotice } from '../src/contracts';

const adapter = vi.hoisted(() => ({ snapshot: undefined as ChatSnapshot | undefined, send: vi.fn() }));
vi.mock('../src/chatgptAdapter', () => ({
  PromptSubmissionError: class extends Error {},
  sendPrompt: adapter.send,
  snapshotFromDocument: () => ({ ...adapter.snapshot! }),
  snapshotSemanticKey: (s: ChatSnapshot) => JSON.stringify([s.conversationKey, s.status, s.latestAssistantText]),
}));

describe('content reply observation revisions', () => {
  let listener: (message: ContentRequest, sender: unknown, respond: (value: any) => void) => boolean;
  let changed: () => void;
  let acceptedRevision: number;
  let rejectReplies: boolean;
  let notices: RuntimeNotice[];
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    adapter.send.mockReset().mockResolvedValue(undefined);
    adapter.snapshot = { conversationKey: 'provisional:tab', title: 'ChatGPT', url: 'https://chatgpt.com/', status: 'idle',
      confidence: 'direct', signals: [], assistantMessageCount: 0, latestAssistantText: '', observedAt: Date.now() };
    acceptedRevision = 0;
    rejectReplies = false;
    notices = [];
    storage = new Map();
    vi.stubGlobal('document', { documentElement: {}, addEventListener: vi.fn() });
    vi.stubGlobal('window', { addEventListener: vi.fn(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout });
    vi.stubGlobal('location', { href: 'https://chatgpt.com/' });
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
    vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { changed = callback; } observe() {} });
    vi.stubGlobal('chrome', { runtime: {
      onMessage: { addListener: (fn: typeof listener) => { listener = fn; } },
      sendMessage: vi.fn(async (notice: RuntimeNotice) => {
        notices.push(notice);
        if (notice.type !== 'content:changed' && notice.type !== 'content:reply-observed') return;
        // Kernel reportRuntime requires a strictly increasing revision, including
        // the reply report that follows content:changed for the same snapshot.
        if (notice.observation.revision <= acceptedRevision || (notice.type === 'content:reply-observed' && rejectReplies)) return { ok: false };
        acceptedRevision = notice.observation.revision;
        return { ok: true };
      }),
    } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function request(message: ContentRequest): Promise<any> {
    return new Promise(resolve => listener(message, {}, resolve));
  }
  async function startPrompt() {
    await import('../src/content');
    const recovery = await request({ type: 'content:get-recovery-state' });
    await request({ type: 'content:send', attemptId: 'one-attempt', expectedContentEpoch: recovery.state.observation.contentEpoch, text: 'marker' });
  }
  async function publishReply() {
    adapter.snapshot = { ...adapter.snapshot!, conversationKey: 'conversation:canonical', assistantMessageCount: 1,
      latestAssistantMessageId: 'reply-id', latestAssistantText: 'marker_OK', observedAt: Date.now() };
    changed();
    await vi.advanceTimersByTimeAsync(180);
  }

  it('durably acknowledges the first canonical reply after its status observation', async () => {
    await startPrompt();
    await publishReply();
    const reply = notices.find(n => n.type === 'content:reply-observed');
    expect(reply?.type).toBe('content:reply-observed');
    if (reply?.type !== 'content:reply-observed') throw new Error('Missing reply notice');
    const status = notices.find(n => n.type === 'content:changed' && n.snapshot.conversationKey === 'conversation:canonical');
    expect(status && 'observation' in status && reply.observation.revision > status.observation.revision).toBe(true);
    expect(storage.has('charterion.pending-prompt.v1')).toBe(false);
    changed();
    await vi.advanceTimersByTimeAsync(180);
    expect(notices.filter(n => n.type === 'content:reply-observed')).toHaveLength(1);
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  it('retains rejected reply evidence and retries observation without resending the prompt', async () => {
    await startPrompt();
    rejectReplies = true;
    await publishReply();
    expect(storage.has('charterion.pending-prompt.v1')).toBe(true);
    rejectReplies = false;
    changed();
    await vi.advanceTimersByTimeAsync(180);
    expect(storage.has('charterion.pending-prompt.v1')).toBe(false);
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });
});
