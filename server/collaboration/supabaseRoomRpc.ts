import { createClient } from '@supabase/supabase-js';
import { MAX_CHECKPOINT_BYTES } from './roomCheckpoint.js';
const maxResponseBytes = 4 * Math.ceil(MAX_CHECKPOINT_BYTES / 3) + 1024;
const unavailable = () => new Error('Atomic room storage unavailable');
export class RoomStorageConflictError extends Error { constructor() { super('Room storage conflict'); } }
const names = new Set(['vizly_read_atomic_room', 'vizly_exchange_atomic_room', 'vizly_claim_room_lease',
  'vizly_renew_room_lease', 'vizly_release_room_lease', 'vizly_inspect_room_recovery', 'vizly_recover_atomic_room']);
const boundedResponse = async (response: Response): Promise<Response> => {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxResponseBytes)) {
    await response.body?.cancel().catch(() => undefined);
    throw unavailable();
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxResponseBytes) throw unavailable();
      chunks.push(next.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw unavailable();
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), {
    status: response.status, statusText: response.statusText,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
};


export const createSupabaseRoomRpc = (url: string, serverKey: string, transport: typeof fetch = fetch) => {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw unavailable(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.pathname !== '/' && parsed.pathname !== '')
    || typeof serverKey !== 'string' || !/^sb_secret_[A-Za-z0-9_-]{8,512}$/.test(serverKey)) throw unavailable();
  const client = createClient(parsed.origin, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const deadline = AbortSignal.timeout(8000);
      return boundedResponse(await transport(input, {
        ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
      }));
    } },
  });
  return async (name: string, parameters: Record<string, unknown>): Promise<unknown> => {
    if (!names.has(name)) throw unavailable();
    try {
      const { data, error } = await client.rpc(name, parameters).retry(false);
      if (error?.code === '55000') throw new RoomStorageConflictError();
      if (error) throw unavailable();
      return data as unknown;
    } catch (error: unknown) {
      if (error instanceof RoomStorageConflictError) throw error;
      throw unavailable();
    }
  };
};
