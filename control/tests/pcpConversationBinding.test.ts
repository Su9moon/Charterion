import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlDatabase } from '../src/database';
import { ControlPlane } from '../src/controlPlane';
import { RpcRouter } from '../src/rpc';

const cleanup: Array<() => void> = [];
function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'pcp-conversation-'));
  const path = join(dir, 'global.db');
  let db = new ControlDatabase(path);
  let plane = new ControlPlane(db);
  cleanup.push(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const project = plane.createProject({ name: 'Project A', rootPath: 'C:/pcp-a', minSlots: 0, maxSlots: 2 }, 1);
  const slot = plane.createAgentSlot(project.id, 'chief_engineer', 2);
  const report = { slotId: slot.id, profileId: 'gam-default', browserState: 'open' as const, tabId: 10 };
  plane.reportAgentBrowser(report, 10);
  plane.reportAgentRuntime({ ...report, contentEpoch: 'epoch-one', revision: 1, semanticSignature: 'blank', pageStatus: 'idle', observedAt: 11 });
  const authorization = { slotId: slot.id, projectId: project.id, role: slot.role, expectedLeaseEpoch: 0,
    profileId: report.profileId, tabId: report.tabId, provisionalKey: 'provisional:page-one', actor: 'human-controller', reason: 'first session' };
  const dispatch = (key = authorization.provisionalKey, time = 13) => {
    plane.browser.planOperation({ id: `attempt-${time}`, idempotencyKey: `attempt-${time}`, operation: 'prompt.send', slotId: slot.id,
      tabId: 10, contentEpoch: 'epoch-one', conversationKey: key, preconditionsHash: 'hash', plannedAt: time });
    plane.browser.dispatchOperation(`attempt-${time}`, time + 1);
  };
  return { get plane() { return plane; }, get db() { return db; }, project, slot, report, authorization, dispatch,
    reopen() { db.close(); db = new ControlDatabase(path); plane = new ControlPlane(db); } };
}
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); });

describe('project role Conversation authority', () => {
  it('does not promote a canonical URL based on browser observation alone', () => {
    const h = harness();
    h.dispatch();
    const before = h.plane.listEvents(h.project.id);
    expect(() => h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:unapproved' }, 20)).toThrow(/explicit bootstrap authorization/);
    expect(h.plane.getAgentSlot(h.slot.id).conversationKey).toBeUndefined();
    expect(h.plane.listEvents(h.project.id)).toEqual(before);
    expect(h.plane.conversations.listConversations()).toEqual([]);
  });

  it('authorizes one project/role/tab, accepts the first canonical id, and survives restart', () => {
    const h = harness();
    h.plane.authorizeConversationBootstrap(h.authorization, 12);
    h.dispatch();
    h.reopen();
    const bound = h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:first' }, 20);
    expect(bound).toMatchObject({ projectId: h.project.id, role: 'chief_engineer', conversationKey: 'conversation:first', conversationGeneration: 1, leaseEpoch: 1 });
    h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:first' }, 21);
    expect(() => h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:next' }, 22)).toThrow(/cannot rebind/);
    h.plane.reportAgentBrowser({ slotId: h.slot.id, profileId: 'gam-default', browserState: 'absent' }, 23);
    h.reopen();
    expect(h.plane.getAgentSlot(h.slot.id)).toMatchObject({ conversationKey: 'conversation:first', browserState: 'absent' });
    expect(h.plane.conversations.listConversations(h.slot.id)).toHaveLength(1);
    expect(h.plane.listEvents(h.project.id).filter((e) => e.type === 'CONVERSATION_BOOTSTRAP_BOUND')).toMatchObject([
      { payload: { actor: 'human-controller', reason: 'first session', role: 'chief_engineer', attemptId: 'attempt-13' } },
    ]);
  });

  it('requires dispatch evidence for the authorized provisional identity and rejects another tab', () => {
    const h = harness();
    h.plane.authorizeConversationBootstrap(h.authorization, 12);
    expect(() => h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:first' }, 20)).toThrow(/dispatched bootstrap prompt/);
    h.dispatch('provisional:wrong-page');
    expect(() => h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:first' }, 20)).toThrow(/dispatched bootstrap prompt/);
    h.dispatch(h.authorization.provisionalKey, 15);
    expect(() => h.plane.reportAgentBrowser({ ...h.report, tabId: 11, conversationKey: 'conversation:first' }, 20)).toThrow(/explicit bootstrap authorization/);
    expect(h.db.db.prepare('SELECT consumed_key FROM conversation_bootstrap_authorizations').get()).toMatchObject({ consumed_key: null });
    expect(h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:first' }, 21).conversationKey).toBe('conversation:first');
  });

  it.each(['project', 'role', 'revision', 'address', 'provisional'])('rejects an authorization with wrong %s', (field) => {
    const h = harness();
    const invalid = { ...h.authorization,
      ...(field === 'project' ? { projectId: 'another-project' } : {}),
      ...(field === 'role' ? { role: 'supervisor' } : {}),
      ...(field === 'revision' ? { expectedLeaseEpoch: 1 } : {}),
      ...(field === 'address' ? { tabId: 11 } : {}),
      ...(field === 'provisional' ? { provisionalKey: 'conversation:existing' } : {}),
    };
    expect(() => h.plane.authorizeConversationBootstrap(invalid, 12)).toThrow();
    expect(h.db.db.prepare('SELECT * FROM conversation_bootstrap_authorizations').all()).toEqual([]);
  });

  it.each(['expired', 'lease-changed'])('rejects a %s grant', (reason) => {
    const h = harness();
    h.plane.authorizeConversationBootstrap(h.authorization, 12);
    h.dispatch();
    if (reason === 'lease-changed') {
      h.plane.reportAgentBrowser({ slotId: h.slot.id, profileId: 'gam-default', browserState: 'absent' }, 16);
      h.plane.reportAgentBrowser(h.report, 17);
    }
    expect(() => h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:first' }, reason === 'expired' ? 700_000 : 20)).toThrow(/explicit bootstrap authorization/);
  });

  it('refuses cross-project binding even for identical roles and retired source Slots', () => {
    const h = harness();
    h.plane.bindAgentConversation(h.slot.id, 'conversation:owned', 12);
    h.plane.reportAgentBrowser({ slotId: h.slot.id, profileId: 'gam-default', browserState: 'absent' }, 13);
    h.plane.retireAgentSlot(h.slot.id, 14);
    const b = h.plane.createProject({ name: 'Project B', rootPath: 'C:/pcp-b', minSlots: 0, maxSlots: 1 }, 15);
    const target = h.plane.createAgentSlot(b.id, h.slot.role, 16);
    expect(() => h.plane.bindAgentConversation(target.id, 'conversation:owned', 17)).toThrow(/another project/);
    expect(() => h.plane.reportAgentBrowser({ ...h.report, slotId: target.id, conversationKey: 'conversation:owned' }, 18)).toThrow(/another project/);
    expect(h.plane.getAgentSlot(target.id).conversationKey).toBeUndefined();
    expect(h.db.health().ok).toBe(true);
  });

  it('cannot extend an expired authorization by backdating the browser observation', () => {
    const h = harness();
    h.plane.authorizeConversationBootstrap(h.authorization, 12);
    h.dispatch();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(700_000);
    try {
      const router = new RpcRouter(h.plane, 'admin', 'browser');
      expect(router.handle({ id: 'backdated', method: 'agent.browser-report', auth: { browserToken: 'browser' }, params: {
        ...h.report, conversationKey: 'conversation:first', observedAt: 20,
      } })).toMatchObject({ ok: false, error: { message: expect.stringContaining('explicit bootstrap authorization') } });
      expect(h.plane.getAgentSlot(h.slot.id).conversationKey).toBeUndefined();
      expect(h.db.db.prepare('SELECT consumed_key FROM conversation_bootstrap_authorizations').get()).toMatchObject({ consumed_key: null });
    } finally { clock.mockRestore(); }
  });

  it('requires admin bootstrap authorization and prevents automatic rollover in any project', () => {
    const h = harness();
    const router = new RpcRouter(h.plane, 'admin', 'browser', 'instance');
    const call = (method: string, params: Record<string, unknown>, auth = { browserToken: 'browser' } as { browserToken?: string; adminToken?: string }) =>
      router.handle({ id: method, method, params, auth, instanceId: 'instance' });
    expect(call('agent.conversation-bootstrap-authorize', h.authorization)).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(call('agent.conversation-bootstrap-authorize', h.authorization, { adminToken: 'admin' })).toMatchObject({ ok: true });
    h.plane.bindAgentConversation(h.slot.id, 'conversation:owned', 12);
    const params = { slotId: h.slot.id, reason: 'conversation-limit', handoffText: 'handoff', state: {} };
    expect(call('agent.rollover-request', params)).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    const requested = call('agent.rollover-request', params, { adminToken: 'admin' });
    expect(requested).toMatchObject({ ok: true });
    if (!requested.ok) throw new Error('Admin rollover request failed');
    const rolloverId = (requested.result as { id: string }).id;
    expect(call('agent.rollover-begin', { slotId: h.slot.id, rolloverId })).toMatchObject({ ok: true });
  });

  it('refuses legacy unapproved rollover intent and source-page reuse', () => {
    const h = harness();
    h.plane.bindAgentConversation(h.slot.id, 'conversation:source', 12);
    const rollover = h.plane.requestAgentConversationRollover(h.slot.id, 'legacy auto', 'handoff', {}, 13);
    const router = new RpcRouter(h.plane, 'admin', 'browser');
    expect(router.handle({ id: 'begin', method: 'agent.rollover-begin', params: { slotId: h.slot.id, rolloverId: rollover.id }, auth: { browserToken: 'browser' } }))
      .toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    h.plane.beginAgentConversationRollover(h.slot.id, rollover.id, 14);
    expect(() => h.plane.reportAgentBrowser({ ...h.report, conversationKey: 'conversation:source' }, 15)).toThrow(/source Conversation/);
    expect(h.plane.getAgentSlot(h.slot.id).conversationKey).toBeUndefined();
  });
});
