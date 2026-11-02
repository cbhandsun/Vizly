// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { OPERATIONS } from './operationTelemetry.js';
import { createSupabaseTelemetryJournal } from './supabaseTelemetryJournal.js';

const url = 'https://telemetry.example.test';
const key = 'sb_secret_SYNTHETIC_SERVER_ONLY_12345678';
const release = 'a'.repeat(40);
const requestId = '11111111-1111-4111-8111-111111111111';
const signal = () => new AbortController().signal;
const batch = () => ({ schema: 'vizly-telemetry-v1', releaseId: release,
  streamId: '22222222-2222-4222-8222-222222222222', sequence: 1, dropped: 0,
  metrics: Object.fromEntries(OPERATIONS.map(operation => [operation, { started: 1, success: 0, failure: 1, cancelled: 0 }])),
  events: [{ schema: 'vizly-operation-v1', releaseId: release, requestId,
    operation: 'save', outcome: 'failure', code: 'network', durationMs: 12 }],
});
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});

it('projects before persistence, uses only the server key and does not follow redirects', async () => {
  const transport = vi.fn<typeof fetch>(async () => response({ accepted: true, stored: true }));
  const journal = createSupabaseTelemetryJournal(url, key, transport);
  const value = batch();
  await journal.accept({ ...value, prompt: 'PRIVATE-CANARY', token: 'PRIVATE-CANARY',
    events: value.events.map(event => ({ ...event, userId: 'PRIVATE-CANARY' })) }, signal());
  await journal.drain();
  const [target, init] = transport.mock.calls[0];
  expect(String(target)).toBe(`${url}/rest/v1/rpc/vizly_record_telemetry`);
  expect(init?.redirect).toBe('error');
  expect(new Headers(init?.headers).get('apikey')).toBe(key);
  expect(JSON.parse(String(init?.body))).toEqual({ p_batch: value });
  expect(String(init?.body)).not.toContain('PRIVATE-CANARY');
  expect(Object.keys(journal).sort()).toEqual(['accept', 'claimAlert', 'drain', 'query']);
});

it.each(['http://telemetry.example.test', 'https://user:password@telemetry.example.test',
  `${url}/path`, `${url}?token=PRIVATE-CANARY`, `${url}#fragment`])('rejects unsafe configuration without echoing it: %s', target => {
  expect(() => createSupabaseTelemetryJournal(target, key)).toThrow('Telemetry storage unavailable');
});
it.each(['sb_publishable_SYNTHETIC_12345678', 'PRIVATE-CANARY', undefined])('rejects a non-server credential', credential => {
  expect(() => createSupabaseTelemetryJournal(url, credential)).toThrow('Telemetry storage unavailable');
});

it('rejects invalid batches and already cancelled writes before issuing a request', async () => {
  const transport = vi.fn<typeof fetch>();
  const journal = createSupabaseTelemetryJournal(url, key, transport);
  await expect(journal.accept({ ...batch(), sequence: 0 }, signal())).rejects.toThrow('Invalid telemetry');
  const controller = new AbortController(); controller.abort();
  await expect(journal.accept(batch(), controller.signal)).rejects.toThrow('Telemetry storage unavailable');
  expect(transport).not.toHaveBeenCalled();
});

it('bounds concurrent requests, drains owned work and releases capacity', async () => {
  const complete: Array<() => void> = [];
  const transport = vi.fn<typeof fetch>(() => new Promise(resolve => {
    complete.push(() => resolve(response({ accepted: true, stored: true })));
  }));
  const journal = createSupabaseTelemetryJournal(url, key, transport);
  const writes = Array.from({ length: 8 }, (_, index) => journal.accept({ ...batch(), sequence: index + 1 }, signal()));
  await vi.waitFor(() => expect(complete).toHaveLength(8));
  await expect(journal.accept(batch(), signal())).rejects.toThrow('Telemetry storage unavailable');
  let drained = false; const drain = journal.drain().then(() => { drained = true; });
  await Promise.resolve(); expect(drained).toBe(false);
  for (const finish of complete) finish();
  await Promise.all(writes); await drain; expect(drained).toBe(true);
  const last = journal.accept(batch(), signal());
  await vi.waitFor(() => expect(complete).toHaveLength(9)); complete[8](); await last;
});

it('propagates caller cancellation to an in-flight request and sanitizes the rejection', async () => {
  const transport = vi.fn<typeof fetch>(async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Error('PRIVATE-CANARY')), { once: true });
  }));
  const journal = createSupabaseTelemetryJournal(url, key, transport);
  const controller = new AbortController(); const write = journal.accept(batch(), controller.signal);
  const checked = expect(write).rejects.toThrow('Telemetry storage unavailable');
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1)); controller.abort();
  await checked; await journal.drain();
});

it.each([{ accepted: true }, { accepted: false, stored: true }, 'PRIVATE-CANARY', null])(
  'requires a complete successful acknowledgment', async acknowledgment => {
    const transport = vi.fn<typeof fetch>(async () => response(acknowledgment));
    await expect(createSupabaseTelemetryJournal(url, key, transport).accept(batch(), signal()))
      .rejects.toThrow('Telemetry storage unavailable');
    expect(transport).toHaveBeenCalledTimes(1);
  },
);
it('does not retry an unavailable RPC or expose its response text', async () => {
  const transport = vi.fn<typeof fetch>(async () => response({ message: 'PRIVATE-CANARY' }, 503));
  await expect(createSupabaseTelemetryJournal(url, key, transport).accept(batch(), signal()))
    .rejects.toThrow('Telemetry storage unavailable');
  expect(transport).toHaveBeenCalledTimes(1);
});
it.each(['4097', 'not-a-length'])('rejects oversized or invalid declared responses: %s', length => {
  const transport = vi.fn<typeof fetch>(async () => new Response('{}', {
    headers: { 'content-length': length, 'content-type': 'application/json' },
  }));
  return expect(createSupabaseTelemetryJournal(url, key, transport).accept(batch(), signal()))
    .rejects.toThrow('Telemetry storage unavailable');
});
it('bounds undeclared response bytes and cancels a stalled response body', async () => {
  const large = vi.fn<typeof fetch>(async () => new Response(' '.repeat(4097)));
  await expect(createSupabaseTelemetryJournal(url, key, large).accept(batch(), signal()))
    .rejects.toThrow('Telemetry storage unavailable');
  const cancelled = vi.fn(); let pulled = false;
  const stalled = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({
    pull() { pulled = true; }, cancel: cancelled,
  })));
  const controller = new AbortController();
  const result = createSupabaseTelemetryJournal(url, key, stalled).accept(batch(), controller.signal);
  const checked = expect(result).rejects.toThrow('Telemetry storage unavailable');
  await vi.waitFor(() => expect(pulled).toBe(true)); controller.abort(); await checked;
  expect(cancelled).toHaveBeenCalled();
});

it('queries by release/request, projects returned records and keeps retries distinct', async () => {
  const value = batch();
  const transport = vi.fn<typeof fetch>(async () => response([{ ...value, private: 'PRIVATE-CANARY' },
    { ...value, sequence: 2 }]));
  const rows = await createSupabaseTelemetryJournal(url, key, transport).query({ releaseId: release, requestId });
  expect(rows).toEqual([value, { ...value, sequence: 2 }]);
  expect(JSON.stringify(rows)).not.toContain('PRIVATE-CANARY');
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ p_release_id: release, p_request_id: requestId });
});
it.each(['shape', 'count', 'release', 'request', 'duplicate', 'invalid'])(
  'rejects an inconsistent query response: %s', async scenario => {
    const value = batch();
    const records = scenario === 'shape' ? {} : scenario === 'count' ? Array(1001).fill(value)
      : scenario === 'release' ? [{ ...value, releaseId: 'b'.repeat(40) }]
        : scenario === 'request' ? [{ ...value, events: [] }]
          : scenario === 'duplicate' ? [value, value] : [{ ...value, sequence: -1 }];
    const transport = vi.fn<typeof fetch>(async () => response(records));
    await expect(createSupabaseTelemetryJournal(url, key, transport).query({ releaseId: release, requestId }))
      .rejects.toThrow('Telemetry storage unavailable');
  },
);
it('validates operator queries before network access', async () => {
  const transport = vi.fn<typeof fetch>(); const journal = createSupabaseTelemetryJournal(url, key, transport);
  await expect(journal.query({ releaseId: 'PRIVATE-CANARY' })).rejects.toThrow('Telemetry storage unavailable');
  await expect(journal.query({ releaseId: release, requestId: 'PRIVATE-CANARY' })).rejects.toThrow('Telemetry storage unavailable');
  expect(transport).not.toHaveBeenCalled();
});

it('claims notification admission through a bounded server-only RPC', async () => {
 const transport = vi.fn<typeof fetch>(async () => response(false));
 const journal = createSupabaseTelemetryJournal(url, key, transport);
 const alert = { schema: 'vizly-alert-v1' as const, releaseId: release, requestId, operation: 'permission', code: 'denied' };
 expect(await journal.claimAlert(alert, signal())).toBe(false);
 expect(String(transport.mock.calls[0][0])).toBe(`${url}/rest/v1/rpc/vizly_claim_telemetry_alert`);
 expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ p_release_id: release, p_request_id: requestId, p_operation: 'permission', p_code: 'denied' });
});
