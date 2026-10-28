import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ControlDatabase } from '../src/database';
import { CharterionCbDispatchJournal, type CbDispatchInput, type CbObservedEvent } from '../src/charterionCbDispatchJournal';

const cleanups: Array<() => void> = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'char-cb-journal-'));
  const path = join(dir, 'control.db');
  const db = new ControlDatabase(path);
  cleanups.push(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db, path, journal: new CharterionCbDispatchJournal(db, 'trusted-charterion-client') };
}
const request: CbDispatchInput = {
  dispatchId: 'disp-001', workItemId: 'work-001', project: 'fixture',
  task: 'echo: 文字\n', sourceRef: 'repo@1234:workorder', inputRef: 'sha256:input',
};
function ev(seq: number): CbObservedEvent {
  return { seq, instance_id: 'cb-green', task_id: 'T-000123', run_id: 'run-1',
    type: 'CLAIMED', origin: 'server', received_at: '2026-10-28T12:00:00Z', evidence_refs: [] };
}
afterEach(() => { while (cleanups.length) cleanups.pop()?.(); });

describe('Charterion CB V0.1 dispatch journal (source-only)', () => {
  it('persists one exact intent and returns the original on repeated prepare', () => {
    const { journal } = setup();
    const first = journal.prepare(request);
    expect(first).toMatchObject({ dispatchId: request.dispatchId, clientId: 'trusted-charterion-client', taskId: null });
    expect(first.intentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(journal.prepare({ ...request })).toEqual(first);
    expect(() => journal.prepare({ ...request, task: 'DIFFERENT' })).toThrow('DISPATCH_CONFLICT');
    expect(() => journal.prepare({ ...request, project: 'different' })).toThrow('DISPATCH_CONFLICT');
  });

  it('can reconcile an unknown ACK after DB restart without creating a second identity', () => {
    const { db, path, journal } = setup();
    const first = journal.prepare(request);
    const ack = { instanceId: 'cb-green', taskId: 'T-000123', workItemId: first.workItemId, intentSha256: first.intentSha256 };
    expect(journal.recordAck(first.dispatchId, ack).taskId).toBe('T-000123');
    expect(journal.recordAck(first.dispatchId, ack).taskId).toBe('T-000123');
    expect(() => journal.recordAck(first.dispatchId, { ...ack, taskId: 'T-000456' })).toThrow('DISPATCH_ACK_CONFLICT');
    // Reopen through the same persistent SQLite file; original connection stays healthy.
    const reopened = new ControlDatabase(path);
    try {
      const again = new CharterionCbDispatchJournal(reopened, 'trusted-charterion-client');
      expect(again.lookup(first.dispatchId)?.taskId).toBe('T-000123');
      expect(again.prepare(request).intentSha256).toBe(first.intentSha256);
      expect(new CharterionCbDispatchJournal(reopened, 'other-client').lookup(first.dispatchId)).toBeNull();
    } finally { reopened.close(); }
  });

  it('keeps an ordered cursor, deduplicates replays, rejects conflicting seq payloads', () => {
    const { journal } = setup();
    const first = journal.prepare(request);
    journal.recordAck(first.dispatchId, {
      instanceId: 'cb-green', taskId: 'T-000123', workItemId: first.workItemId,
      intentSha256: first.intentSha256,
    });
    journal.ingestEvents(first.dispatchId, [ev(2)]);
    expect(journal.contiguousCursor(first.dispatchId)).toBe(0); // Gap: cannot acknowledge seq 2.
    journal.ingestEvents(first.dispatchId, [ev(1), ev(2)]);
    expect(journal.contiguousCursor(first.dispatchId)).toBe(2);
    expect(() => journal.ingestEvents(first.dispatchId, [{ ...ev(2), type: 'EXECUTION_FAILED' }])).toThrow('CB_EVENT_CONFLICT');
    expect(journal.contiguousCursor(first.dispatchId)).toBe(2);
    expect(() => journal.ingestEvents(first.dispatchId, [{ ...ev(3), instance_id: 'another-lane' }])).toThrow('CB_EVENT_SCOPE_INVALID');
  });

  it('requires durable dispatch ACK before accepting any CB event', () => {
    const { journal } = setup();
    journal.prepare(request);
    expect(() => journal.ingestEvents(request.dispatchId, [ev(1)])).toThrow('DISPATCH_NOT_ACKNOWLEDGED');
    expect(journal.contiguousCursor(request.dispatchId)).toBe(0);
  });
});
