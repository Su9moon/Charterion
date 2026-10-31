// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it.each(['disconnected', 'duplicate'] as const)('sends only after explicit ordinary tab selection and retains attributed reply history (%s)', async scenario => {
  document.documentElement.innerHTML = readFileSync(resolve(process.cwd(), 'src/sidepanel.html'), 'utf8');
  const tab = { tabId: 42, windowId: 1, active: true, binding: { role: '', project: '', notes: '' },
    snapshot: { conversationKey: 'conversation:ordinary', title: 'Ordinary chat', status: 'idle', confidence: 'direct',
      latestAssistantText: 'reply for ordinary', observedAt: Date.now() },
    lastAttempt: { state: 'reply-observed', replyMessageId: 'ordinary-reply-id' } };
  const now = Date.now();
  const owner = { ...tab, tabId: 1, binding: { agentSlotId: 'slot', projectId: 'project', role: 'Developer', project: 'Hive', notes: '' } };
  const snapshot = {
    browserRuntime: [], resources: [], changeRequests: [], workerRequests: [], reviews: [], mergeQueue: [],
    projects: [{ id: 'project', name: 'Hive', status: 'active' }],
    agents: [{ id: 'slot', projectId: 'project', role: 'Developer', status: 'assigned', desiredState: 'active',
      conversationKey: tab.snapshot.conversationKey, browserState: 'open', browserTabId: 1, browserProfileId: 'profile',
      browserLeaseId: 'lease', browserLeaseEpoch: 2, browserObservedAt: now, browserRuntimeObservedAt: now,
      browserPageStatus: 'idle', browserQuarantined: false, rolloverState: 'idle' }],
    leases: [{ id: 'lease', holderId: 'slot', projectId: 'project', epoch: 2, status: 'active', mode: 'exclusive', resourceId: 'browser-tab:profile:1' }],
  };
  const sendMessage = vi.fn(async (message: { type: string }) => {
    if (message.type === 'manager:control-snapshot') return scenario === 'duplicate' ? { ok: true, snapshot } : { ok: false, error: 'disconnected' };
    if (message.type === 'manager:list') return { ok: true, tabs: scenario === 'duplicate' ? [owner, tab] : [tab], tasks: [], messages: [], supervisorEnabled: false };
    if (message.type === 'manager:send') return { ok: true, results: [{ tabId: 42, ok: true }] };
    throw new Error(`Unexpected message ${message.type}`);
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage, onMessage: { addListener: vi.fn() } } });
  await import('../src/sidepanel');
  await vi.waitFor(() => expect(document.querySelector('#agents details input')).not.toBeNull());
  if (scenario === 'duplicate') {
    await vi.waitFor(() => expect(document.querySelectorAll('#agents > section input')).toHaveLength(1));
    expect(document.querySelectorAll('#agents details input')).toHaveLength(1);
  }
  expect(sendMessage.mock.calls.some(([message]) => message.type === 'manager:send')).toBe(false);
  document.getElementById('select-idle')!.click();
  expect((document.querySelector('#agents details input') as HTMLInputElement).checked).toBe(false);
  if (scenario === 'duplicate') {
    expect((document.querySelector('#agents > section input') as HTMLInputElement).checked).toBe(true);
    document.getElementById('clear-selection')!.click();
  }
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
