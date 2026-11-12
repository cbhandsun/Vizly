import { OPERATIONS as operations, FAILURE_CODES as codes } from './operationTelemetry.js';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid telemetry');
  return value as Record<string, unknown>;
};
/** Projection, not spreading: client-controlled extra fields never reach the sink. */
export function projectTelemetryPayload(input: unknown) {
  const batch = object(input);
  if (batch.schema !== 'vizly-telemetry-v1' || typeof batch.releaseId !== 'string'
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(batch.releaseId) || !uuid(batch.streamId)
    || !integer(batch.sequence) || batch.sequence < 1 || !integer(batch.dropped)
    || !Array.isArray(batch.events) || batch.events.length > 64) throw Error('Invalid telemetry');
  const releaseId = batch.releaseId;
  const metricsInput = object(batch.metrics);
  const metrics = Object.fromEntries(operations.map(operation => {
    const m = object(metricsInput[operation]);
    if (!integer(m.started) || !integer(m.success) || !integer(m.failure) || !integer(m.cancelled)
      || m.success + m.failure + m.cancelled > m.started) throw Error('Invalid telemetry');
    return [operation, { started: m.started, success: m.success, failure: m.failure, cancelled: m.cancelled }];
  }));
  const events = batch.events.map(value => {
    const e = object(value);
    if (e.schema !== 'vizly-operation-v1' || e.releaseId !== releaseId || !uuid(e.requestId)
      || !operations.includes(e.operation as typeof operations[number])
      || !['success', 'failure', 'cancelled'].includes(e.outcome as string)
      || (e.outcome === 'success' ? e.code !== null : !codes.includes(e.code as typeof codes[number]))
      || (e.durationMs !== null && (!integer(e.durationMs) || e.durationMs > 86_400_000))) throw Error('Invalid telemetry');
    return { schema: 'vizly-operation-v1', releaseId, requestId: e.requestId,
      operation: e.operation as typeof operations[number], outcome: e.outcome as 'success' | 'failure' | 'cancelled',
      code: e.code as string | null, durationMs: e.durationMs as number | null };
  });
  return { schema: 'vizly-telemetry-v1', releaseId, streamId: batch.streamId,
    sequence: batch.sequence, dropped: batch.dropped, metrics, events };
}
export type AcceptedTelemetry = ReturnType<typeof projectTelemetryPayload>;
