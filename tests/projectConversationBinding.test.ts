import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmRoleBinding } from '../src/browserRuntimeReporting';
import { readNativeControlSnapshot, reportNativeAgentBrowser } from '../src/nativeControl';
import type { ChatSnapshot, RoleBinding } from '../src/contracts';
import type { NativeControlSnapshot } from '../src/nativeControl';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControlDatabase } from '../control/src/database';
import { ControlPlane } from '../control/src/controlPlane';
import { createBindingRegistry } from '../src/bindingRegistry';

vi.mock('../src/nativeControl', () => ({
  readNativeControlSnapshot: vi.fn(), reportNativeAgentBrowser: vi.fn(), reportNativeAgentRuntime: vi.fn(), reportNativeIncident: vi.fn(),
}));
const binding: RoleBinding = { projectId: 'p', project: 'Project', role: 'chief_engineer', agentSlotId: 'slot', notes: '' };
const snapshot: ChatSnapshot = {
  conversationKey: 'conversation:first', conversationId: 'first', url: 'https://chatgpt.com/c/first', title: 'ChatGPT',
  status: 'idle', confidence: 'direct', signals: [], assistantMessageCount: 0, latestAssistantText: '', observedAt: 100,
};
function control(key?: string): NativeControlSnapshot {
  return {
    projects: [{ id: 'p', name: 'Project' }],
    agents: [{ id: 'slot', projectId: 'p', role: 'chief_engineer', desiredState: 'active', browserTabId: 7,
      browserLeaseId: 'lease', browserProfileId: 'profile', ...(key ? { conversationKey: key } : {}) }],
  } as NativeControlSnapshot;
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(readNativeControlSnapshot).mockResolvedValue(control()); });

describe('Kernel-backed project role projection', () => {
  it('runs the provisional-to-canonical flow against real Kernel state and restores it in a new Tab', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pcp-binding-flow-'));
    const db = new ControlDatabase(join(dir, 'global.db'));
    try {
      const plane = new ControlPlane(db);
      const t = Date.now() - 1000;
      const project = plane.createProject({ name: 'Project', rootPath: 'C:/binding-flow', minSlots: 0, maxSlots: 1 }, t);
      const slot = plane.createAgentSlot(project.id, 'chief_engineer', t);
      plane.reportAgentBrowser({ slotId: slot.id, profileId: 'profile', tabId: 7, browserState: 'open' }, t);
      plane.reportAgentRuntime({ slotId: slot.id, profileId: 'profile', tabId: 7, contentEpoch: 'epoch', revision: 1, pageStatus: 'idle', semanticSignature: 'blank', observedAt: t });
      vi.mocked(readNativeControlSnapshot).mockImplementation(async () => ({
        protocolVersion: 2, projects: plane.listProjects(), agents: plane.listAgentSlots(),
        resources: [], leases: [], changeRequests: [], reviews: [], mergeQueue: [],
        workerRequests: [], browserRuntime: [], events: [],
      }));
      vi.mocked(reportNativeAgentBrowser).mockImplementation(async (input) => { plane.reportAgentBrowser(input); });
      function area() {
        let data: Record<string, unknown> = {};
        return { async get(key: string) { return { [key]: data[key] }; }, async set(items: Record<string, unknown>) { data = { ...data, ...items }; } };
      }
      const local = area(), session = area();
      const registry = createBindingRegistry({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' }, confirmRoleBinding);
      const assigned = { ...binding, projectId: project.id, agentSlotId: slot.id };
      const { conversationId: _, ...blank } = snapshot;
      await registry.update(7, 'provisional:first', assigned);
      expect(await registry.resolve(7, { ...blank, conversationKey: 'provisional:first', url: 'https://chatgpt.com/' })).toEqual(assigned);
      await expect(registry.resolve(7, snapshot)).rejects.toThrow(/explicit bootstrap authorization/);
      expect(await registry.readPersistent()).toEqual({});
      plane.authorizeConversationBootstrap({ slotId: slot.id, projectId: project.id, role: slot.role, expectedLeaseEpoch: 0,
        profileId: 'profile', tabId: 7, provisionalKey: 'provisional:first', actor: 'human', reason: 'create role session' }, t + 1);
      plane.browser.planOperation({ id: 'first-prompt', idempotencyKey: 'first-prompt', operation: 'prompt.send', slotId: slot.id,
        tabId: 7, contentEpoch: 'epoch', conversationKey: 'provisional:first', preconditionsHash: 'blank', plannedAt: t + 2 });
      plane.browser.dispatchOperation('first-prompt', t + 3);
      expect(await registry.resolve(7, snapshot)).toEqual(assigned);
      expect(await registry.readPersistent()).toEqual({ 'conversation:first': assigned });
      await registry.clear(undefined, 7);
      plane.reportAgentBrowser({ slotId: slot.id, profileId: 'profile', browserState: 'absent' });
      plane.reportAgentBrowser({ slotId: slot.id, profileId: 'profile', browserState: 'opening', tabId: 8 });
      const restarted = createBindingRegistry({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' }, confirmRoleBinding);
      expect(await restarted.resolve(8, snapshot)).toEqual(assigned);
      expect((await restarted.resolve(8, { ...snapshot, conversationId: 'wrong', conversationKey: 'conversation:wrong', url: 'https://chatgpt.com/c/wrong' })).role).toBe('');
      expect(plane.getAgentSlot(slot.id).conversationKey).toBe('conversation:first');
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('confirms the first canonical URL through Kernel before it can become a durable projection', async () => {
    expect(await confirmRoleBinding(7, snapshot, binding, 'provisional:first')).toBe(true);
    expect(reportNativeAgentBrowser).toHaveBeenCalledWith(expect.objectContaining({ slotId: 'slot', profileId: 'profile', tabId: 7, conversationKey: 'conversation:first' }));
  });

  it('requires explicit provisional intent and actual URL/ID agreement', async () => {
    expect(await confirmRoleBinding(7, snapshot, binding)).toBe(false);
    expect(await confirmRoleBinding(7, { ...snapshot, url: 'https://chatgpt.com/c/wrong' }, binding, 'provisional:first')).toBe(false);
    expect(reportNativeAgentBrowser).not.toHaveBeenCalled();
  });

  it('does not relabel a tab which navigates away from its formal Conversation', async () => {
    vi.mocked(readNativeControlSnapshot).mockResolvedValue(control('conversation:formal'));
    expect(await confirmRoleBinding(7, snapshot, binding, 'provisional:first')).toBe(false);
    expect(await confirmRoleBinding(7, { ...snapshot, conversationKey: 'provisional:other' }, binding)).toBe(false);
    expect(reportNativeAgentBrowser).not.toHaveBeenCalled();
  });

  it.each([
    { ...binding, projectId: 'p2' }, { ...binding, project: 'another project' },
    { ...binding, role: 'supervisor' }, { ...binding, agentSlotId: 'other-slot' },
    { role: 'chief_engineer', project: 'Project', notes: '' },
  ])('refuses a foreign or unverifiable local binding %j', async (candidate) => {
    expect(await confirmRoleBinding(7, snapshot, candidate, 'provisional:first')).toBe(false);
    expect(reportNativeAgentBrowser).not.toHaveBeenCalled();
  });

  it('refuses another Tab and a suspended Slot', async () => {
    expect(await confirmRoleBinding(8, snapshot, binding, 'provisional:first')).toBe(false);
    const value = control(); value.agents[0]!.desiredState = 'suspended';
    vi.mocked(readNativeControlSnapshot).mockResolvedValue(value);
    expect(await confirmRoleBinding(7, snapshot, binding, 'provisional:first')).toBe(false);
  });

  it('propagates a Kernel denial so the registry cannot persist the binding', async () => {
    vi.mocked(reportNativeAgentBrowser).mockRejectedValue(new Error('Bootstrap not authorized'));
    await expect(confirmRoleBinding(7, snapshot, binding, 'provisional:first')).rejects.toThrow('Bootstrap not authorized');
  });
});
