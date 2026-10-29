import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { ControlPlane } from '../src/controlPlane';

it('upgrades V29 to V30 without changing PCP fleet or conversation bindings and reopens idempotently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hive-v30-'));
  const path = join(dir, 'kernel.db');
  let db = new ControlDatabase(path);
  try {
    const plane = new ControlPlane(db);
    const project = plane.createProject({ name: 'Existing', rootPath: 'F:/existing', minSlots: 0 });
    const slot = plane.createAgentSlot(project.id, 'developer');
    plane.bindAgentConversation(slot.id, 'conversation:existing');
    const projects = db.db.prepare('SELECT * FROM projects').all();
    const agents = db.db.prepare('SELECT * FROM agent_slots').all();
    const fleet = plane.getPcpProjectFleetControl(project.id);
    db.db.exec("DROP TABLE project_group_members; DROP TABLE project_groups; DROP TRIGGER group_member_reassignment; DROP TRIGGER agent_group_scope; DROP TRIGGER agent_group_insert_scope; UPDATE schema_meta SET value='29' WHERE key='schema_version'");
    db.close(); db = new ControlDatabase(path);
    expect(db.db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()).toMatchObject({ value: '30' });
    expect(db.db.prepare('SELECT * FROM projects').all()).toEqual(projects);
    expect(db.db.prepare('SELECT * FROM agent_slots').all()).toEqual(agents);
    expect(new ControlPlane(db).getPcpProjectFleetControl(project.id)).toEqual(fleet);
    expect(new ControlPlane(db).listProjectGroups()).toEqual([]);
    expect(db.health().ok).toBe(true);
    db.close(); db = new ControlDatabase(path);
    expect(db.health().ok).toBe(true);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
