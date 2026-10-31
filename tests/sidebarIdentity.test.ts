// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderSidebarGroups, sidebarIdentities } from '../src/sidebarIdentity';
import type { ManagedTab } from '../src/contracts';
import type { NativeControlSnapshot } from '../src/nativeControl';

const now = 100_000;
function tab(tabId = 1): ManagedTab {
  return { tabId, windowId: 1, active: false,
    binding: { agentSlotId: 'slot', projectId: 'project', role: 'Developer', project: 'Hive', notes: '' },
    snapshot: { conversationKey: 'conversation:abc', title: 'ChatGPT', url: 'https://chatgpt.com/c/abc',
      status: 'idle', confidence: 'direct', signals: [], assistantMessageCount: 0, latestAssistantText: '', observedAt: now } };
}
function kernel(): NativeControlSnapshot {
  return { projects: [{ id: 'project', status: 'active' }], agents: [{ id: 'slot', projectId: 'project', role: 'Developer',
    status: 'idle', desiredState: 'active', browserState: 'open', browserTabId: 1, browserProfileId: 'profile',
    conversationKey: 'conversation:abc', browserLeaseId: 'lease', browserLeaseEpoch: 2, browserObservedAt: now,
    browserRuntimeObservedAt: now, browserPageStatus: 'idle', browserQuarantined: false, rolloverState: 'idle' }],
    leases: [{ id: 'lease', holderId: 'slot', projectId: 'project', epoch: 2, status: 'active', mode: 'exclusive',
      resourceId: 'browser-tab:profile:1' }] } as NativeControlSnapshot;
}

describe('sidebar authority and grouping', () => {
  it('separates mixed tabs and never promotes a duplicate conversation to another Developer', () => {
    const ordinary = tab(3); ordinary.binding = { role: '', project: '', notes: '' }; ordinary.snapshot.conversationKey = 'conversation:other';
    const identities = sidebarIdentities([tab(), tab(2), ordinary], kernel(), now);
    expect(identities.map(x => x.state)).toEqual(['managed', 'ordinary', 'ordinary']);
    expect(identities.map(x => x.idle)).toEqual([true, false, false]);
    expect(identities.slice(0, 2).every(x => x.duplicate)).toBe(true);
    expect(identities[1]!.agent?.id).toBe('slot');
  });

  it('collapses ordinary tabs by default and preserves explicit expansion and selection', () => {
    const selected = new Set<number>();
    const identities = sidebarIdentities([tab(2)], kernel(), now);
    let expanded = false;
    const render = (identity: typeof identities[number]) => {
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.checked = selected.has(identity.tab.tabId);
      checkbox.addEventListener('change', () => selected.add(identity.tab.tabId)); return checkbox;
    };
    const nodes = renderSidebarGroups(identities, render, expanded, open => { expanded = open; });
    const details = nodes[1] as HTMLDetailsElement;
    expect(details.open).toBe(false);
    details.open = true; details.dispatchEvent(new Event('toggle'));
    details.querySelector('input')!.dispatchEvent(new Event('change'));
    expect(selected.has(2)).toBe(true);
    expect((renderSidebarGroups(identities, render, expanded, () => {})[1] as HTMLDetailsElement).open).toBe(true);
  });

  it('fails closed for disconnected Kernel and locally cached role metadata', () => {
    expect(sidebarIdentities([tab()], undefined, now)[0]).toMatchObject({ state: 'stale', idle: false });
    const ordinary = tab(); ordinary.binding = { role: '', project: '', notes: '' };
    expect(sidebarIdentities([ordinary], undefined, now)[0]?.state).toBe('ordinary');
    expect(sidebarIdentities([ordinary], kernel(), now)[0]?.state).toBe('stale');
  });

  it.each(['expired', 'epoch', 'project', 'stale', 'quarantine', 'canonical', 'binding', 'resource'])(
    'rejects invalid authority: %s', fault => {
      const snapshot = kernel(); const browser = tab();
      if (fault === 'expired') snapshot.leases[0]!.expiresAt = now;
      if (fault === 'epoch') snapshot.leases[0]!.epoch++;
      if (fault === 'project') snapshot.projects[0]!.status = 'archived';
      if (fault === 'stale') snapshot.agents[0]!.browserObservedAt = 1;
      if (fault === 'quarantine') snapshot.agents[0]!.browserQuarantined = true;
      if (fault === 'canonical') browser.snapshot.conversationKey = 'url:https://chatgpt.com/c/abc';
      if (fault === 'binding') browser.binding.agentSlotId = 'old';
      if (fault === 'resource') snapshot.leases[0]!.resourceId = 'browser-tab:other:1';
      expect(sidebarIdentities([browser], snapshot, now)[0]).toMatchObject({ state: 'stale', idle: false });
    });

  it('marks conflicting canonical mappings ambiguous', () => {
    const snapshot = kernel(); snapshot.agents.push({ ...snapshot.agents[0]!, id: 'other' });
    expect(sidebarIdentities([tab()], snapshot, now)[0]).toMatchObject({ state: 'ambiguous', idle: false });
  });

  it('excludes busy, unknown and inferred idle observations from default selection', () => {
    for (const status of ['generating', 'unknown'] as const) {
      const browser = tab(); browser.snapshot.status = status;
      expect(sidebarIdentities([browser], kernel(), now)[0]?.idle).toBe(false);
    }
    const browser = tab(); browser.snapshot.confidence = 'inferred';
    expect(sidebarIdentities([browser], kernel(), now)[0]?.idle).toBe(false);
    const snapshot = kernel(); snapshot.agents[0]!.status = 'assigned';
    expect(sidebarIdentities([tab()], snapshot, now)[0]?.idle).toBe(false);
  });
});
