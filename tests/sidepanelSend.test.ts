// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('sends only after explicit ordinary tab selection and retains attributed reply history', async () => {
  document.documentElement.innerHTML = readFileSync(new URL('../src/sidepanel.html', import.meta.url), 'utf8');
  const tab = { tabId: 42, windowId: 1, active: true, binding: { role: '', project: '', notes: '' },
    snapshot: { conversationKey: 'conversation:ordinary', title: 'Ordinary chat', status: 'idle', confidence: 'direct',
      latestAssistantText: 'reply for ordinary', observedAt: Date.now() },
    lastAttempt: { state: 'reply-observed', replyMessageId: 'ordinary-reply-id' } };
  const sendMessage = vi.fn(async (message: { type: string }) => {
    if (message.type === 'manager:control-snapshot') return { ok: false, error: 'disconnected' };
    if (message.type === 'manager:list') return { ok: true, tabs: [tab], tasks: [], messages: [], supervisorEnabled: false };
    if (message.type === 'manager:send') return { ok: true, results: [{ tabId: 42, ok: true }] };
    throw new Error(`Unexpected message ${message.type}`);
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage, onMessage: { addListener: vi.fn() } } });
  await import('../src/sidepanel');
  await vi.waitFor(() => expect(document.querySelector('#agents details input')).not.toBeNull());
  expect(sendMessage.mock.calls.some(([message]) => message.type === 'manager:send')).toBe(false);
  document.getElementById('select-idle')!.click();
  expect((document.querySelector('#agents input') as HTMLInputElement).checked).toBe(false);
  const ordinary = document.querySelector('#agents details') as HTMLDetailsElement;
  expect(ordinary.open).toBe(false);
  ordinary.open = true;
  (ordinary.querySelector('input') as HTMLInputElement).click();
  (document.getElementById('instruction') as HTMLTextAreaElement).value = 'explicit ordinary instruction';
  document.getElementById('send-selected')!.click();
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'manager:send', tabIds: [42], text: 'explicit ordinary instruction' }));
  expect(document.getElementById('agents')!.textContent).toContain('ordinary-reply-id');
  expect(document.getElementById('agents')!.textContent).toContain('reply for ordinary');
  expect(sendMessage.mock.calls.filter(([message]) => message.type === 'manager:send')).toHaveLength(1);
});
