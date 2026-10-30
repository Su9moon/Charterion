import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { ControlPlane } from '../src/controlPlane';
import { RpcRouter } from '../src/rpc';

function fixture() {
  const db = new ControlDatabase(':memory:');
  const plane = new ControlPlane(db);
  const members = ['Hive', 'CB'].map(name => {
    const project = plane.createProject({ name, rootPath: `F:/${name}`, minSlots: 0 });
    const slot = plane.createAgentSlot(project.id, 'developer');
    plane.bindAgentConversation(slot.id, `conversation:${name}`);
    return { projectId: project.id, developerSlotId: slot.id };
  });
  const input = { id: 'joint', name: 'CB × Hive', leadIdentity: 'chief', leadConversationKey: 'conversation:chief', members };
  return { db, plane, input, router: new RpcRouter(plane, 'admin', 'browser') };
}

it('keeps group administration out of the browser native allowlist and denies all browser group RPCs', () => {
  const { db, router, input } = fixture();
  try {
    const manifest = JSON.parse(readFileSync('shared/native-rpc-protocol.json', 'utf8'));
    for (const method of ['project-group.upsert', 'project-group.list', 'project-group.get']) {
      expect(manifest.methods.some((m: { name: string }) => m.name === method)).toBe(false);
      for (const auth of [undefined, { browserToken: 'browser' }, { adminToken: 'wrong' }]) {
        expect(router.handle({ id: method, method, params: input, ...(auth ? { auth } : {}) })).toMatchObject({ ok: false });
      }
    }
    expect(router.handle({ id: 'create', method: 'project-group.upsert', params: input, auth: { adminToken: 'admin' } })).toMatchObject({ ok: true });
    expect(router.handle({ id: 'get', method: 'project-group.get', params: { id: input.id }, auth: { adminToken: 'admin' } })).toMatchObject({ ok: true, result: { leadRole: 'chief_engineer' } });
    expect(router.handle({ id: 'list', method: 'project-group.list', auth: { adminToken: 'admin' } })).toMatchObject({ ok: true, result: [{ id: input.id }] });
  } finally { db.close(); }
});

it('enforces immutable lead and member binding in SQLite and rolls back failed updates', () => {
  const { db, plane, input } = fixture();
  try {
    const original = plane.upsertProjectGroup(input);
    expect(() => db.db.prepare('UPDATE project_groups SET lead_conversation_key=? WHERE id=?').run('conversation:replacement', input.id)).toThrow(/rebind/);
    expect(() => db.db.prepare('UPDATE project_groups SET lead_identity=? WHERE id=?').run('replacement', input.id)).toThrow(/rebind/);
    expect(() => db.db.prepare('UPDATE project_group_members SET developer_slot_id=? WHERE group_id=? AND project_id=?').run(input.members[1]!.developerSlotId, input.id, input.members[0]!.projectId)).toThrow(/rebind/);
    expect(() => plane.bindAgentConversation(input.members[0]!.developerSlotId, 'conversation:replacement')).toThrow(/rollover|rebind/);
    expect(() => plane.upsertProjectGroup({ ...input, name: 'must roll back', members: input.members.slice(0, 1) })).toThrow(/rebind/);
    expect(plane.getProjectGroup(input.id)).toEqual(original);
    expect(db.health().ok).toBe(true);
  } finally { db.close(); }
});

it('rejects duplicate lead identities and conversations across independent groups', () => {
  const { db, plane, input } = fixture();
  try {
    plane.upsertProjectGroup(input);
    const project = plane.createProject({ name: 'Other', rootPath: 'F:/other', minSlots: 0 });
    const slot = plane.createAgentSlot(project.id, 'developer');
    plane.bindAgentConversation(slot.id, 'conversation:other');
    const other = { ...input, id: 'other', members: [{ projectId: project.id, developerSlotId: slot.id }] };
    expect(() => plane.upsertProjectGroup({ ...other, leadConversationKey: 'conversation:new' })).toThrow();
    expect(() => plane.upsertProjectGroup({ ...other, leadIdentity: 'new' })).toThrow();
    expect(plane.listProjectGroups()).toHaveLength(1);
    expect(plane.listAgentSlots()).toHaveLength(3);
  } finally { db.close(); }
});
