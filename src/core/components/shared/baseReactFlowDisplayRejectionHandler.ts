import {
  createCurrentDisplayFailure,
  type BaseReactFlowDisplayFailure,
  type BaseReactFlowDisplayFailureReason,
} from './baseReactFlowDisplayFailure';
import { updateDisplayRoutingDebugState } from './baseReactFlowDisplayRoutingDebug';
import { logBaseReactFlowQualityFallback } from './baseReactFlowLogging';
import type { BaseReactFlowRoutingSessionJob, BaseReactFlowRoutingSessionRuntime } from './baseReactFlowRoutingSessionRuntime';
import { classifyDisplayWorkerFailureCode } from './baseReactFlowDisplayFailureSummary';

type RejectionRequest = Readonly<{
  job: BaseReactFlowRoutingSessionJob | null;
  input: Readonly<{ cacheSignature: string; inputGeometryDigest: string }> | null;
}>;

/** Settles only the current request, keeping terminal state and feedback together. */
export const createDisplayRoutingRejectionHandler = ({
  runtime, inputSignature, inputGeometryDigest, readRequest, setFailure, onFallbackResolved,
}: Readonly<{
  runtime: BaseReactFlowRoutingSessionRuntime;
  inputSignature: string;
  inputGeometryDigest: string;
  readRequest: () => RejectionRequest | null;
  setFailure: (failure: BaseReactFlowDisplayFailure) => void;
  onFallbackResolved?: () => void;
}>) => (reason: BaseReactFlowDisplayFailureReason, error?: unknown): void => {
  const request = readRequest();
  if (!request?.job) return;
  const current = request.input;
  const rejected = createCurrentDisplayFailure({
    runtime, job: request.job, reason, workerFailureCode: classifyDisplayWorkerFailureCode(error),
    requested: { inputSignature, inputGeometryDigest },
    current: current
      ? { inputSignature: current.cacheSignature, inputGeometryDigest: current.inputGeometryDigest }
      : null,
  });
  if (!rejected) return;
  setFailure(rejected);
  updateDisplayRoutingDebugState({
    stage: reason === 'quality-rejected' ? 'final-quality-rejected' : 'final-routing-failed',
    signature: inputSignature,
    inputGeometryDigest,
    requestId: `${inputSignature}:${request.job.id}`,
    error: reason,
  });
  if (reason === 'quality-rejected' || reason === 'route-mismatch' || reason === 'receipt-missing') {
    logBaseReactFlowQualityFallback(reason);
  }
  onFallbackResolved?.();
};
