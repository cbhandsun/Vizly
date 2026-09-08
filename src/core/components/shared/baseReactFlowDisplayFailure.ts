import type { BaseReactFlowRoutingSessionJob, BaseReactFlowRoutingSessionRuntime } from './baseReactFlowRoutingSessionRuntime';
import type { DisplayWorkerFailureCode } from './baseReactFlowDisplayFailureSummary';

export type BaseReactFlowDisplayFailureReason =
  | 'quality-rejected' | 'route-mismatch' | 'receipt-missing'
  | 'source-shape-mismatch' | 'session-commit-rejected'
  | 'worker-timeout' | 'worker-failed';

export type BaseReactFlowDisplayFailureIdentity = Readonly<{
  inputSignature: string;
  inputGeometryDigest: string;
}>;

export type BaseReactFlowDisplayFailure = BaseReactFlowDisplayFailureIdentity & Readonly<{
  jobId: number;
  reason: BaseReactFlowDisplayFailureReason;
  workerFailureCode?: DisplayWorkerFailureCode;
}>;

export const displayFailureMatchesInput = (
  failure: BaseReactFlowDisplayFailure | null,
  identity: BaseReactFlowDisplayFailureIdentity,
): boolean => failure !== null
  && failure.inputSignature === identity.inputSignature
  && failure.inputGeometryDigest === identity.inputGeometryDigest;

/** A rejected result has no authority to affect a newer geometry or session job. */
export const createCurrentDisplayFailure = ({
  runtime, job, requested, current, reason, workerFailureCode,
}: Readonly<{
  runtime: Pick<BaseReactFlowRoutingSessionRuntime, 'isCurrentJob'>;
  job: BaseReactFlowRoutingSessionJob;
  requested: BaseReactFlowDisplayFailureIdentity;
  current: BaseReactFlowDisplayFailureIdentity | null;
  reason: BaseReactFlowDisplayFailureReason;
  workerFailureCode?: DisplayWorkerFailureCode;
}>): BaseReactFlowDisplayFailure | null => (
  current && runtime.isCurrentJob(job)
  && requested.inputSignature === current.inputSignature
  && requested.inputGeometryDigest === current.inputGeometryDigest
    ? { ...requested, jobId: job.id, reason, ...(workerFailureCode ? { workerFailureCode } : {}) }
    : null
);

export const classifyDisplayFinalRejection = ({
  hardClean, routesMatch, hasReceipt,
}: Readonly<{ hardClean: boolean; routesMatch: boolean; hasReceipt: boolean }>):
BaseReactFlowDisplayFailureReason | null => {
  if (hardClean !== true) return 'quality-rejected';
  if (!routesMatch) return 'route-mismatch';
  return hasReceipt ? null : 'receipt-missing';
};

/** Never propagate worker-provided text to the UI or diagnostics. */
export const classifyDisplayWorkerFailure = (error: unknown): BaseReactFlowDisplayFailureReason | null => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return null;
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message === 'display-edge-worker-cancelled') return null;
    if (error.message === 'display-edge-worker-timeout') return 'worker-timeout';
    if (error.message.startsWith('display-edge-worker-final-quality-failed')) return 'quality-rejected';
  }
  return 'worker-failed';
};
