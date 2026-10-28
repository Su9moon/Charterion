import { CHARTERION_CB_PROTOCOL, CharterionCbDispatchJournal, type CbObservedEvent } from './charterionCbDispatchJournal';

/** Canonical ack: task identity and project belong to the containing CB task. */
export interface CbReadAck {
  protocol_version: typeof CHARTERION_CB_PROTOCOL;
  instance_id: string;
  client_id: string;
  dispatch_id: string;
  work_item_id: string;
  intent_sha256: string;
}
export interface CbEventPage {
  events: CbObservedEvent[];
  next_seq: number;
  has_more: boolean;
  last_seq: number;
}
export type CbRequestLookup = { found: false } | {
  found: true;
  task: { id: string; status: string; project: string; integration: CbReadAck };
};
/** Host supplies an authenticated, scoped transport; never construct from RPC/model data. */
export interface TrustedCbReadClient {
  get_task_by_request(client_id: string, dispatch_id: string): Promise<CbRequestLookup>;
  get_task_events(id: string, after_seq: number, limit: number): Promise<CbEventPage>;
}
export interface CbReadBinding {
  clientId: string;
  instanceId: string;
  project: string;
  /** Host-verified request_lookup/task_events capability and configured page limit. */
  eventPageMax: number;
}
export type CbReconcileResult =
  | { status: 'blocked' | 'unknown'; reason: string }
  | { status: 'observed'; taskId: string; cursor: number; hasMore: boolean };

/** Opt-in, one-shot host boundary. No submit, polling, execution or WorkItem writes. */
export class CharterionCbReconciler {
  private readonly binding: Readonly<CbReadBinding>;
  private readonly reader?: TrustedCbReadClient;
  constructor(private readonly journal: CharterionCbDispatchJournal,
    binding: CbReadBinding, reader?: TrustedCbReadClient) {
    if (binding.clientId !== journal.clientId ||
        ![binding.clientId, binding.instanceId, binding.project].every((s) => typeof s === 'string' && s.trim()) ||
        !Number.isSafeInteger(binding.eventPageMax) || binding.eventPageMax < 1 || binding.eventPageMax > 100) {
      throw new Error('CB_HOST_BINDING_INVALID');
    }
    this.binding = Object.freeze({ ...binding });
    // Capture methods too: later replacement of a configuration object cannot redirect reads.
    if (reader) this.reader = Object.freeze({
      get_task_by_request: reader.get_task_by_request.bind(reader),
      get_task_events: reader.get_task_events.bind(reader),
    });
  }

  async reconcile(dispatchId: string): Promise<CbReconcileResult> {
    const intent = this.journal.lookup(dispatchId);
    if (!intent) return { status: 'blocked', reason: 'UNKNOWN_DISPATCH' };
    const scope = this.binding;
    if (intent.project !== scope.project) throw new Error('CB_PROJECT_MISMATCH');
    if (!this.reader) return { status: 'blocked', reason: 'CB_READ_CLIENT_UNAVAILABLE' };
    let response: CbRequestLookup;
    try { response = await this.reader.get_task_by_request(scope.clientId, intent.dispatchId); }
    catch { return { status: 'unknown', reason: 'CB_LOOKUP_UNAVAILABLE' }; }
    if (response?.found === false) return { status: 'unknown', reason: 'CB_ACK_ABSENT' };
    const task = response?.found === true ? response.task : undefined;
    const ack = task?.integration;
    if (!task || !ack || ack.protocol_version !== CHARTERION_CB_PROTOCOL ||
        ack.instance_id !== scope.instanceId || ack.client_id !== scope.clientId ||
        ack.dispatch_id !== intent.dispatchId || ack.work_item_id !== intent.workItemId ||
        ack.intent_sha256 !== intent.intentSha256 || task.project !== scope.project) {
      throw new Error('CB_ACK_SCOPE_MISMATCH');
    }
    // Journal transaction enforces stable task/instance identity, including concurrent recovery.
    const bound = this.journal.recordAck(dispatchId, { instanceId: ack.instance_id,
      taskId: task.id, workItemId: ack.work_item_id, intentSha256: ack.intent_sha256 });
    let page: CbEventPage;
    try { page = await this.reader.get_task_events(bound.taskId!, this.journal.contiguousCursor(dispatchId), scope.eventPageMax); }
    catch { return { status: 'unknown', reason: 'CB_EVENTS_UNAVAILABLE' }; }
    if (!page || !Array.isArray(page.events) || page.events.length > scope.eventPageMax ||
        !Number.isSafeInteger(page.next_seq) || page.next_seq < 0 ||
        !Number.isSafeInteger(page.last_seq) || page.last_seq < page.next_seq ||
        typeof page.has_more !== 'boolean' || page.events.some((e) => e.seq > page.last_seq)) {
      throw new Error('CB_EVENT_PAGE_INVALID');
    }
    this.journal.ingestEvents(dispatchId, page.events);
    // Only the journal's contiguous observations advance the cursor, never remote metadata.
    return { status: 'observed', taskId: bound.taskId!, cursor: this.journal.contiguousCursor(dispatchId), hasMore: page.has_more };
  }
}
