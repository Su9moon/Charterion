import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { projectCbEvidence, type CbEvidenceSource, type TrustedCbEvidenceRead } from '../src/charterionCbEvidence';
const source: CbEvidenceSource = { instanceId: 'instance', taskId: 'T-1', clientId: 'client', dispatchId: 'dispatch',
  workItemId: 'work', project: 'project', sourceRef: 'repo@workorder', inputRef: 'base-sha', intentSha256: 'a'.repeat(64) };
const bytes = Buffer.from('exact\r\nresult');
function fixture() {
  return { source: { ...source }, observation: { execution_status: 'done', tests_status: 'passed',
    result_delivery_status: 'ready', handoff_status: 'ready' }, receipt: { verified: true,
    resultRef: 'result:1', manifestRef: 'manifest:1', handoffRef: 'handoff:1', bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'), producerId: 'worker', provenance: 'receipt:1',
    sourceExecutionStatus: 'done', allowedConsumer: 'Reviewer' } } satisfies Awaited<ReturnType<TrustedCbEvidenceRead['read']>>;
}
const host = (value: Awaited<ReturnType<TrustedCbEvidenceRead['read']>>): TrustedCbEvidenceRead => ({ read: async () => value });
it('done and passing tests without verified bytes remain pending; disabled by default', async () => {
  expect((await projectCbEvidence(source)).verification).toBe('pending_verification');
  for (const receipt of [null, { ...fixture().receipt, verified: false }, { ...fixture().receipt, bytes: null }]) {
    const p = await projectCbEvidence(source, host({ ...fixture(), receipt }));
    expect(p.verification).toBe('pending_verification');
    expect(p.reviewerHandoff).toBeNull();
    expect(p.observation?.execution_status).toBe('done');
  }
});
it('verified exact bytes preserve identity and provenance, awaiting independent review', async () => {
  const p = await projectCbEvidence(source, host(fixture()));
  expect(p.source).toEqual(source);
  expect(p.evidence).toEqual({ resultRef: 'result:1', manifestRef: 'manifest:1', handoffRef: 'handoff:1',
    sha256: fixture().receipt.sha256, provenance: 'receipt:1' });
  expect(p.verification).toBe('verified');
  expect(p.review).toBe('pending_independent_review');
});
it('failed recoverable source stays failed independently of delivery and tests', async () => {
  const f = fixture();
  const p = await projectCbEvidence(source, host({ ...f,
    observation: { ...f.observation, execution_status: 'failed', tests_status: 'failed', result_delivery_status: 'failed' },
    receipt: { ...f.receipt, sourceExecutionStatus: 'failed' } }));
  expect(p.observation?.execution_status).toBe('failed');
  expect(p.review).toBe('pending_independent_review');
});
it('forged scope, missing source, digest mismatch and inconsistent terminal receipt fail closed', async () => {
  const f = fixture();
  for (const value of [{ ...f, source: { ...source, taskId: 'forged' } },
    { ...f, source: { ...source, sourceRef: '' } },
    { ...f, receipt: { ...f.receipt, bytes: Buffer.from('forged') } },
    { ...f, receipt: { ...f.receipt, sourceExecutionStatus: 'failed' as const } }]) {
    const p = await projectCbEvidence(source, host(value));
    expect(p.verification).toBe('blocked');
    expect(p.reviewerHandoff).toBeNull();
  }
});
it('replays have stable handoff identity, cannot self-approve, and preserve independent returned outcomes', async () => {
  const f = fixture();
  expect(await projectCbEvidence(source, host(f))).toEqual(await projectCbEvidence(source, host(f)));
  const review = { verified: true, reviewerId: 'worker', sha256: f.receipt.sha256, outcome: 'passed' as const };
  expect((await projectCbEvidence(source, host({ ...f, review }))).verification).toBe('blocked');
  for (const outcome of ['in_review', 'passed', 'rework_requested'] as const) {
    expect((await projectCbEvidence(source, host({ ...f, review: { ...review, reviewerId: 'independent', outcome } }))).review).toBe(outcome);
  }
});
