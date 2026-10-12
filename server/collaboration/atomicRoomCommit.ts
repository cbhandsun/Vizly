import * as Y from 'yjs';
import { randomUUID } from 'node:crypto';
import { acceptPersistedRoomState } from './acceptedRoomState.js';
import { decodeRoomRecord, encodeRoomCheckpoint, type RoomRecord } from './roomCheckpoint.js';

export interface AtomicRoomSnapshot { generation: string; version: string; record: Uint8Array }
export interface AtomicRoomStore {
  read: (id: string) => Promise<AtomicRoomSnapshot | null>;
  compareExchange: (id: string, generation: string, version: string | null, record: Uint8Array) => Promise<boolean>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isRoomGeneration = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
export const isRoomVersion = (value: unknown): value is string => typeof value === 'string'
  && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) < 9223372036854775807n;
export const parseAtomicRoomSnapshot = (input: unknown): AtomicRoomSnapshot => {
  if (!input || typeof input !== 'object' || !('generation' in input) || !isRoomGeneration(input.generation)
    || !('version' in input) || !isRoomVersion(input.version) || !('record' in input) || !(input.record instanceof Uint8Array)) {
    throw new Error('Invalid atomic room snapshot');
  }
  decodeRoomRecord(input.record);
  return { generation: input.generation.toLowerCase(), version: input.version, record: Uint8Array.from(input.record) };
};
const merge = (submitted: Uint8Array, stored: RoomRecord | null): Uint8Array => {
  const doc = new Y.Doc();
  try {
    if (stored) Y.applyUpdate(doc, stored.state);
    Y.applyUpdate(doc, submitted);
    return acceptPersistedRoomState(submitted, Y.encodeStateAsUpdate(doc));
  } finally { doc.destroy(); }
};

/** The generation belongs to the admitted room, never to a new save attempt. */
export const createAtomicRoomCommitter = (store: AtomicRoomStore) => ({
  newGeneration: () => randomUUID(),
  async commit(id: string, generation: string, input: Uint8Array): Promise<Uint8Array> {
    if (typeof id !== 'string' || !uuid.test(id) || !isRoomGeneration(generation)) throw new Error('Invalid atomic room identity');
    const submitted = acceptPersistedRoomState(input, undefined);
    const key = id.toLowerCase();
    const expectedGeneration = generation.toLowerCase();
    for (let attempt = 0; attempt < 8; attempt++) {
      const raw = await store.read(key);
      const snapshot = raw === null ? null : parseAtomicRoomSnapshot(raw);
      if (snapshot && snapshot.generation !== expectedGeneration) throw new Error('Room generation changed');
      const stored = snapshot ? decodeRoomRecord(snapshot.record) : null;
      const state = merge(submitted, stored);
      const record = stored?.checkpoint
        ? encodeRoomCheckpoint({ ...stored.checkpoint, state }) : state;
      const exchanged: unknown = await store.compareExchange(key, expectedGeneration, snapshot?.version ?? null, Uint8Array.from(record));
      if (exchanged === true) return state;
      if (exchanged !== false) throw new Error('Invalid atomic room commit receipt');
    }
    throw new Error('Room commit contention budget exhausted');
  },
});
