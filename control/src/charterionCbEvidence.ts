import { createHash } from 'node:crypto';

export interface CbEvidenceSource {
  instanceId: string;
  taskId: string;
  clientId: string;
  dispatchId: string;
  workItemId: string;
  project: string;
  sourceRef: string;
  inputRef: string;
  intentSha256: string;
}
export interface CbExecutionObservation {
  execution_status: 'pending' | 'running' | 'done' | 'failed';
  tests_status: 'passed' | 'failed' | 'not_run';
  result_delivery_status: 'pending' | 'ready' | 'failed' | 'unavailable';
  handoff_status: 'not_required' | 'pending' | 'ready' | 'failed' | 'unavailable';
}
/** Host authenticates immutable receipt, manifest, base SHA, project and consumer scope.
 * This is a host boundary, never a JSON/model-supplied verification flag or new wire protocol.
 */
export interface TrustedCbEvidenceRead {
  read(source: Readonly<CbEvidenceSource>): Promise<{
    source: CbEvidenceSource;
    observation: CbExecutionObservation;
    receipt: null | {
      verified: boolean;
      resultRef: string;
      manifestRef: string;
      handoffRef: string | null;
      sha256: string;
      bytes: Uint8Array | null;
      producerId: string;
      provenance: string;
      sourceExecutionStatus: 'done' | 'failed';
      allowedConsumer: 'Reviewer';
    };
    review?: {
      verified: boolean;
      reviewerId: string;
      sha256: string;
      outcome: 'in_review' | 'passed' | 'rework_requested';
    };
  }>;
}
export interface CbEvidenceProjection {
  source: Readonly<CbEvidenceSource>;
  observation: CbExecutionObservation | null;
  verification: 'pending_verification' | 'verified' | 'blocked';
  review: 'pending_verification' | 'pending_independent_review' | 'in_review' | 'passed' | 'rework_requested';
  evidence: null | { resultRef: string; manifestRef: string; handoffRef: string | null;
    sha256: string; provenance: string };
  /** Stable identity for a downstream consumer's own dedupe; this adapter starts no review. */
  reviewerHandoff: null | { key: string; role: 'Reviewer' };
}
const present = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const digest = (s: string) => /^[a-f0-9]{64}$/.test(s);

/** Default disabled. No persistence, dispatch, scheduler, WorkItem completion or approval writes. */
export async function projectCbEvidence(source: CbEvidenceSource, host?: TrustedCbEvidenceRead): Promise<CbEvidenceProjection> {
  const bound = Object.freeze({ ...source });
  const result: CbEvidenceProjection = { source: bound, observation: null,
    verification: 'pending_verification', review: 'pending_verification', evidence: null, reviewerHandoff: null };
  if (!Object.values(bound).every(present) || !digest(bound.intentSha256)) {
    return { ...result, verification: 'blocked' };
  }
  if (!host) return result;
  let read: Awaited<ReturnType<TrustedCbEvidenceRead['read']>>;
  try { read = await host.read(bound); } catch { return result; }
  if (!read?.source || Object.keys(bound).some((key) =>
    read.source[key as keyof CbEvidenceSource] !== bound[key as keyof CbEvidenceSource])) {
    return { ...result, verification: 'blocked' };
  }
  const o = read.observation;
  if (!o || !['pending', 'running', 'done', 'failed'].includes(o.execution_status) ||
      !['passed', 'failed', 'not_run'].includes(o.tests_status) ||
      !['pending', 'ready', 'failed', 'unavailable'].includes(o.result_delivery_status) ||
      !['not_required', 'pending', 'ready', 'failed', 'unavailable'].includes(o.handoff_status)) {
    return { ...result, verification: 'blocked' };
  }
  result.observation = { ...o };
  const r = read.receipt;
  if (!r || !r.verified || !r.bytes) return result;
  if (!['done', 'failed'].includes(o.execution_status) || r.sourceExecutionStatus !== o.execution_status ||
      r.allowedConsumer !== 'Reviewer' || !present(r.producerId) || !present(r.provenance) ||
      !present(r.resultRef) || !present(r.manifestRef) || !digest(r.sha256) ||
      (r.handoffRef !== null && !present(r.handoffRef)) ||
      createHash('sha256').update(r.bytes).digest('hex') !== r.sha256) {
    return { ...result, verification: 'blocked' };
  }
  result.verification = 'verified';
  result.review = 'pending_independent_review';
  result.evidence = { resultRef: r.resultRef, manifestRef: r.manifestRef, handoffRef: r.handoffRef,
    sha256: r.sha256, provenance: r.provenance };
  result.reviewerHandoff = { role: 'Reviewer', key: JSON.stringify([bound, r.sha256]) };
  const review = read.review;
  if (review) {
    if (!review.verified || !present(review.reviewerId) || review.reviewerId === r.producerId ||
        review.sha256 !== r.sha256 || !['in_review', 'passed', 'rework_requested'].includes(review.outcome)) {
      return { ...result, verification: 'blocked', review: 'pending_verification', reviewerHandoff: null };
    }
    result.review = review.outcome;
  }
  return result;
}
