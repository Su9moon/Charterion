import { createHash, timingSafeEqual } from 'node:crypto';
import type { ControlPlane } from './controlPlane';
import type { RpcFailure, RpcRequest, RpcResponse } from './contracts';
import { enumParam, numberParam, objectArrayParam, objectParam, record, stringParam } from './rpcParams';
import { RpcRouter as LegacyRpcRouter } from './rpcLegacy';
import { RadarControlError, type RadarControlGrant } from './radarControl';

export * from './rpcLegacy';

function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

function failure(id: string, code: string, message: string): RpcFailure {
  return { id, ok: false, error: { code, message } };
}

export class RpcRouter {
  private readonly legacy: LegacyRpcRouter;

  constructor(
    private readonly plane: ControlPlane,
    private readonly adminToken: string,
    private readonly browserToken: string,
    private readonly instanceId?: string,
    private readonly radarUrl?: () => string | undefined,
    private readonly radarControlGrant?: (projectId: string, actor: string) => RadarControlGrant,
  ) {
    this.legacy = new LegacyRpcRouter(plane, adminToken, browserToken, instanceId);
  }

  handle(request: RpcRequest): RpcResponse {
    if (request?.method === 'radar.authorize-control') {
      const id = typeof request.id === 'string' ? request.id : 'unknown';
      if (this.instanceId && request.instanceId !== this.instanceId) return failure(id, 'INSTANCE_MISMATCH', 'RPC instance mismatch');
      if (!request.auth?.adminToken || !safeEqual(request.auth.adminToken, this.adminToken)) return failure(id, 'UNAUTHORIZED', 'Administrator authorization required');
      if (!this.radarUrl?.() || !this.radarControlGrant) return failure(id, 'UNAVAILABLE', 'Radar is disabled');
      try {
        const params = record(request.params);
        return { id, ok: true, result: this.radarControlGrant(stringParam(params, 'projectId')!, stringParam(params, 'actor')!) };
      } catch (error) { return failure(id, error instanceof RadarControlError ? error.code : 'INVALID_REQUEST', 'Control authorization could not be issued'); }
    }
    if (request?.method === 'radar.open') {
      const id = typeof request.id === 'string' ? request.id : 'unknown';
      if (this.instanceId && request.instanceId !== this.instanceId) return failure(id, 'INSTANCE_MISMATCH', 'RPC instance mismatch');
      const auth = request.auth;
      if (!(auth?.adminToken && safeEqual(auth.adminToken, this.adminToken)) && !(auth?.browserToken && safeEqual(auth.browserToken, this.browserToken)))
        return failure(id, 'UNAUTHORIZED', 'Radar discovery authentication required');
      const url = this.radarUrl?.();
      return url ? { id, ok: true, result: { url } } : failure(id, 'UNAVAILABLE', '状态雷达未启用，请在此 Kernel 启动时设置 GAM_RADAR_PORT=0');
    }
    if (request?.method !== 'work.batch-mutate') return this.legacy.handle(request);
    const id = typeof request?.id === 'string' && request.id ? request.id : 'unknown';
    try {
      if (this.instanceId && request.instanceId !== this.instanceId) {
        return failure(id, 'INSTANCE_MISMATCH', `RPC instance mismatch: expected ${this.instanceId}`);
      }
      const token = request.auth?.browserToken;
      if (!token || !safeEqual(token, this.browserToken)) throw new Error('Browser authentication failed');
      const params = record(request.params);
      const mutations = objectArrayParam(params, 'mutations').map((mutation) => ({
        kind: enumParam(mutation, 'kind', ['task', 'attempt', 'message'] as const)!,
        document: objectParam(mutation, 'document')!,
      }));
      return {
        id,
        ok: true,
        result: this.plane.work.batchUpsert({
          expectedRevision: numberParam(params, 'expectedRevision')!,
          transportGeneration: stringParam(params, 'transportGeneration')!,
          transportSequence: numberParam(params, 'transportSequence')!,
          transportMessageId: stringParam(params, 'transportMessageId')!,
          mutations,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unauthorized = /authentication|Capability token/i.test(message);
      const clientFault = /required|invalid|must be|cannot|does not|not found|conflict|stale|unsupported|already|missing|rejected|task|attempt|message|work state|sequence|batch/i.test(message);
      const code = unauthorized ? 'UNAUTHORIZED' : clientFault ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
      return failure(id, code, code === 'INTERNAL_ERROR' ? 'Internal control-plane error' : message);
    }
  }
}
