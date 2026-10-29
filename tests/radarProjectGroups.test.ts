import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { ControlDatabase } from '../control/src/database';
import { ControlPlane } from '../control/src/controlPlane';
import { readRadarSnapshot } from '../control/src/radarSnapshot';
import { mountRadar } from '../dashboard/radar';

it('renders real persisted group bindings in standalone Radar, filters projects, and never counts a lead as online', async () => {
  const db = new ControlDatabase(':memory:');
  const plane = new ControlPlane(db);
  const members = ['Hive', 'CB'].map(name => {
    const p = plane.createProject({ name, rootPath: `F:/${name}`, minSlots: 0 });
    const a = plane.createAgentSlot(p.id, 'developer');
    plane.bindAgentConversation(a.id, `conversation:${name}`);
    return { projectId: p.id, developerSlotId: a.id };
  });
  const standalone = plane.createProject({ name: 'Standalone', rootPath: 'F:/standalone', minSlots: 0 });
  plane.upsertProjectGroup({ id: 'joint', name: '<img src=x> CB × Hive', leadIdentity: 'chief', leadConversationKey: 'conversation:chief', members });
  const data = readRadarSnapshot(plane, 'isolated-group-test');
  expect(data.projects).toHaveLength(3);
  expect(data.agents.map(a => a.role)).toEqual(['developer', 'developer']);
  expect(data.projectGroups).toMatchObject([{ id: 'joint', leadRole: 'chief_engineer', browserRuntime: 'NOT_VERIFIED' }]);
  expect(readRadarSnapshot(plane, 'test', standalone.id).projectGroups).toEqual([]);
  expect(readRadarSnapshot(plane, 'test', members[0]!.projectId).projectGroups).toHaveLength(1);
  const dom = new JSDOM(readFileSync('dashboard/index.html', 'utf8'), { url: 'http://127.0.0.1:34567/pcp/#read=test' });
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(data));
  const view = mountRadar(dom.window.document, dom.window as unknown as Window, fetcher);
  try {
    const doc = dom.window.document;
    await vi.waitFor(() => expect(doc.body.dataset.state).toBe('connected'));
    const group = doc.querySelector<HTMLDetailsElement>('details.project-group')!;
    expect(group.open).toBe(false);
    group.open = true;
    expect(group.querySelectorAll('.project')).toHaveLength(2);
    expect(group.textContent).toContain('chief_engineer');
    expect(group.textContent).toContain('conversation:chief');
    expect(group.textContent).toContain('NOT_VERIFIED');
    for (const m of members) {
      expect(group.textContent).toContain(m.projectId);
      expect(group.textContent).toContain(m.developerSlotId);
    }
    expect(doc.querySelector('#projects > .project')?.textContent).toContain(standalone.id);
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.getElementById('agent-count')?.textContent).toBe('2');
    expect(doc.getElementById('online-count')?.textContent).toBe('0');
    await view.refresh();
    expect(doc.querySelector<HTMLDetailsElement>('details.project-group')?.open).toBe(true);
    const filter = doc.querySelector<HTMLSelectElement>('#project-filter')!;
    filter.value = members[0]!.projectId; filter.dispatchEvent(new dom.window.Event('change'));
    expect(doc.querySelectorAll('details.project-group .project')).toHaveLength(1);
    expect(doc.getElementById('agent-count')?.textContent).toBe('1');
    fetcher.mockResolvedValueOnce(Response.json({ ...data, projectGroups: [{ ...data.projectGroups![0], members: [null] }] }));
    await view.refresh();
    expect(doc.body.dataset.state).toBe('unavailable');
    expect(doc.getElementById('online-count')?.textContent).toBe('—');
    expect(doc.querySelector('[id="control-submit"]')?.hasAttribute('disabled')).toBe(true);
  } finally { view.dispose(); dom.window.close(); db.close(); }
});
