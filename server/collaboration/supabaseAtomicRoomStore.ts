import { createSupabaseRoomRpc } from './supabaseRoomRpc.js';
import { isRoomGeneration, isRoomVersion, parseAtomicRoomSnapshot, type AtomicRoomStore } from './atomicRoomCommit.js';
import { decodeRoomRecord, MAX_CHECKPOINT_BYTES } from './roomCheckpoint.js';

const maxBase64 = 4 * Math.ceil(MAX_CHECKPOINT_BYTES / 3);
const unavailable = () => new Error('Atomic room storage unavailable');
const canonicalBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const identity = (id: unknown): id is string => isRoomGeneration(id);

/** Backend-only credentials. Admission authorization remains user-scoped. */
export const createSupabaseAtomicRoomStore = (url: string, serverKey: string, leaseId: string, transport: typeof fetch = fetch): AtomicRoomStore => {
  if (!isRoomGeneration(leaseId)) throw unavailable();
  const rpc = createSupabaseRoomRpc(url, serverKey, transport);
  return {
    async read(id) {
      if (!identity(id)) throw unavailable();
      try {
        const data = await rpc('vizly_read_atomic_room', { p_diagram_id: id.toLowerCase() });
        if (data === null) return null;
        const row: unknown = data;
        if (!row || typeof row !== 'object' || !('record' in row) || typeof row.record !== 'string'
          || !row.record || row.record.length > maxBase64 || !canonicalBase64.test(row.record)) throw unavailable();
        const record = Buffer.from(row.record, 'base64');
        if (record.toString('base64') !== row.record) throw unavailable();
        return parseAtomicRoomSnapshot({ ...row, record });
      } catch { throw unavailable(); }
    },
    async compareExchange(id, generation, version, record) {
      if (!identity(id) || !isRoomGeneration(generation) || (version !== null && !isRoomVersion(version))) throw unavailable();
      try {
        decodeRoomRecord(record);
        const data = await rpc('vizly_exchange_atomic_room', {
          p_diagram_id: id.toLowerCase(), p_generation: generation.toLowerCase(), p_version: version,
          p_record: Buffer.from(record).toString('base64'), p_lease_id: leaseId.toLowerCase(),
        });
        if (typeof data !== 'boolean') throw unavailable();
        return data;
      } catch { throw unavailable(); }
    },
  };
};
