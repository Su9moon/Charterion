import { createHash } from 'node:crypto';
import type { ControlDatabase } from './database';

/** Reviewed task fixture only. Never discovers or modifies a live Kernel. */
export const JOINT_ROLE_CHARTER = {
  "version": "hive06-role-charter-v1",
  "approval": "APPROVED",
  "groupId": "cb-hive-joint-development",
  "sources": [
    {
      "repo": "Su9moon/personal-ai-control-plane",
      "path": "governance/baselines/PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md",
      "commit": "a6f4cd24c6ffb3cff413cfcbf06375935805c51b",
      "sha256": "da8c6ac333f19b787d699416f2916fa63d80cd804bc1c58964d73f5f234112e9",
      "approval": "FIXED"
    },
    {
      "repo": "Su9moon/Hive",
      "path": "ROADMAP.md",
      "commit": "d2e8d1bf2d6cc9f20d9076e3cdb380fae6fc6e43",
      "sha256": "f23680f2569ff3c083ba682dd3772819ac8711a29335c1d73774d911f6e9fb3c",
      "approval": "APPROVED"
    }
  ],
  "globalAuthority": {
    "scope": "PCP-global",
    "roles": [
      "supervisor",
      "chief_engineer",
      "execution_coordinator",
      "reviewer",
      "operations"
    ],
    "codexWorkers": "N",
    "controller": "UI, not Agent"
  },
  "projectScope": "CB-Hive-project; developer is not global Execution Coordinator or Codex Worker",
  "workspaceCharter": "independent safety contract; role charter cannot grant tools or host permissions",
  "escalation": [
    "cross-repository protocol change",
    "scope or authority change",
    "new service or scheduler",
    "role architecture change",
    "additional Developer"
  ],
  "routineApprovedWork": "autonomous; no per-task Chief approval",
  "roles": [
    {
      "identity": "joint-chief",
      "role": "chief_engineer",
      "projectId": null,
      "slotId": null,
      "conversationKey": "conversation:6ae47f4a-fe2c-83ea-aadc-f62f830af196",
      "scope": [
        "cross-project roadmap",
        "interface and authority boundaries",
        "scope change decisions",
        "joint acceptance",
        "version planning"
      ],
      "forbidden": [
        "code dispatch developer",
        "third Developer Slot",
        "automatic CB task creation"
      ]
    },
    {
      "identity": "hive-developer",
      "role": "developer",
      "projectId": "fb137a09-6163-4bfe-80fb-ae2a1570077d",
      "slotId": "d4ce2a83-ab07-4e06-8092-53dc2dc1fc13",
      "conversationKey": "conversation:6ae54e3e-6214-83e9-a833-6929ce1ae7df",
      "scope": [
        "Su9moon/Hive approved implementation",
        "tests",
        "defect repair",
        "Git coordination"
      ],
      "forbidden": [
        "other repository writes",
        "PCP FIXED changes",
        "new services",
        "additional Developer Slot",
        "automatic CB task creation"
      ]
    },
    {
      "identity": "cb-developer",
      "role": "developer",
      "projectId": "3b185b87-801f-441c-9d4c-0c8ea23edcf3",
      "slotId": "54e17ead-b209-4be3-bc90-304714b58dd7",
      "conversationKey": "conversation:6ae37fdf-f4ac-83ea-9630-e7ad0159b595",
      "scope": [
        "Su9moon/codex-bridge approved implementation",
        "tests",
        "defect repair",
        "Git coordination"
      ],
      "forbidden": [
        "Hive Roadmap writes",
        "other repository writes",
        "PCP FIXED changes",
        "new services",
        "additional Developer Slot",
        "automatic CB task creation"
      ]
    }
  ]
} as const;

export function roleCharterDigest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
export const JOINT_ROLE_CHARTER_CONTENT = JSON.stringify(JOINT_ROLE_CHARTER);
export const JOINT_ROLE_CHARTER_DIGEST = roleCharterDigest(JOINT_ROLE_CHARTER_CONTENT);

/** Trusted host entrypoint, deliberately absent from Browser RPC and chat parsing.
 * A new approved version requires a separately reviewed source registry entry.
 * Import is all-three-or-none and does not create Projects, Slots or Conversations.
 */
export class JointRoleCharterAuthority {
  constructor(private readonly database: ControlDatabase) {}

  importApproved(content: string, sourceContents: readonly string[]): string {
    if (content !== JOINT_ROLE_CHARTER_CONTENT) throw new Error('Unapproved charter content/version or pin drift');
    if (sourceContents.length !== 2 || JOINT_ROLE_CHARTER.sources.some((source, index) =>
      roleCharterDigest(sourceContents[index] ?? '') !== source.sha256)) throw new Error('Source content SHA256 mismatch');
    return this.database.transaction(() => {
      const group = this.database.db.prepare('SELECT * FROM project_groups WHERE id=?').get(JOINT_ROLE_CHARTER.groupId);
      if (!group || group.lead_conversation_key !== JOINT_ROLE_CHARTER.roles[0].conversationKey) throw new Error('Group Chief identity mismatch');
      const members = this.database.db.prepare('SELECT * FROM project_group_members WHERE group_id=?').all(JOINT_ROLE_CHARTER.groupId);
      if (members.length !== 2) throw new Error('Expected exactly two Developer bindings');
      for (const role of JOINT_ROLE_CHARTER.roles.slice(1)) {
        if (!members.some(member => member.project_id === role.projectId && member.developer_slot_id === role.slotId)) throw new Error('Cross-project charter binding');
        const slot = this.database.db.prepare('SELECT * FROM agent_slots WHERE id=?').get(role.slotId);
        if (!slot || slot.project_id !== role.projectId || slot.role !== role.role || slot.conversation_key !== role.conversationKey) throw new Error('Formal Conversation identity mismatch');
      }
      this.database.db.prepare('INSERT OR IGNORE INTO role_charter_snapshots(digest,version,content) VALUES(?,?,?)')
        .run(JOINT_ROLE_CHARTER_DIGEST, JOINT_ROLE_CHARTER.version, content);
      const snapshot = this.database.db.prepare('SELECT version,content FROM role_charter_snapshots WHERE digest=?').get(JOINT_ROLE_CHARTER_DIGEST);
      if (!snapshot || snapshot.version !== JOINT_ROLE_CHARTER.version || snapshot.content !== content) throw new Error('Stored role charter tampering');
      for (const role of JOINT_ROLE_CHARTER.roles) {
        const existing = this.database.db.prepare('SELECT * FROM role_charter_bindings WHERE identity=?').get(role.identity);
        if (existing && (existing.digest !== JOINT_ROLE_CHARTER_DIGEST || existing.conversation_key !== role.conversationKey
          || existing.group_id !== JOINT_ROLE_CHARTER.groupId || existing.project_id !== role.projectId || existing.slot_id !== role.slotId)) throw new Error('Approved atomic replacement required');
        this.database.db.prepare('INSERT OR IGNORE INTO role_charter_bindings(identity,group_id,project_id,slot_id,conversation_key,digest) VALUES(?,?,?,?,?,?)')
          .run(role.identity, JOINT_ROLE_CHARTER.groupId, role.projectId, role.slotId, role.conversationKey, JOINT_ROLE_CHARTER_DIGEST);
      }
      return JOINT_ROLE_CHARTER_DIGEST;
    });
  }

  read(): string | undefined {
    const row = this.database.db.prepare('SELECT version,content FROM role_charter_snapshots WHERE digest=?').get(JOINT_ROLE_CHARTER_DIGEST);
    if (!row) return undefined;
    const content = String(row.content);
    if (row.version !== JOINT_ROLE_CHARTER.version || content !== JOINT_ROLE_CHARTER_CONTENT || roleCharterDigest(content) !== JOINT_ROLE_CHARTER_DIGEST) throw new Error('Stored role charter tampering');
    // A snapshot is history, not proof that every identity has an effective binding.
    // Read all rows in one SQLite statement so partial/cross-project state fails closed.
    const bindings = this.database.db.prepare('SELECT * FROM role_charter_bindings WHERE group_id=? OR digest=?')
      .all(JOINT_ROLE_CHARTER.groupId, JOINT_ROLE_CHARTER_DIGEST);
    if (bindings.length !== JOINT_ROLE_CHARTER.roles.length || JOINT_ROLE_CHARTER.roles.some(role =>
      !bindings.some(binding => binding.identity === role.identity && binding.digest === JOINT_ROLE_CHARTER_DIGEST
        && binding.group_id === JOINT_ROLE_CHARTER.groupId && binding.project_id === role.projectId
        && binding.slot_id === role.slotId && binding.conversation_key === role.conversationKey))) {
      throw new Error('Incomplete or mismatched effective role charter bindings');
    }
    return content;
  }
}

/** Informational scope projection. CB Host remains the execution authority.
 * Tool visibility is never an authorization input. No CB task is created here.
 */
export function projectJointRoleScope(identity: string, repository: string, action: string): {
  decision: 'WITHIN_APPROVED_SCOPE' | 'CHANGE_PROPOSAL_REQUIRED';
  executionAuthority: 'CB_HOST';
} {
  const implementationActions = ['implementation', 'tests', 'defect-repair', 'git-coordination'];
  const within = identity === 'hive-developer'
    ? repository === 'Su9moon/Hive' && implementationActions.includes(action)
    : identity === 'cb-developer'
      ? repository === 'Su9moon/codex-bridge' && implementationActions.includes(action)
      : identity === 'joint-chief' && ['Su9moon/Hive', 'Su9moon/codex-bridge'].includes(repository)
        && ['roadmap', 'interface-boundary', 'scope-decision', 'joint-acceptance', 'version-planning'].includes(action);
  return { decision: within ? 'WITHIN_APPROVED_SCOPE' : 'CHANGE_PROPOSAL_REQUIRED', executionAuthority: 'CB_HOST' };
}
