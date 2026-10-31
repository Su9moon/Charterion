import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { JointRoleCharterAuthority, JOINT_ROLE_CHARTER as charter, JOINT_ROLE_CHARTER_CONTENT as content, JOINT_ROLE_CHARTER_DIGEST as digest, projectJointRoleScope } from '../src/jointRoleCharter';

const sources = ['PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md', 'ROADMAP.md'].map(name => readFileSync(`reports/HIVE06-ROLE-CHARTER/inputs/${name}`, 'utf8'));
function seed(db: ControlDatabase) {
  for (const role of charter.roles.slice(1)) {
    db.db.prepare("INSERT INTO projects(id,name,root_path,status,isolation_tier,min_slots,max_slots,weight,created_at,updated_at) VALUES(?,?,?,'active','c0-host',0,1,1,1,1)").run(role.projectId, role.identity, `C:/${role.identity}`);
    db.db.prepare("INSERT INTO agent_slots(id,project_id,role,status,desired_state,browser_state,conversation_key,created_at,updated_at) VALUES(?,?,'developer','assigned','active','absent',?,1,1)").run(role.slotId, role.projectId, role.conversationKey);
  }
  db.db.prepare('INSERT INTO project_groups VALUES(?,?,?,?,1,1)').run(charter.groupId, 'CB × Hive', 'joint-chief', charter.roles[0].conversationKey);
  for (const role of charter.roles.slice(1)) db.db.prepare('INSERT INTO project_group_members VALUES(?,?,?)').run(charter.groupId, role.projectId, role.slotId);
}
it('imports all three once, preserves snapshots and reads the contract after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hive-role-charter-'));
  const path = join(dir, 'isolated.db');
  let db = new ControlDatabase(path);
  try {
    seed(db);
    const authority = new JointRoleCharterAuthority(db);
    expect(authority.importApproved(content, sources)).toBe(digest);
    expect(authority.importApproved(content, sources)).toBe(digest);
    expect(db.db.prepare('SELECT * FROM role_charter_bindings').all()).toHaveLength(3);
    expect(db.db.prepare('SELECT * FROM agent_slots').all()).toHaveLength(2);
    expect(() => db.db.prepare('INSERT INTO role_charter_bindings VALUES(?,?,?,?,?,?)').run('duplicate', charter.groupId, null, null, charter.roles[0].conversationKey, digest)).toThrow();
    expect(() => db.db.exec("UPDATE role_charter_snapshots SET content='tamper'")).toThrow(/immutable/);
    expect(() => db.db.exec("UPDATE role_charter_bindings SET conversation_key='conversation:other'")).toThrow();
    db.close(); db = new ControlDatabase(path);
    expect(new JointRoleCharterAuthority(db).read()).toBe(content);
    expect(db.health().ok).toBe(true);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
it('rejects content tampering, pin drift and source content substitution', () => {
  const db = new ControlDatabase(':memory:');
  try {
    seed(db);
    const authority = new JointRoleCharterAuthority(db);
    expect(() => authority.importApproved(content.replace('a6f4cd24', 'b6f4cd24'), sources)).toThrow(/pin drift/);
    expect(() => authority.importApproved(content + ' ', sources)).toThrow();
    expect(() => authority.importApproved(content, [sources[0]! + 'tamper', sources[1]!])).toThrow(/SHA256/);
    expect(db.db.prepare('SELECT * FROM role_charter_bindings').all()).toHaveLength(0);
  } finally { db.close(); }
});
it('rejects cross-project mappings and requires three distinct formal conversations atomically', () => {
  const db = new ControlDatabase(':memory:');
  try {
    seed(db);
    db.db.prepare('DELETE FROM project_group_members WHERE project_id=?').run(charter.roles[1].projectId);
    const authority = new JointRoleCharterAuthority(db);
    expect(() => authority.importApproved(content, sources)).toThrow(/two Developer/);
    expect(db.db.prepare('SELECT * FROM role_charter_snapshots').all()).toHaveLength(0);
    db.db.prepare('INSERT INTO project_group_members VALUES(?,?,?)').run(charter.groupId, charter.roles[1].projectId, charter.roles[1].slotId);
    db.db.exec('DROP TRIGGER group_member_reassignment');
    db.db.prepare('UPDATE agent_slots SET conversation_key=? WHERE id=?').run('conversation:unapproved', charter.roles[1].slotId);
    expect(() => authority.importApproved(content, sources)).toThrow(/identity mismatch/);
    expect(db.db.prepare('SELECT * FROM role_charter_bindings').all()).toHaveLength(0);
  } finally { db.close(); }
});

it('projects scope without converting tool visibility into authority', () => {
  expect(projectJointRoleScope('hive-developer', 'Su9moon/Hive', 'tests').decision).toBe('WITHIN_APPROVED_SCOPE');
  expect(projectJointRoleScope('cb-developer', 'Su9moon/Hive', 'roadmap').decision).toBe('CHANGE_PROPOSAL_REQUIRED');
  expect(projectJointRoleScope('joint-chief', 'Su9moon/Hive', 'implementation').decision).toBe('CHANGE_PROPOSAL_REQUIRED');
  expect(projectJointRoleScope('hive-developer', 'Su9moon/Hive', 'new-service')).toEqual({ decision: 'CHANGE_PROPOSAL_REQUIRED', executionAuthority: 'CB_HOST' });
});
