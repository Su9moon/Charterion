import type { ManagedTab } from './contracts';
import type { ControlAgentView, NativeControlSnapshot } from './nativeControl';

export interface SidebarIdentity {
  tab: ManagedTab;
  state: 'managed' | 'ordinary' | 'ambiguous' | 'stale';
  agent?: ControlAgentView;
  duplicate: boolean;
  idle: boolean;
}

/** Browser metadata can corroborate Kernel authority, but cannot create it. */
export function sidebarIdentities(tabs: readonly ManagedTab[], snapshot?: NativeControlSnapshot, now = Date.now()): SidebarIdentity[] {
  return tabs.map<SidebarIdentity>(tab => {
    const key = tab.snapshot.conversationKey;
    const canonical = /^conversation:[^\s:]+$/.test(key);
    const candidates = canonical ? snapshot?.agents.filter(agent => agent.conversationKey === key) ?? [] : [];
    const duplicate = tabs.filter(other => other.snapshot.conversationKey === key).length > 1;
    const base = { tab, duplicate, idle: false };
    if (candidates.length > 1) return { ...base, state: 'ambiguous' };
    const agent = candidates[0];
    const claimed = Boolean(tab.binding.agentSlotId || tab.binding.projectId || tab.binding.role);
    if (!agent) return { ...base, state: claimed ? 'stale' : 'ordinary' };
    // Additional tabs are instances of the conversation, never additional official agents.
    if (agent.browserTabId !== tab.tabId) return { ...base, state: 'ordinary', agent };
    const project = snapshot!.projects.find(project => project.id === agent.projectId);
    const leases = snapshot!.leases.filter(lease => lease.id === agent.browserLeaseId);
    const lease = leases.length === 1 ? leases[0] : undefined;
    const fresh = (time?: number) => time !== undefined && time <= now && now - time <= 30_000;
    const verified = project?.status === 'active' && agent.desiredState === 'active' &&
      !['suspended', 'retired'].includes(agent.status) && agent.browserState === 'open' &&
      !agent.browserQuarantined && agent.rolloverState === 'idle' &&
      tab.binding.agentSlotId === agent.id && tab.binding.projectId === agent.projectId &&
      tab.binding.role === agent.role && tab.binding.project === project.name &&
      fresh(agent.browserObservedAt) && fresh(tab.snapshot.observedAt) &&
      lease?.status === 'active' && lease.holderId === agent.id && lease.projectId === agent.projectId &&
      lease.epoch === agent.browserLeaseEpoch && lease.mode === 'exclusive' &&
      lease.resourceId === `browser-tab:${agent.browserProfileId}:${tab.tabId}` &&
      (lease.expiresAt === undefined || lease.expiresAt > now);
    return { ...base, agent, state: verified ? 'managed' : 'stale',
      idle: Boolean(verified && ['idle', 'assigned'].includes(agent.status) && agent.browserPageStatus === 'idle' &&
        fresh(agent.browserRuntimeObservedAt) && tab.snapshot.status === 'idle' && tab.snapshot.confidence === 'direct') };
  });
}

export function renderSidebarGroups(
  identities: readonly SidebarIdentity[], renderTab: (identity: SidebarIdentity) => HTMLElement,
  ordinaryOpen: boolean, onToggle: (open: boolean) => void,
): HTMLElement[] {
  const managed = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = 'Kernel verified Agents';
  managed.append(heading);
  for (const identity of identities.filter(identity => identity.state === 'managed')) {
    const group = document.createElement('section');
    const label = document.createElement('h4');
    label.textContent = `AgentSlot ${identity.agent!.id} · lease owner`;
    group.append(label, renderTab(identity));
    managed.append(group);
  }
  const ordinary = document.createElement('details');
  ordinary.open = ordinaryOpen;
  ordinary.addEventListener('toggle', () => onToggle(ordinary.open));
  const summary = document.createElement('summary');
  const others = identities.filter(identity => identity.state !== 'managed');
  summary.textContent = `Ordinary ChatGPT tabs / non-verified (${others.length})`;
  ordinary.append(summary, ...others.map(renderTab));
  return [managed, ordinary];
}
