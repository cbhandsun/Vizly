import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createTelemetryHttp } from './telemetryHttp.js';

interface TelemetryRelayOptions {
  origin: string;
  ingestUrl: string;
  getToken: () => string | Promise<string>;
  fetchImplementation?: typeof fetch;
}

const publicHttps = (value: string): URL => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.port === '0' || !url.hostname.includes('.') || /^[0-9.]+$/.test(url.hostname)
    || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')
    || url.hostname.length > 253
    || url.hostname.split('.').some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    throw new Error('Invalid telemetry relay configuration');
  }
  return url;
};

/** Authenticate only the configured telemetry hop; browser credentials never cross it. */
export function createTelemetryRelay({ origin, ingestUrl, getToken,
  fetchImplementation = fetch }: TelemetryRelayOptions) {
  const source = publicHttps(origin);
  const target = publicHttps(ingestUrl);
  if (source.origin !== origin || target.href !== ingestUrl || target.pathname !== '/telemetry') {
    throw new Error('Invalid telemetry relay configuration');
  }
  const requests = new AsyncLocalStorage<AbortSignal>();
  // Reuse the production receiver's payload projection, 32-KiB body limit,
  // eight-request concurrency limit, 240/minute rate limit and five-second deadline.
  const receive = createTelemetryHttp({ origins: new Set([origin]), accept: async (batch, signal) => {
    const disconnected = requests.getStore();
    if (!disconnected) throw new Error('Telemetry relay request context missing');
    const combined = AbortSignal.any([signal, disconnected]);
    combined.throwIfAborted();
    const token = await getToken();
    combined.throwIfAborted();
    if (typeof token !== 'string' || token.length === 0 || token.length > 16_384) {
      throw new Error('Telemetry relay identity unavailable');
    }
    const response = await fetchImplementation(ingestUrl, {
      method: 'POST', redirect: 'error', signal: combined,
      headers: { 'Content-Type': 'application/json', Origin: origin,
        'x-vercel-trusted-oidc-idp-token': token },
      body: JSON.stringify(batch),
    });
    // Do not forward third-party bodies, headers, cookies, redirects or diagnostics.
    await response.body?.cancel();
    if (response.status !== 202) throw new Error('Telemetry relay upstream unavailable');
  } });
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const controller = new AbortController();
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', disconnected);
    response.once('close', disconnected);
    try { await requests.run(controller.signal, () => receive(request, response)); }
    finally {
      request.off('aborted', disconnected);
      response.off('close', disconnected);
      controller.abort();
    }
  };
}
