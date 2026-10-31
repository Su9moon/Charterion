import type { NativeControlSnapshot } from './nativeControl';

/** Binding metadata is never promoted to a browser online observation. */
export function projectGroupCards(snapshot: NativeControlSnapshot, cards: HTMLElement[]): HTMLElement[] {
  const grouped = new Set<string>();
  const groups = (snapshot.projectGroups ?? []).map(group => {
    const node = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${group.name} · ${group.id}`;
    const lead = document.createElement('div');
    lead.className = 'control-agent-row';
    lead.textContent = [group.leadRole, group.leadIdentity, group.leadConversationKey, 'project scope · Group Conversation', 'Role Charter NOT_VERIFIED', 'PENDING_RUNTIME · managed Tab/lease NOT_VERIFIED'].join(' · ');
    node.append(summary, lead);
    for (const member of group.members) {
      const index = snapshot.projects.findIndex(project => project.id === member.projectId);
      if (index >= 0 && cards[index]) { grouped.add(member.projectId); node.append(cards[index]!); }
    }
    return node;
  });
  return [...groups, ...cards.filter((_, index) => !grouped.has(snapshot.projects[index]!.id))];
}
