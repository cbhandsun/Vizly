/** Only semantic enums and generated correlation IDs cross this boundary. */
export const OPERATIONS = ['startup', 'save', 'connect', 'reconnect', 'permission', 'cas', 'lease', 'export', 'route'] as const;
export type Operation = typeof OPERATIONS[number];
export const FAILURE_CODES = ['unknown', 'initialization', 'readiness', 'mount', 'timeout', 'network', 'denied', 'conflict', 'unavailable', 'invalid', 'cancelled'] as const;
export type FailureCode = typeof FAILURE_CODES[number];
export type Outcome = 'success' | 'failure' | 'cancelled';
export interface OperationEvent {
  schema: 'vizly-operation-v1';
  releaseId: string;
  requestId: string;
  operation: Operation;
  outcome: Outcome;
  code: FailureCode | null;
  durationMs: number | null;
}
export interface OperationMetrics {
  started: number;
  success: number;
  failure: number;
  cancelled: number;
}
export interface TelemetryBatch {
  schema: 'vizly-telemetry-v1';
  releaseId: string;
  streamId: string;
  sequence: number;
  events: readonly Readonly<OperationEvent>[];
  metrics: Readonly<Record<Operation, Readonly<OperationMetrics>>>;
  dropped: number;
}
export type TelemetryTransport = (batch: TelemetryBatch, signal: AbortSignal) => Promise<void>;
interface TelemetryOptions {
  /** Commit or artifact hash, not arbitrary customer configuration. */
  releaseId: string;
  transport?: TelemetryTransport;
  now?: () => number;
}
const MAX_QUEUE = 64;
const MAX_EVENTS_PER_MINUTE = 120;
// Successful checks must not consume every slot needed to diagnose a later failure.
const MAX_NON_FAILURE_QUEUED = 48;
const MAX_NON_FAILURE_PER_MINUTE = 96;
const SEND_TIMEOUT_MS = 5_000;
const increment = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, value + 1);
const idleFinish = (_outcome: Outcome, _code?: FailureCode) => {};

export function createOperationTelemetry({ releaseId, transport, now = () => performance.now() }: TelemetryOptions) {
  const release = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(releaseId) ? releaseId : 'development';
  const metrics = Object.fromEntries(OPERATIONS.map(operation => [operation,
    { started: 0, success: 0, failure: 0, cancelled: 0 }])) as Record<Operation, OperationMetrics>;
  let queue: OperationEvent[] = [];
  let metricsDirty = false;
  let streamId = '';
  let sequence = 0;
  let disposed = false;
  let transportStopped = false;
  let dropped = 0;
  let windowStart: number | null = null;
  let windowCount = 0;
  let nonFailureWindowCount = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: Promise<void> | undefined;
  let cancelFlight: (() => void) | undefined;
  const clock = (): number | null => {
    try { const value = now(); return Number.isFinite(value) && value >= 0 ? value : null; } catch { return null; }
  };
  const snapshot = (): TelemetryBatch => Object.freeze({
    schema: 'vizly-telemetry-v1', releaseId: release, streamId, sequence,
    events: Object.freeze(queue.map(event => Object.freeze({ ...event }))),
    metrics: Object.freeze(Object.fromEntries(OPERATIONS.map(operation => [operation,
      Object.freeze({ ...metrics[operation] })])) as Record<Operation, OperationMetrics>), dropped,
  });
  const schedule = () => {
    if (!disposed && !transportStopped && transport && (queue.length > 0 || metricsDirty) && !timer && !flight) {
      timer = setTimeout(() => { timer = undefined; void flush(); }, 250);
    }
  };
  const flush = (): Promise<void> => {
    if (flight) return flight;
    if (disposed || transportStopped || !transport || (!queue.length && !metricsDirty)) return Promise.resolve();
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    sequence += 1;
    const batch = snapshot(); queue = []; metricsDirty = false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<void>(resolve => {
      cancelFlight = () => { controller.abort(); resolve(); };
      timeout = setTimeout(() => {
        // A transport ignoring AbortSignal must not accumulate unresolved sends.
        transportStopped = true;
        dropped = Math.min(Number.MAX_SAFE_INTEGER, dropped + queue.length);
        queue = []; cancelFlight?.();
      }, SEND_TIMEOUT_MS);
    });
    // Deferring also contains synchronous throws from third-party adapters.
    const send = Promise.resolve().then(() => {
      if (!controller.signal.aborted) return transport(batch, controller.signal);
    }).then(() => {}, () => {});
    flight = Promise.race([send, cancelled]).then(() => {
      if (timeout !== undefined) clearTimeout(timeout);
      cancelFlight = undefined; flight = undefined; schedule();
    });
    return flight;
  };
  const begin = (operation: Operation) => {
    if (disposed || !transport || !OPERATIONS.includes(operation)) return idleFinish;
    const started = clock();
    // Never accept an externally supplied identifier or copy an Error payload.
    let requestId: string;
    try { requestId = crypto.randomUUID(); streamId ||= crypto.randomUUID(); } catch { return idleFinish; }
    metrics[operation].started = increment(metrics[operation].started);
    metricsDirty = true; schedule();
    let finished = false;
    return (outcome: Outcome, code?: FailureCode) => {
      if (finished || disposed) return;
      finished = true;
      const safeOutcome = outcome === 'success' || outcome === 'cancelled' ? outcome : 'failure';
      metrics[operation][safeOutcome] = increment(metrics[operation][safeOutcome]);
      metricsDirty = true;
      const ended = clock();
      const duration = started !== null && ended !== null && ended >= started && ended - started <= 86_400_000
        ? Math.round(ended - started) : null;
      if (ended !== null && (windowStart === null || ended - windowStart >= 60_000)) {
        windowStart = ended; windowCount = 0; nonFailureWindowCount = 0;
      }
      const nonFailure = safeOutcome !== 'failure';
      const normalCapacityUsed = nonFailure && (nonFailureWindowCount >= MAX_NON_FAILURE_PER_MINUTE
        || queue.filter(event => event.outcome !== 'failure').length >= MAX_NON_FAILURE_QUEUED);
      if (transportStopped || queue.length >= MAX_QUEUE || windowCount >= MAX_EVENTS_PER_MINUTE || normalCapacityUsed) {
        dropped = increment(dropped); schedule(); return;
      }
      windowCount += 1;
      if (nonFailure) nonFailureWindowCount += 1;
      queue.push({ schema: 'vizly-operation-v1', releaseId: release, requestId, operation,
        outcome: safeOutcome, code: safeOutcome === 'success' ? null
          : code && FAILURE_CODES.includes(code) ? code : safeOutcome === 'cancelled' ? 'cancelled' : 'unknown', durationMs: duration });
      schedule();
    };
  };
  return { begin, flush, snapshot, dispose: () => {
    disposed = true; queue = [];
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined; cancelFlight?.();
  } };
}
export type OperationTelemetry = ReturnType<typeof createOperationTelemetry>;
