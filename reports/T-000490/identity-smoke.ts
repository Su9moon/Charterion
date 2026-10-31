import assert from 'node:assert/strict';
import { sidebarIdentities } from '../../src/sidebarIdentity.ts';
const now = 100_000;
function tab(tabId = 1) {
  return { tabId, windowId: 1, active: false,
    binding: { agentSlotId: 'slot', projectId: 'project', role: 'Developer', project: 'Hive', notes: '' },
    snapshot: { conversationKey: 'conversation:abc', title: 'ChatGPT', url: 'https://chatgpt.com/c/abc',
      status: 'idle', confidence: 'direct', signals: [], assistantMessageCount: 0, latestAssistantText: '', observedAt: now } };
}
function kernel() {
  return { projects: [{ id: 'project', name: 'Hive', status: 'active' }], agents: [{ id: 'slot', projectId: 'project', role: 'Developer',
    status: 'idle', desiredState: 'active', browserState: 'open', browserTabId: 1, browserProfileId: 'profile',
    conversationKey: 'conversation:abc', browserLeaseId: 'lease', browserLeaseEpoch: 2, browserObservedAt: now,
    browserRuntimeObservedAt: now, browserPageStatus: 'idle', browserQuarantined: false, rolloverState: 'idle' }],
    leases: [{ id: 'lease', holderId: 'slot', projectId: 'project', epoch: 2, status: 'active', mode: 'exclusive',
      resourceId: 'browser-tab:profile:1' }] };
}


for (const status of ['idle', 'assigned']) {
  const snapshot = kernel(); snapshot.agents[0].status = status;
  assert.equal(sidebarIdentities([tab()], snapshot, now)[0].idle, true);
  for (const state of ['generating', 'unknown']) {
    const browser = tab(); browser.snapshot.status = state;
    assert.equal(sidebarIdentities([browser], snapshot, now)[0].idle, false);
    const busy = structuredClone(snapshot); busy.agents[0].browserPageStatus = state;
    assert.equal(sidebarIdentities([tab()], busy, now)[0].idle, false);
  }
}
for (const field of ['role', 'project']) {
  const browser = tab(); browser.binding[field] = 'stale';
  assert.equal(sidebarIdentities([browser], kernel(), now)[0].state, 'stale');
}
assert.deepEqual(sidebarIdentities([tab(), tab(2)], kernel(), now).map(x => [x.state, x.idle]), [['managed', true], ['ordinary', false]]);
assert.equal(sidebarIdentities([tab()], undefined, now)[0].idle, false);
const expired = kernel(); expired.leases[0].expiresAt = now;
assert.equal(sidebarIdentities([tab()], expired, now)[0].idle, false);
console.log('PASS: direct production TypeScript identity smoke; DOM/send tests remain blocked');
