import type { RadarSnapshot } from '../../shared/radar';
import type { ControlPlane } from './controlPlane';

export function readRadarSnapshot(plane: ControlPlane, instanceId: string, projectId?: string, now = Date.now()): RadarSnapshot {
  const projects = plane.listProjects().filter(p => projectId === undefined || p.id === projectId);
  if (projectId !== undefined && !projects.length) throw new Error('PROJECT_NOT_FOUND');
  const observationTtlMs = 180_000;
  return {
    schemaVersion: 1, instanceId, observedAt: now, refreshAfterMs: 3000, observationTtlMs,
    projects: projects.map(p => {
      const fleet = plane.getPcpProjectFleetControl(p.id);
      return { id: p.id, name: p.name, rootPath: p.rootPath, status: p.status, minSlots: p.minSlots, maxSlots: p.maxSlots,
        fleet: { mode: fleet.mode, lifecycleLocked: fleet.lifecycleLocked, revision: fleet.revision } };
    }),
    agents: plane.listAgentSlots(projectId).map(a => ({
      id: a.id, projectId: a.projectId, role: a.role, status: a.status, desiredState: a.desiredState, browserState: a.browserState,
      conversationKey: a.conversationKey ?? null, conversationGeneration: a.conversationGeneration, leaseEpoch: a.leaseEpoch,
      rolloverState: a.rolloverState, pageStatus: a.browserPageStatus ?? 'unknown',
      observationState: a.browserState === 'absent' ? 'offline' :
        a.browserObservedAt === undefined || now - a.browserObservedAt > observationTtlMs || a.browserObservedAt > now + 5000 ? 'unavailable' : 'fresh',
      browserObservedAt: a.browserObservedAt ?? null, runtimeObservedAt: a.browserRuntimeObservedAt ?? null,
      browserTabId: a.browserTabId ?? null, quarantined: a.browserQuarantined, error: a.browserError ?? a.browserQuarantineReason ?? null,
    })),
    // Payloads can contain instructions or credentials; the radar exposes event metadata only.
    events: plane.listEvents(projectId, 0, 100, true).map(e => ({ seq: e.seq, projectId: e.projectId ?? null,
      type: e.type, subject: e.subject, createdAt: e.createdAt })),
  };
}
