import type { TelemetryTransport } from './operationTelemetry.js';
/** Same-origin endpoint only; never send cookies, referrers or authorization headers. */
export function createHttpTelemetryTransport(fetcher: typeof fetch = fetch): TelemetryTransport {
  return async (batch, signal) => {
    const response = await fetcher('/telemetry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch), credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', cache: 'no-store', signal,
    });
    // Response text may contain third-party data: never read or log it.
    if (!response.ok) throw new Error('Telemetry delivery failed');
  };
}
