import { configureCoreDiagnosticsRuntime } from '@vizly/core/runtime';
import { configureApplicationTelemetry } from '../observability/applicationTelemetry';
import { createOperationTelemetry } from '../observability/operationTelemetry';
import { createHttpTelemetryTransport } from '../observability/httpTelemetryTransport';

export function installApplicationTelemetry(config: { enabled: unknown; releaseId: unknown }, fetcher: typeof fetch = fetch) {
  if (config.enabled !== 'true' || typeof config.releaseId !== 'string'
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(config.releaseId)) return () => {};
  const telemetry = createOperationTelemetry({
    releaseId: config.releaseId, transport: createHttpTelemetryTransport(fetcher),
  });
  const stopApplication = configureApplicationTelemetry(telemetry);
  const stopCore = configureCoreDiagnosticsRuntime({ begin: operation => {
    const finish = telemetry.begin(operation);
    return outcome => finish(outcome, outcome === 'cancelled' ? 'cancelled' : outcome === 'failure' ? 'unknown' : undefined);
  } });
  return () => { stopCore(); stopApplication(); };
}
