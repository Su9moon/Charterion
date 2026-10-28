import { CHARTERION_CB_PROTOCOL } from './charterionCbDispatchJournal';
import type { CbEventPage, CbReadBinding, CbRequestLookup, TrustedCbReadClient } from './charterionCbReconciler';

/** Host-only seam, NOT an HTTP implementation. Implement with a genuine MCP SDK client.
 * connect must authenticate, initialize/negotiate MCP and own session cleanup; enforce
 * exact endpoint/no redirects, raw wire byte bounds (including non-structured MCP
 * content) before parsing, and cancellation on every operation. The reader's UTF-8
 * JSON bound is an additional check, not a replacement for transport byte limits.
 * Never log credentials, headers or server payloads. No browser/RPC configuration. */
export interface HostMcpTransport {
  connect(options: Readonly<{ endpoint: string; token: string; clientId: string;
    instanceId: string; project: string; maxResponseBytes: number }>, signal: AbortSignal): Promise<void>;
  listTools(signal: AbortSignal): Promise<{ tools: { name: string }[]; nextCursor?: string }>;
  callTool(name: 'get_capabilities' | 'get_task_by_request' | 'get_task_events',
    args: Record<string, unknown>, signal: AbortSignal): Promise<{ isError?: boolean; structuredContent?: unknown }>;
  close(): Promise<void>;
}
export interface CbHostReaderConfig extends CbReadBinding {
  enabled: true;
  endpoint: string;
  /** Immutable provisioning allowlist; never derived from requests or discovered URLs. */
  allowedEndpoints: readonly string[];
  token: string;
  deadlineMs: number;
  maxResponseBytes: number;
}
const fail = (code: string): never => { throw new Error(code); };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CB_RESPONSE_INVALID');
  return value as Record<string, unknown>;
};
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

/** Inspect decoded leaves as well as JSON-escaped secrets embedded in strings. */
function containsSecret(value: unknown, token: string): boolean {
  const escaped = JSON.stringify(token).slice(1, -1);
  const visit = (v: unknown): boolean => {
    if (typeof v === 'string') return v.includes(token) || v.includes(escaped);
    if (!v || typeof v !== 'object') return false;
    return Object.entries(v).some(([key, child]) => visit(key) || visit(child));
  };
  return visit(value);
}

/** Query-only adapter. No submission method, scheduler, network default or automatic retry. */
export async function createCbHostReader(config?: CbHostReaderConfig,
  transport?: HostMcpTransport): Promise<TrustedCbReadClient> {
  if (!config || config.enabled !== true) return fail('CB_HOST_DISABLED');
  const c = Object.freeze({ ...config, allowedEndpoints: [...config.allowedEndpoints] });
  try {
    const url = new URL(c.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search ||
        !c.allowedEndpoints.includes(c.endpoint) || url.href !== c.endpoint ||
        ![c.clientId, c.instanceId, c.project, c.token].every(s => typeof s === 'string' && s.trim() && s.length <= 4096) ||
        !positive(c.eventPageMax) || c.eventPageMax > 100 || !positive(c.deadlineMs) || c.deadlineMs > 60_000 ||
        !positive(c.maxResponseBytes) || c.maxResponseBytes > 1_048_576) fail('CB_HOST_CONFIG_INVALID');
  } catch { return fail('CB_HOST_CONFIG_INVALID'); }
  if (!transport) return fail('CB_MCP_ADAPTER_REQUIRED');
  // Capture methods to prevent later redirection by mutation of the transport object.
  const connect = transport.connect.bind(transport), list = transport.listTools.bind(transport);
  const call = transport.callTool.bind(transport), close = transport.close.bind(transport);
  let broken = false;
  async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (broken) return fail('CB_READ_UNAVAILABLE');
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => operation(abort.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error('deadline')); }, c.deadlineMs);
      })]);
    } catch {
      broken = true;
      abort.abort();
      void Promise.resolve().then(close).catch(() => {});
      return fail('CB_READ_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }
  async function query(name: Parameters<HostMcpTransport['callTool']>[0], args: Record<string, unknown>) {
    const result = await bounded(signal => call(name, args, signal));
    // Sanitize every failure; never forward transport errors or MCP error details.
    try {
      const responseJson = JSON.stringify(result);
      if (result.isError || Buffer.byteLength(responseJson, 'utf8') > c.maxResponseBytes) fail('invalid');
      const data = object(result.structuredContent);
      if (containsSecret(data, c.token)) fail('secret');
      return data;
    } catch { return fail('CB_RESPONSE_INVALID'); }
  }
  try {
    await bounded(signal => connect({ endpoint: c.endpoint, token: c.token, clientId: c.clientId,
      instanceId: c.instanceId, project: c.project, maxResponseBytes: c.maxResponseBytes }, signal));
    const tools = await bounded(list);
    if (tools.nextCursor || !Array.isArray(tools.tools) ||
        !['get_capabilities', 'get_task_by_request', 'get_task_events'].every(n => tools.tools.some(t => t.name === n))) {
      fail('BLOCKED_CAPABILITY');
    }
    const caps = await query('get_capabilities', {});
    const limits = object(caps.limits);
    if (caps.protocol_version !== CHARTERION_CB_PROTOCOL || caps.instance_id !== c.instanceId ||
        !(caps.release_sha === null || typeof caps.release_sha === 'string' && /^[a-f0-9]{40}$/.test(caps.release_sha)) ||
        !Array.isArray(caps.features) || !['request_lookup', 'task_events'].every(f => (caps.features as unknown[]).includes(f)) ||
        !['result_max_bytes', 'chunk_max_bytes', 'event_page_max', 'liveness_stale_seconds'].every(k => positive(limits[k])) ||
        (limits.event_page_max as number) > 100 || (limits.event_page_max as number) < c.eventPageMax) fail('BLOCKED_CAPABILITY');
  } catch (error) {
    broken = true;
    void Promise.resolve().then(close).catch(() => {});
    if (error instanceof Error && ['BLOCKED_CAPABILITY', 'CB_READ_UNAVAILABLE'].includes(error.message)) throw error;
    return fail('BLOCKED_CAPABILITY');
  }
  const tasks = new Map<string, string>();
  return Object.freeze({
    async get_task_by_request(client: string, dispatch: string): Promise<CbRequestLookup> {
      if (client !== c.clientId || typeof dispatch !== 'string' || !dispatch.trim() || dispatch.length > 1024) return fail('CB_SCOPE_MISMATCH');
      const data = await query('get_task_by_request', { client_id: client, dispatch_id: dispatch });
      if (data.found === false) return { found: false };
      const task = object(data.task), ack = object(task.integration);
      if (data.found !== true || typeof task.id !== 'string' || !task.id || typeof task.status !== 'string' ||
          task.project !== c.project || ack.protocol_version !== CHARTERION_CB_PROTOCOL ||
          ack.instance_id !== c.instanceId || ack.client_id !== c.clientId || ack.dispatch_id !== dispatch ||
          typeof ack.work_item_id !== 'string' || !ack.work_item_id || typeof ack.intent_sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(ack.intent_sha256) || tasks.has(task.id) && tasks.get(task.id) !== dispatch) return fail('CB_SCOPE_MISMATCH');
      tasks.set(task.id, dispatch);
      return data as unknown as CbRequestLookup;
    },
    async get_task_events(id: string, after: number, limit: number): Promise<CbEventPage> {
      if (!tasks.has(id) || !Number.isSafeInteger(after) || after < 0 || !positive(limit) || limit > c.eventPageMax) return fail('CB_SCOPE_MISMATCH');
      const data = await query('get_task_events', { id, after_seq: after, limit });
      let cursor = after;
      if (!Array.isArray(data.events) || data.events.length > limit ||
          data.events.some(e => {
            const event = object(e);
            if (event.instance_id !== c.instanceId || event.task_id !== id ||
                !Number.isSafeInteger(event.seq) || event.seq !== cursor + 1) return true;
            cursor = event.seq as number;
            return false;
          }) ||
          !Number.isSafeInteger(data.next_seq) || data.next_seq !== cursor ||
          !Number.isSafeInteger(data.last_seq) || (data.last_seq as number) < (data.next_seq as number) ||
          typeof data.has_more !== 'boolean' || data.has_more !== ((data.last_seq as number) > cursor) ||
          data.has_more && data.events.length === 0) return fail('CB_SCOPE_MISMATCH');
      return data as unknown as CbEventPage;
    },
  });
}
