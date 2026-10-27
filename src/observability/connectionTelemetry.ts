import { beginApplicationOperation } from './applicationTelemetry';
/** Connection success means initial document sync, not merely an open socket. */
export function createConnectionTelemetry() {
  let finish: ReturnType<typeof beginApplicationOperation> | null = beginApplicationOperation('connect');
  let disposed = false;
  return {
    status(status: 'connecting' | 'connected' | 'disconnected') {
      if (disposed) return;
      if (status === 'connecting' && !finish) finish = beginApplicationOperation('reconnect');
      if (status === 'disconnected' && finish) { finish('failure', 'network'); finish = null; }
    },
    synced() { if (!disposed && finish) { finish('success'); finish = null; } },
    dispose() { disposed = true; finish?.('cancelled', 'cancelled'); finish = null; },
  };
}
