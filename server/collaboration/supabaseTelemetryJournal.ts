import { createClient } from '@supabase/supabase-js';
import { projectTelemetryPayload } from './telemetryPayload.js';

const MAX_RECORD_BYTES = 32_768;
const MAX_QUERY_BYTES = 5_242_880;
const MAX_RECORDS = 1000;
const unavailable = () => new Error('Telemetry storage unavailable');
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

async function boundedResponse(response: Response, signal: AbortSignal, limit: number) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel().catch(() => undefined);
    throw unavailable();
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw unavailable();
      const next = await reader.read();
      if (signal.aborted) throw unavailable();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw unavailable();
      chunks.push(next.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw unavailable();
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks), {
    status: response.status, statusText: response.statusText,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}

/** Backend-only, bounded journal shared across replaceable service instances. */
export function createSupabaseTelemetryJournal(url: unknown, serverKey: unknown, transport: typeof fetch = fetch) {
  let parsed: URL;
  try {
    if (typeof url !== 'string') throw unavailable();
    parsed = new URL(url);
  } catch { throw unavailable(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || parsed.pathname !== '/' || typeof serverKey !== 'string'
    || !/^sb_secret_[A-Za-z0-9_-]{8,512}$/.test(serverKey)) throw unavailable();
  const client = createClient(parsed.origin, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (target.origin !== parsed.origin || !['/rest/v1/rpc/vizly_record_telemetry',
        '/rest/v1/rpc/vizly_query_telemetry'].includes(target.pathname)) throw unavailable();
      const timeout = AbortSignal.timeout(4500);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      const response = await transport(input, { ...init, signal, redirect: 'error' });
      return boundedResponse(response, signal, target.pathname.endsWith('/vizly_record_telemetry') ? 4096 : MAX_QUERY_BYTES);
    } },
  });
  const pending = new Set<Promise<unknown>>();
  const perform = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (pending.size >= 8) throw unavailable();
    const task = Promise.resolve().then(operation);
    pending.add(task);
    try { return await task; } catch { throw unavailable(); } finally { pending.delete(task); }
  };
  return {
    async accept(input: unknown, signal: AbortSignal) {
      // Re-project at the persistence boundary, including direct in-process calls.
      const batch = projectTelemetryPayload(input);
      if (Buffer.byteLength(JSON.stringify(batch)) > MAX_RECORD_BYTES || signal.aborted) throw unavailable();
      await perform(async () => {
        const { data, error } = await client.rpc('vizly_record_telemetry', { p_batch: batch })
          .abortSignal(signal).retry(false);
        const result: unknown = data;
        if (error || !result || typeof result !== 'object' || !('accepted' in result)
          || result.accepted !== true || !('stored' in result) || typeof result.stored !== 'boolean') throw unavailable();
      });
    },
    /** Operator-only lookup. This adapter does not expose an HTTP query endpoint. */
    async query(query: { releaseId: string; requestId?: string }, signal: AbortSignal = AbortSignal.timeout(4500)) {
      if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(query.releaseId)
        || (query.requestId !== undefined && !uuid(query.requestId)) || signal.aborted) throw unavailable();
      return perform(async () => {
        const { data, error } = await client.rpc('vizly_query_telemetry', {
          p_release_id: query.releaseId, p_request_id: query.requestId ?? null,
        }).abortSignal(signal).retry(false);
        const rows: unknown = data;
        if (error || !Array.isArray(rows) || rows.length > MAX_RECORDS) throw unavailable();
        const seen = new Set<string>();
        return rows.map(row => {
          const batch = projectTelemetryPayload(row);
          const identity = `${batch.streamId}:${batch.sequence}`;
          if (batch.releaseId !== query.releaseId || seen.has(identity)
            || (query.requestId && !batch.events.some(event => event.requestId === query.requestId))) throw unavailable();
          seen.add(identity);
          return batch;
        });
      });
    },
    async drain() { await Promise.allSettled([...pending]); },
  };
}
