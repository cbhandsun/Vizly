import { readRoutingObservation } from './baseReactFlowRoutingObservation';

const workerCodes = {
  'display-edge-worker-unavailable': 'worker-creation',
  'display-edge-worker-post-failed': 'request-post',
  'display-edge-worker-message-error': 'response-decode',
  'display-edge-worker-invalid-response': 'response-validation',
  'display-edge-worker-commit-receipt-mismatch': 'response-validation',
  'display-edge-worker-resolution-mismatch': 'response-validation',
  'display-edge-worker-candidate-mismatch': 'response-validation',
  'display-edge-worker-empty-response': 'response-validation',
  'display-edge-worker-error': 'worker-runtime',
  'display-edge-worker-failed': 'worker-execution',
  'display-edge-worker-timeout': 'worker-wait',
} as const;

export type DisplayWorkerFailureCode = keyof typeof workerCodes;
const isWorkerCode = (value: unknown): value is DisplayWorkerFailureCode => (
  typeof value === 'string' && Object.hasOwn(workerCodes, value)
);

/** Only exact client/protocol codes are exportable; never parse arbitrary text. */
export const classifyDisplayWorkerFailureCode = (error: unknown): DisplayWorkerFailureCode | undefined => (
  error instanceof Error && isWorkerCode(error.message) ? error.message : undefined
);

const reasons = ['quality-rejected', 'route-mismatch', 'receipt-missing',
  'source-shape-mismatch', 'session-commit-rejected', 'worker-timeout', 'worker-failed'];

/** Content-free user export, independent of graph identity and debug globals. */
export const summarizeDisplayRoutingFailure = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('reason' in value) || typeof value.reason !== 'string' || !reasons.includes(value.reason)) return null;
  const candidate = 'workerFailureCode' in value && isWorkerCode(value.workerFailureCode)
    ? value.workerFailureCode : null;
  const code = value.reason === 'worker-timeout' && candidate === 'display-edge-worker-timeout'
    ? candidate : value.reason === 'worker-failed' && candidate !== 'display-edge-worker-timeout' ? candidate : null;
  const observation = readRoutingObservation(value);
  return {
    schema: 'vizly-routing-failure-v1',
    reason: value.reason,
    stage: code ? workerCodes[code] : value.reason === 'worker-timeout' ? 'worker-wait'
      : value.reason === 'worker-failed' ? 'unknown'
        : value.reason === 'quality-rejected' ? 'quality-acceptance' : 'transaction-acceptance',
    code,
    ...(observation ? { observation } : {}),
  };
};
