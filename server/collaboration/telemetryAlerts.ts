import { projectTelemetryPayload, type AcceptedTelemetry } from './telemetryPayload.js';
export interface TelemetryAlert {
  schema: 'vizly-alert-v1'; releaseId: string; requestId: string;
  operation: string; code: string;
}
export type AlertDelivery = (alert: Readonly<TelemetryAlert>, signal: AbortSignal) => Promise<void>;
/** One active delivery, six alerts/minute; no retry storm or unbounded queue. */
export function createTelemetryAlerts(deliver: AlertDelivery, now = Date.now) {
  let flight: Promise<void> | null = null;
  let abort: (() => void) | null = null;
  let stopped = false, circuitOpen = false, count = 0, windowStart = now();
  const seen = new Set<string>();
  const submit = (input: AcceptedTelemetry) => {
    if (stopped || circuitOpen || flight) return;
    let batch: AcceptedTelemetry;
    try { batch = projectTelemetryPayload(input); } catch { return; }
    const time = now();
    if (time - windowStart >= 60_000) { windowStart = time; count = 0; seen.clear(); }
    if (count >= 6) return;
    const event = batch.events.find(e => e.outcome === 'failure' && !seen.has(`${batch.releaseId}:${e.operation}:${e.code}`));
    if (!event) return;
    count++; seen.add(`${batch.releaseId}:${event.operation}:${event.code}`);
    const alert = Object.freeze({ schema: 'vizly-alert-v1' as const, releaseId: batch.releaseId,
      requestId: event.requestId, operation: event.operation, code: event.code ?? 'unknown' });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<void>(resolve => {
      abort = () => { controller.abort(); resolve(); };
      timer = setTimeout(() => { circuitOpen = true; abort?.(); }, 3000);
    });
    const delivery = Promise.resolve().then(() => {
      if (!controller.signal.aborted) return deliver(alert, controller.signal);
    }).then(() => {}, () => {});
    flight = Promise.race([delivery, timeout]).then(() => { clearTimeout(timer); abort = null; flight = null; });
  };
  return { submit, drain: () => flight ?? Promise.resolve(), stop: () => { stopped = true; abort?.(); } };
}
/** Operator-provided endpoint; browser input never chooses a delivery URL. */
export function createHttpAlertDelivery(endpoint: string, fetcher: typeof fetch = fetch): AlertDelivery {
  const url = new URL(endpoint);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash) throw Error('Invalid alert receiver');
  return async (alert, signal) => {
    const response = await fetcher(url, { method: 'POST', body: JSON.stringify(alert),
      headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error', credentials: 'omit' });
    if (!response.ok) throw Error('Alert delivery failed');
  };
}
