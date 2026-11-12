import { createOperationTelemetry, type Operation, type OperationTelemetry } from './operationTelemetry';
let telemetry: OperationTelemetry = createOperationTelemetry({ releaseId: 'development' });
/** Explicit opt-in by the host; replacing an adapter releases the previous instance. */
export function configureApplicationTelemetry(next: OperationTelemetry): () => void {
  telemetry.dispose(); telemetry = next;
  return () => {
    next.dispose();
    if (telemetry === next) telemetry = createOperationTelemetry({ releaseId: 'development' });
  };
}
export const beginApplicationOperation = (operation: Operation) => telemetry.begin(operation);

/** Read numeric protocol status only; never messages, URLs, bodies or stack traces. */
export function classifyOperationFailure(error: unknown): import('./operationTelemetry').FailureCode {
  try {
    if (!error || typeof error !== 'object') return 'unknown';
    const status = Object.getOwnPropertyDescriptor(error, 'status')?.value;
    if (status === 401 || status === 403) return 'denied';
    if (status === 409 || status === 412) return 'conflict';
    if (status === 408 || status === 504) return 'timeout';
    if (status === 429 || status === 503) return 'unavailable';
    const name = Object.getOwnPropertyDescriptor(error, 'name')?.value;
    if (name === 'AbortError') return 'cancelled';
    if (name === 'TimeoutError') return 'timeout';
  } catch { /* Proxies and accessors must not interfere with error handling. */ }
  return 'unknown';
}
