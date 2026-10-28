import { afterEach, expect, it, vi } from 'vitest';
import { ControlDatabase } from '../src/database';
import { CharterionCbDispatchJournal, type CbObservedEvent } from '../src/charterionCbDispatchJournal';
import { CharterionCbReconciler, type CbRequestLookup } from '../src/charterionCbReconciler';

const databases: ControlDatabase[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); });
function setup() {
  const db = new ControlDatabase(':memory:');
  databases.push(db);
  const journal = new CharterionCbDispatchJournal(db, 'client');
  const intent = journal.prepare({ dispatchId: 'dispatch', workItemId: 'work', project: 'green',
    task: 'exact\n', sourceRef: 'repo@sha', inputRef: 'sha' });
  const ack: CbRequestLookup = { found: true, task: { id: 'T-1', status: 'done', project: 'green', integration: {
    protocol_version: 'charterion-cb/1.0', instance_id: 'instance', client_id: 'client',
    dispatch_id: 'dispatch', work_item_id: 'work', intent_sha256: intent.intentSha256,
  } } };
  const reader = {
    get_task_by_request: vi.fn(async (): Promise<CbRequestLookup> => ack),
    get_task_events: vi.fn(async () => ({ events: [] as CbObservedEvent[], next_seq: 0, last_seq: 0, has_more: false })),
  };
  const binding = { clientId: 'client', instanceId: 'instance', project: 'green', eventPageMax: 2 };
  return { db, journal, ack, reader, binding, reconciler: new CharterionCbReconciler(journal, binding, reader) };
}
it('absent ACK, missing reader and failed reads never create an ACK or task', async () => {
  const { journal, reader, binding, reconciler } = setup();
  reader.get_task_by_request.mockResolvedValue({ found: false });
  expect(await reconciler.reconcile('dispatch')).toEqual({ status: 'unknown', reason: 'CB_ACK_ABSENT' });
  reader.get_task_by_request.mockRejectedValue(new Error('offline/capability unavailable'));
  expect((await reconciler.reconcile('dispatch')).status).toBe('unknown');
  expect((await new CharterionCbReconciler(journal, binding).reconcile('dispatch')).status).toBe('blocked');
  expect(journal.lookup('dispatch')?.taskId).toBeNull();
  expect(reader.get_task_events).not.toHaveBeenCalled();
});
it('recovers an unknown submission durably with one identity and no WorkItem completion', async () => {
  const { db, journal, reader, reconciler, ack } = setup();
  for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
    db.db.exec(`CREATE TRIGGER forbid_work_${operation} BEFORE ${operation} ON organization_work_items
      BEGIN SELECT RAISE(ABORT, 'Reconciliation must never write WorkItems'); END`);
  }
  const before = db.db.prepare('SELECT * FROM organization_work_items').all();
  reader.get_task_by_request.mockResolvedValueOnce({ found: false }).mockResolvedValue(ack);
  await reconciler.reconcile('dispatch');
  expect((await reconciler.reconcile('dispatch')).status).toBe('observed');
  await reconciler.reconcile('dispatch');
  expect(new CharterionCbDispatchJournal(db, 'client').lookup('dispatch')?.taskId).toBe('T-1');
  expect(db.db.prepare('SELECT count(*) AS n FROM charterion_cb_dispatch').get()).toEqual({ n: 1 });
  expect(db.db.prepare('SELECT * FROM organization_work_items').all()).toEqual(before);
  expect(reader.get_task_by_request).toHaveBeenCalledWith('client', 'dispatch');
  expect(Object.keys(reader).sort()).toEqual(['get_task_by_request', 'get_task_events']);
  expect(journal.contiguousCursor('dispatch')).toBe(0);
});
it('rejects conflicting task, project, digest, instance and request scope', async () => {
  const { journal, reader, reconciler, ack } = setup();
  if (!ack.found) throw new Error('fixture');
  await reconciler.reconcile('dispatch');
  for (const task of [
    { ...ack.task, id: 'T-2' }, { ...ack.task, project: 'blue' },
    ...['intent_sha256', 'instance_id', 'client_id', 'dispatch_id', 'work_item_id', 'protocol_version'].map((key) =>
      ({ ...ack.task, integration: { ...ack.task.integration, [key]: 'wrong' } })),
  ]) {
    reader.get_task_by_request.mockResolvedValue({ found: true, task });
    await expect(reconciler.reconcile('dispatch')).rejects.toThrow();
    expect(journal.lookup('dispatch')?.taskId).toBe('T-1');
  }
  expect(reader.get_task_events).toHaveBeenCalledTimes(1);
});
it('bounds pages and preserves replay, gap, conflict and scope cursor rules', async () => {
  const { reader, reconciler, journal } = setup();
  const event = (seq: number): CbObservedEvent => ({ seq, instance_id: 'instance', task_id: 'T-1', run_id: null,
    type: 'RESULT_PRESERVED', origin: 'server', received_at: '2026-10-28T00:00:00Z', evidence_refs: [] });
  const page = (events: CbObservedEvent[]) => ({ events, next_seq: 2, last_seq: 2, has_more: false });
  reader.get_task_events.mockResolvedValue(page([event(2)]));
  expect(await reconciler.reconcile('dispatch')).toMatchObject({ cursor: 0 });
  reader.get_task_events.mockResolvedValue(page([event(1), event(2)]));
  expect(await reconciler.reconcile('dispatch')).toMatchObject({ cursor: 2 });
  expect(await reconciler.reconcile('dispatch')).toMatchObject({ cursor: 2 });
  expect(reader.get_task_events).toHaveBeenLastCalledWith('T-1', 2, 2);
  for (const events of [[event(1), event(2), event(2)], [{ ...event(2), type: 'CLAIMED' }],
    [{ ...event(2), instance_id: 'blue' }]]) {
    reader.get_task_events.mockResolvedValue(page(events));
    await expect(reconciler.reconcile('dispatch')).rejects.toThrow();
    expect(journal.contiguousCursor('dispatch')).toBe(2);
  }
  reader.get_task_events.mockRejectedValue(new Error('offline'));
  expect((await reconciler.reconcile('dispatch')).status).toBe('unknown');
  expect(journal.lookup('dispatch')?.taskId).toBe('T-1');
});
