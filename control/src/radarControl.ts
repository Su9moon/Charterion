import { createHash, randomBytes } from 'node:crypto';
import type { ControlPlane } from './controlPlane';

export class RadarControlError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export interface RadarControlGrant { token: string; projectId: string; actor: string; expiresAt: number }
type FleetCommand = { projectId: string; mode: 'controlled' | 'elastic'; lifecycleLocked: boolean; expectedRevision: number; reason: string; requestId: string };
type Receipt = { status: number; body: { requestId: string; revision?: number; changed?: boolean; error?: string } };
type Grant = Omit<RadarControlGrant, 'token'> & { receipts: Map<string, { digest: string; receipt: Receipt }> };
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

// Transport-scoped delegation only. The existing Kernel owns validation, state and durable audit.
export class RadarControl {
  private readonly grants = new Map<string, Grant>();
  constructor(private readonly plane: ControlPlane, private readonly now = Date.now) {}

  issue(projectId: string, actor: string): RadarControlGrant {
    if (typeof projectId !== 'string' || !projectId || typeof actor !== 'string' || !actor.trim() || actor.length > 120)
      throw new RadarControlError(400, 'INVALID_AUTHORIZATION');
    this.plane.getPcpProjectFleetControl(projectId);
    for (const [key, grant] of this.grants) if (grant.expiresAt <= this.now()) this.grants.delete(key);
    if (this.grants.size >= 32) throw new RadarControlError(429, 'AUTHORIZATION_LIMIT');
    const token = `fleet_${randomBytes(32).toString('base64url')}`;
    const grant = { projectId, actor: actor.trim(), expiresAt: this.now() + 600_000 };
    this.grants.set(digest(token), { ...grant, receipts: new Map() });
    return { token, ...grant };
  }

  execute(token: string, value: unknown): Receipt {
    const grant = this.grants.get(digest(token));
    if (!grant || grant.expiresAt <= this.now()) throw new RadarControlError(403, 'CONTROL_AUTHORIZATION_REQUIRED');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RadarControlError(400, 'INVALID_COMMAND');
    const x = value as FleetCommand;
    if (Object.keys(x).some(key => !['projectId', 'mode', 'lifecycleLocked', 'expectedRevision', 'reason', 'requestId'].includes(key)) ||
      typeof x.projectId !== 'string' || !['controlled', 'elastic'].includes(x.mode) || typeof x.lifecycleLocked !== 'boolean' ||
      !Number.isSafeInteger(x.expectedRevision) || x.expectedRevision < 0 || typeof x.reason !== 'string' || !x.reason.trim() || x.reason.length > 1000 ||
      typeof x.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(x.requestId)) throw new RadarControlError(400, 'INVALID_COMMAND');
    if (x.projectId !== grant.projectId) throw new RadarControlError(403, 'PROJECT_SCOPE_MISMATCH');
    const command = { projectId: x.projectId, mode: x.mode, lifecycleLocked: x.lifecycleLocked, expectedRevision: x.expectedRevision,
      reason: x.reason.trim(), requestId: x.requestId };
    const hash = digest(JSON.stringify(command)); const previous = grant.receipts.get(x.requestId);
    if (previous) {
      if (previous.digest !== hash) throw new RadarControlError(409, 'REQUEST_ID_REUSED');
      return previous.receipt;
    }
    // Never evict a live receipt: an old request must not become a new command.
    if (grant.receipts.size >= 128) throw new RadarControlError(429, 'REQUEST_LIMIT');
    let receipt: Receipt;
    try {
      const result = this.plane.setPcpProjectFleetControl(command.projectId, { ...command, actor: grant.actor }, this.now());
      receipt = { status: 200, body: { requestId: x.requestId, revision: result.revision, changed: result.revision !== x.expectedRevision } };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      receipt = { status: /revision conflict/.test(message) ? 409 : /Project not found/.test(message) ? 404 : 503,
        body: { requestId: x.requestId, error: /revision conflict/.test(message) ? 'REVISION_CONFLICT' : 'CONTROL_UNAVAILABLE' } };
    }
    grant.receipts.set(x.requestId, { digest: hash, receipt });
    return receipt;
  }
}
