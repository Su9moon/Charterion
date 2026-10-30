export interface RadarProject {
  id: string; name: string; rootPath: string; status: string; minSlots: number; maxSlots: number;
  fleet: { mode: string; lifecycleLocked: boolean; revision: number };
}
export interface RadarAgent {
  id: string; projectId: string; role: string; status: string; desiredState: string; browserState: string;
  conversationKey: string | null; conversationGeneration: number; leaseEpoch: number; rolloverState: string;
  pageStatus: string; observationState: 'offline' | 'unavailable' | 'fresh';
  browserObservedAt: number | null; runtimeObservedAt: number | null; browserTabId: number | null;
  quarantined: boolean; error: string | null;
}
export interface RadarEvent { seq: number; projectId: string | null; type: string; subject: string; createdAt: number }
export interface RadarProjectGroup {
  id: string; name: string; leadIdentity: string; leadRole: 'chief_engineer';
  leadConversationKey: string; browserRuntime: 'NOT_VERIFIED';
  members: { projectId: string; developerSlotId: string }[];
}
export interface RadarSnapshot {
  projectGroups?: RadarProjectGroup[];
  schemaVersion: 1; instanceId: string; observedAt: number; refreshAfterMs: number; observationTtlMs: number;
  projects: RadarProject[]; agents: RadarAgent[]; events: RadarEvent[];
}
