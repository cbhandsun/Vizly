import { AsyncLocalStorage } from 'node:async_hooks';
import { createOperationTelemetry, type Operation, type OperationTelemetry, type FailureCode } from './operationTelemetry.js';
const context = new AsyncLocalStorage<OperationTelemetry>();
let telemetry: OperationTelemetry = createOperationTelemetry({ releaseId: 'development' });
export function configureServerTelemetry(next: OperationTelemetry) {
  telemetry.dispose(); telemetry = next;
  return () => {
    next.dispose();
    if (telemetry === next) telemetry = createOperationTelemetry({ releaseId: 'development' });
  };
}
export const beginServerOperation = (operation: Operation) => (context.getStore() ?? telemetry).begin(operation);
export async function observeServerOperation<T>(operation: Operation, work: () => Promise<T>,
  rejected?: (result: T) => FailureCode | null): Promise<T> {
  const finish = beginServerOperation(operation);
  try {
    const result = await work();
    const code = rejected?.(result);
    finish(code ? 'failure' : 'success', code ?? undefined);
    return result;
  } catch (error) { finish('failure', 'unavailable'); throw error; }
}

/** Bind event callbacks explicitly: EventEmitter registration does not preserve async context. */
export function bindServerTelemetry<Args extends unknown[], Result>(
  collector: OperationTelemetry | undefined, work: (...args: Args) => Result,
): (...args: Args) => Result {
  const owner = collector ?? context.getStore() ?? telemetry;
  return (...args) => context.run(owner, () => work(...args));
}
