// @vitest-environment node
import { createServer, request as httpRequest, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createTelemetryRelay } from './telemetryRelay.js';
import { createOperationTelemetry, type TelemetryBatch } from './operationTelemetry.js';

const origin = 'https://frontend.example.com';
const ingestUrl = 'https://backend.example.com/telemetry';
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
async function batch() {
  let output: TelemetryBatch | undefined;
  const telemetry = createOperationTelemetry({ releaseId: 'a'.repeat(40), transport: async value => { output = value; } });
  telemetry.begin('startup')('success');
  await telemetry.flush(); telemetry.dispose();
  if (!output) throw new Error('Fixture missing');
  return output;
}
async function start(options: Parameters<typeof createTelemetryRelay>[0]) {
  const server = createServer(createTelemetryRelay(options));
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture address missing');
  return `http://127.0.0.1:${address.port}/telemetry`;
}
const headers = { Origin: origin, 'Content-Type': 'application/json' };
const deferred = <T>() => {
  let complete: (value: T) => void = () => { throw new Error('Fixture not initialized'); };
  const promise = new Promise<T>(resolve => { complete = resolve; });
  return { promise, resolve: (value: T) => complete(value) };
};

it('uses workload identity, projects the actual protocol and withholds upstream headers and body', async () => {
  const payload = await batch();
  const getToken = vi.fn(async () => 'SYNTHETIC-WORKLOAD-IDENTITY');
  const forward = vi.fn<typeof fetch>(async (target, options) => {
    expect(target).toBe(ingestUrl);
    expect(options?.redirect).toBe('error');
    expect(options?.headers).toEqual({ Origin: origin, 'Content-Type': 'application/json',
      'x-vercel-trusted-oidc-idp-token': 'SYNTHETIC-WORKLOAD-IDENTITY' });
    expect(JSON.parse(String(options?.body))).toEqual(payload);
    expect(options?.signal?.aborted).toBe(false);
    return new Response('UPSTREAM-PRIVATE', { status: 202, headers: { 'Set-Cookie': 'PRIVATE=VALUE' } });
  });
  const url = await start({ origin, ingestUrl, getToken, fetchImplementation: forward });
  const response = await fetch(url, { method: 'POST', headers: { ...headers,
    Authorization: 'Bearer BROWSER-CREDENTIAL', Cookie: 'BROWSER-COOKIE',
    'x-vercel-trusted-oidc-idp-token': 'BROWSER-SPOOF' },
  body: JSON.stringify({ ...payload, token: 'UNTRUSTED-EXTRA', events: payload.events.map(event => ({ ...event, body: 'UNTRUSTED-EXTRA' })) }) });
  expect(response.status).toBe(202); expect(await response.text()).toBe('');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(getToken).toHaveBeenCalledOnce(); expect(forward).toHaveBeenCalledOnce();
});

it('rejects invalid methods, origins, content types and payloads before obtaining identity', async () => {
  const getToken = vi.fn(async () => 'SYNTHETIC'); const forward = vi.fn<typeof fetch>();
  const url = await start({ origin, ingestUrl, getToken, fetchImplementation: forward });
  expect((await fetch(url)).status).toBe(405);
  expect((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.example.com' }, body: '{}' })).status).toBe(403);
  expect((await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
  expect((await fetch(url, { method: 'POST', headers, body: '{}' })).status).toBe(400);
  expect(getToken).not.toHaveBeenCalled(); expect(forward).not.toHaveBeenCalled();
});

it.each(['', 'x'.repeat(16_385)])('fails closed on missing or oversized workload identity %#', async token => {
  const forward = vi.fn<typeof fetch>();
  const url = await start({ origin, ingestUrl, getToken: () => token, fetchImplementation: forward });
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(await batch()) });
  expect(response.status).toBe(503); expect(await response.text()).toBe(''); expect(forward).not.toHaveBeenCalled();
});

it.each([302, 401, 403, 500])('refuses upstream status %s without forwarding redirects or error details', async status => {
  const forward = vi.fn<typeof fetch>(async () => new Response('PRIVATE-UPSTREAM-DETAILS', {
    status, headers: { Location: 'https://other.example.com/', 'Set-Cookie': 'PRIVATE=VALUE' },
  }));
  const url = await start({ origin, ingestUrl, getToken: () => 'SYNTHETIC', fetchImplementation: forward });
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(await batch()), redirect: 'manual' });
  expect(response.status).toBe(503); expect(await response.text()).toBe('');
  expect(response.headers.get('location')).toBeNull(); expect(response.headers.get('set-cookie')).toBeNull();
  expect(forward).toHaveBeenCalledOnce();
});

it('aborts only the disconnected browser request while a concurrent peer still completes', async () => {
  const first = await batch(); const second = await batch();
  const started = deferred<AbortSignal>();
  const peerStarted = deferred<AbortSignal>(); const finishPeer = deferred<Response>();
  const aborted = deferred<void>();
  const forward: typeof fetch = async (_target, options) => new Promise<Response>((_resolve, reject) => {
    const signal = options?.signal;
    if (!signal) { reject(new Error('Missing cancellation')); return; }
    const isFirst = (JSON.parse(String(options?.body)) as TelemetryBatch).streamId === first.streamId;
    signal.addEventListener('abort', () => { if (isFirst) aborted.resolve(); reject(new Error('Cancelled')); }, { once: true });
    if (isFirst) started.resolve(signal);
    else { peerStarted.resolve(signal); void finishPeer.promise.then(_resolve); }
  });
  const url = await start({ origin, ingestUrl, getToken: () => 'SYNTHETIC', fetchImplementation: forward });
  const client = httpRequest(url, { method: 'POST', headers });
  client.on('error', () => {}); client.end(JSON.stringify(first));
  const signal = await started.promise; expect(signal.aborted).toBe(false);
  const peer = fetch(url, { method: 'POST', headers, body: JSON.stringify(second) });
  const peerSignal = await peerStarted.promise;
  client.destroy(); await aborted.promise; expect(signal.aborted).toBe(true);
  expect(peerSignal.aborted).toBe(false);
  finishPeer.resolve(new Response(null, { status: 202 }));
  expect((await peer).status).toBe(202);
});

it.each([
  ['http://frontend.example.com', ingestUrl],
  ['https://frontend.example.com/', ingestUrl],
  [origin, 'https://backend.example.com/other'],
  [origin, 'https://user:password@backend.example.com/telemetry'],
  [origin, 'https://127.0.0.1/telemetry'],
  [origin, 'https://backend.example.com/telemetry?token=PRIVATE'],
])('rejects unsafe or noncanonical operator configuration %#', (allowedOrigin, target) => {
  expect(() => createTelemetryRelay({ origin: allowedOrigin, ingestUrl: target, getToken: () => 'SYNTHETIC' })).toThrow();
});
