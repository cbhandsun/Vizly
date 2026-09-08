/** Epoch-relative monotonic times; never Date.now() values or graph content. */
export type DisplayWorkerExecutionTiming = {
  readyAt: number;
  receivedAt: number;
  finishedAt: number;
};

const isTimestamp = (value: unknown): value is number => typeof value === 'number'
  && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

export const parseDisplayWorkerExecutionTiming = (value: unknown): DisplayWorkerExecutionTiming | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('readyAt' in value) || !('receivedAt' in value) || !('finishedAt' in value)
    || !isTimestamp(value.readyAt) || !isTimestamp(value.receivedAt) || !isTimestamp(value.finishedAt)
    || value.receivedAt < value.readyAt || value.finishedAt < value.receivedAt
    || value.finishedAt - value.receivedAt > 600_000) return null;
  // A reusable worker may have been ready for hours. Only request execution has
  // a ten-minute bound; startup age is not a request duration.
  return { readyAt: value.readyAt, receivedAt: value.receivedAt, finishedAt: value.finishedAt };
};

type DisplayWorkerTimingMetadata = {
  workerDurationMs?: number;
  workerExecutionTiming?: DisplayWorkerExecutionTiming;
};

export const parseDisplayWorkerTimingMetadata = (value: Record<string, unknown>): DisplayWorkerTimingMetadata | null => {
  const duration = value.workerDurationMs;
  const execution = value.workerExecutionTiming === undefined
    ? undefined : parseDisplayWorkerExecutionTiming(value.workerExecutionTiming);
  if ((duration !== undefined && (!isTimestamp(duration) || duration > 600_000))
    || execution === null) return null;
  if (execution && (duration === undefined
    || Math.abs(execution.finishedAt - execution.receivedAt - duration) > 1)) return null;
  return { workerDurationMs: duration, workerExecutionTiming: execution };
};
