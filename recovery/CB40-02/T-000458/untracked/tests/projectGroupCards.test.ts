// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { projectGroupCards } from '../src/projectGroupCards';
import type { NativeControlSnapshot } from '../src/nativeControlLegacy';

it('renders one expandable joint group and preserves standalone projects', () => {
  const projects = ['Hive', 'CB', 'Standalone'].map(id => ({ id, name: id }));
  const snapshot = { projects, projectGroups: [{ id: 'joint', name: 'CB × Hive', leadRole: 'chief_engineer', leadIdentity: 'chief', leadConversationKey: 'conversation:chief', members: projects.slice(0, 2).map(p => ({ projectId: p.id, developerSlotId: p.id })) }] } as NativeControlSnapshot;
  const cards = projects.map(p => { const card = document.createElement('article'); card.textContent = p.name + ' developer'; return card; });
  const nodes = projectGroupCards(snapshot, cards);
  expect(nodes).toHaveLength(2);
  expect(nodes[0]!.tagName).toBe('DETAILS');
  expect(nodes[0]!.querySelectorAll('article')).toHaveLength(2);
  expect(nodes[0]!.textContent).toContain('chief_engineer');
  expect(nodes[0]!.textContent).toContain('browser NOT_VERIFIED');
  expect(nodes[1]).toBe(cards[2]);
  const { projectGroups, ...legacySnapshot } = snapshot;
  expect(projectGroupCards(legacySnapshot, cards)).toEqual(cards);
});
