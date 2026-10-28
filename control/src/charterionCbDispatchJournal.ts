/**
 * Charterion -> CB V0.1 source-only dispatch journal.
 * The journal does NOT send MCP requests, authorize execution, or review WorkItems.
 * The transport layer must authenticate the configured client scope independently.
 */
import { createHash } from 'node:crypto';
import type { ControlDatabase } from './database';

export const CHARTERION_CB_PROTOCOL = 'charterion-cb/1.0' as const;

export interface CbDispatchInput {
  dispatchId: string;
  workItemId: string;
  project: string;
  task: string;
  sourceRef: string;
  inputRef: string;
  options?: Record<string, unknown>;
}

export interface CbDispatchRecord {
  dispatchId: string;
  workItemId: string;
  project: string;
  task: string;
  sourceRef: string;
  inputRef: string;
  options: Record<string, unknown> | null;
  clientId: string;
  intentSha256: string;
  instanceId: string | null;
  taskId: string | null;
}

export interface CbObservedEvent {
  seq: number;
  instance_id: string;
  task_id: string;
  run_id: string | null;
  type: string;
  origin: 'server' | 'worker' | 'host';
  received_at: string;
  evidence_refs: string[];
  tests_status?: 'passed' | 'failed' | 'not_run';
}

function nonempty(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) {
    throw new Error(name + ' must be a nonempty bounded string');
  }
  return value;
}
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return '{' + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ':' + canonical(obj[key])).join(',') + '}';
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  throw new Error('CB dispatch contains non-JSON input');
}
function normalizeInput(input: CbDispatchInput): string {
  const payload = {
    dispatchId: nonempty(input.dispatchId, 'dispatchId'),
    workItemId: nonempty(input.workItemId, 'workItemId'),
    project: nonempty(input.project, 'project'),
    task: nonempty(input.task, 'task'),
    sourceRef: nonempty(input.sourceRef, 'sourceRef'),
    inputRef: nonempty(input.inputRef, 'inputRef'),
    options: input.options ?? null,
  };
  return canonical(payload);
}

/** Persistent, scoped intent store. Connection owner must supply a trusted clientId. */
export class CharterionCbDispatchJournal {
  constructor(private readonly database: ControlDatabase, readonly clientId: string) {
    nonempty(clientId, 'trusted clientId');
    // Tables are private to the opt-in integration; existing Organization tables remain unchanged.
    this.database.db.exec([
      'CREATE TABLE IF NOT EXISTS charterion_cb_dispatch (',
      'client_id TEXT NOT NULL, dispatch_id TEXT NOT NULL, input_json TEXT NOT NULL,',
      'intent_sha256 TEXT NOT NULL, instance_id TEXT, task_id TEXT,',
      'PRIMARY KEY(client_id, dispatch_id),',
      'UNIQUE(instance_id, task_id)',
      ') STRICT;',
      'CREATE TABLE IF NOT EXISTS charterion_cb_event (',
      'instance_id TEXT NOT NULL, task_id TEXT NOT NULL, seq INTEGER NOT NULL CHECK(seq > 0),',
      'client_id TEXT NOT NULL, payload_json TEXT NOT NULL,',
      'PRIMARY KEY(instance_id, task_id, seq)',
      ') STRICT;',
    ].join('\n'));
  }

  /** Persist the exact intent BEFORE the Coordinator sends its first MCP request. */
  prepare(input: CbDispatchInput): CbDispatchRecord {
    const body = normalizeInput(input);
    const digest = sha256(input.task); // Raw UTF-8, no newline normalization.
    return this.database.transaction(() => {
      const old = this.database.db.prepare(
        'SELECT input_json FROM charterion_cb_dispatch WHERE client_id=? AND dispatch_id=?',
      ).get(this.clientId, input.dispatchId) as { input_json: string } | undefined;
      if (old && old.input_json !== body) throw new Error('DISPATCH_CONFLICT');
      if (!old) this.database.db.prepare(
        'INSERT INTO charterion_cb_dispatch(client_id,dispatch_id,input_json,intent_sha256) VALUES(?,?,?,?)',
      ).run(this.clientId, input.dispatchId, body, digest);
      return this.lookup(input.dispatchId)!;
    });
  }

  /** Store an authenticated CB acknowledgement; never synthesize a task id. */
  recordAck(dispatchId: string, ack: {
    instanceId: string; taskId: string; workItemId: string; intentSha256: string;
  }): CbDispatchRecord {
    nonempty(dispatchId, 'dispatchId');
    nonempty(ack.instanceId, 'instanceId');
    nonempty(ack.taskId, 'taskId');
    return this.database.transaction(() => {
      const found = this.lookup(dispatchId);
      if (!found) throw new Error('UNKNOWN_DISPATCH');
      if (ack.workItemId !== found.workItemId || ack.intentSha256 !== found.intentSha256) {
        throw new Error('DISPATCH_ACK_MISMATCH');
      }
      if ((found.taskId && found.taskId !== ack.taskId) ||
          (found.instanceId && found.instanceId !== ack.instanceId)) {
        throw new Error('DISPATCH_ACK_CONFLICT');
      }
      this.database.db.prepare(
        'UPDATE charterion_cb_dispatch SET instance_id=?,task_id=? WHERE client_id=? AND dispatch_id=?',
      ).run(ack.instanceId, ack.taskId, this.clientId, dispatchId);
      return this.lookup(dispatchId)!;
    });
  }

  /** Used to reconcile an unknown submission ACK using the ORIGINAL dispatch_id. */
  lookup(dispatchId: string): CbDispatchRecord | null {
    const row = this.database.db.prepare(
      'SELECT input_json,intent_sha256,instance_id,task_id FROM charterion_cb_dispatch WHERE client_id=? AND dispatch_id=?',
    ).get(this.clientId, nonempty(dispatchId, 'dispatchId')) as
      { input_json: string; intent_sha256: string; instance_id: string | null; task_id: string | null } | undefined;
    if (!row) return null;
    const item = JSON.parse(row.input_json) as {
      dispatchId: string; workItemId: string; project: string; task: string;
      sourceRef: string; inputRef: string; options: Record<string, unknown> | null;
    };
    return { ...item, clientId: this.clientId, intentSha256: row.intent_sha256,
      instanceId: row.instance_id, taskId: row.task_id };
  }

  /** Dedupe observed events without triggering a second dispatch or approval. */
  ingestEvents(dispatchId: string, events: readonly CbObservedEvent[]): void {
    const prepared = this.lookup(dispatchId);
    if (!prepared?.instanceId || !prepared.taskId) throw new Error('DISPATCH_NOT_ACKNOWLEDGED');
    this.database.transaction(() => {
      for (const event of events) {
        if (event.instance_id !== prepared.instanceId || event.task_id !== prepared.taskId ||
            !Number.isSafeInteger(event.seq) || event.seq < 1 ||
            !['server', 'worker', 'host'].includes(event.origin)) {
          throw new Error('CB_EVENT_SCOPE_INVALID');
        }
        const body = canonical(event);
        const previous = this.database.db.prepare(
          'SELECT client_id,payload_json FROM charterion_cb_event WHERE instance_id=? AND task_id=? AND seq=?',
        ).get(event.instance_id, event.task_id, event.seq) as
          { client_id: string; payload_json: string } | undefined;
        if (previous) {
          if (previous.client_id !== this.clientId || previous.payload_json !== body) {
            throw new Error('CB_EVENT_CONFLICT');
          }
          continue;
        }
        this.database.db.prepare(
          'INSERT INTO charterion_cb_event(instance_id,task_id,seq,client_id,payload_json) VALUES(?,?,?,?,?)',
        ).run(event.instance_id, event.task_id, event.seq, this.clientId, body);
      }
    });
  }

  /** A gap never advances the durable cursor or fabricates missing observations. */
  contiguousCursor(dispatchId: string): number {
    const item = this.lookup(dispatchId);
    if (!item?.instanceId || !item.taskId) return 0;
    const rows = this.database.db.prepare(
      'SELECT seq FROM charterion_cb_event WHERE client_id=? AND instance_id=? AND task_id=? ORDER BY seq',
    ).all(this.clientId, item.instanceId, item.taskId) as { seq: number }[];
    let cursor = 0;
    for (const row of rows) {
      if (row.seq !== cursor + 1) break;
      cursor = row.seq;
    }
    return cursor;
  }
}
