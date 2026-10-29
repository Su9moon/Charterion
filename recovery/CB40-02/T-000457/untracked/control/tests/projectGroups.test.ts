import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { ControlPlane } from '../src/controlPlane';

it('persists a rootless two-project group with independent developers and rejects scope/rebind conflicts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hive-group-'));
  const path = join(dir, 'kernel.db');
  let db = new ControlDatabase(path);
  try {
    let plane = new ControlPlane(db);
    const members = ['Hive', 'CB'].map(name => {
      const project = plane.createProject({ name, rootPath: `F:/${name}`, minSlots: 0, maxSlots: 4 });
      const slot = plane.createAgentSlot(project.id, 'developer');
      plane.bindAgentConversation(slot.id, `conversation:${name}`);
      return { projectId: project.id, developerSlotId: slot.id };
    });
    const input = { id: 'cb-hive', name: 'CB × Hive 联合开发', leadIdentity: 'cb-hive-chief', leadConversationKey: 'conversation:chief', members };
    const group = plane.upsertProjectGroup(input);
    expect(plane.upsertProjectGroup(input)).toEqual(group);
    expect(group).not.toHaveProperty('rootPath');
    expect(group.browserRuntime).toBe('NOT_VERIFIED');
    expect(plane.listProjects()).toHaveLength(2);
    expect(plane.listAgentSlots().map(s => s.role)).toEqual(['developer', 'developer']);
    expect(() => plane.upsertProjectGroup({ ...input, leadConversationKey: 'conversation:replacement' })).toThrow(/rebind/);
    expect(() => plane.upsertProjectGroup({ ...input, id: 'other' })).toThrow();
    expect(() => plane.upsertProjectGroup({ ...input, members: [members[0]!, members[0]!] })).toThrow(/distinct/);
    const extra = plane.createAgentSlot(members[0]!.projectId, 'reviewer');
    expect(() => plane.bindAgentConversation(extra.id, 'conversation:chief')).toThrow(/group/);
    expect(() => plane.upsertProjectGroup({ ...input, id: 'bad', leadIdentity: 'other', leadConversationKey: 'conversation:Hive' })).toThrow();
    expect(() => plane.upsertProjectGroup({ ...input, members: [{ ...members[0]!, developerSlotId: members[1]!.developerSlotId }, members[1]!] })).toThrow(/developer/);
    db.close();
    db = new ControlDatabase(path);
    plane = new ControlPlane(db);
    expect(plane.getProjectGroup(input.id)).toEqual(group);
    expect(db.health().ok).toBe(true);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
