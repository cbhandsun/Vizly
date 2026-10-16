import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_DOCUMENT_BYTES } from './boundary.js';
import { decodeRoomRecord, encodeRoomCheckpoint, MAX_CHECKPOINT_BYTES, type RoomCheckpoint, type RoomRecord } from './roomCheckpoint.js';
import { createRoomRecoveryStore, type RecoveryInspection, type RecoveryReceipt } from './roomRecoveryStore.js';

export interface RoomPersistence {
  load: (id: string) => Promise<Uint8Array | null>;
  /** Shared stores return the committed state, including concurrent edits. */
  save: (id: string, state: Uint8Array) => Promise<void | Uint8Array>;
}
export interface CheckpointPersistence extends RoomPersistence {
  loadRecord: (id: string) => Promise<RoomRecord | null>;
  saveCheckpoint: (id: string, checkpoint: RoomCheckpoint) => Promise<void | Uint8Array>;
  coordinateCheckpoint?: (id: string, cloud: RoomCheckpoint, liveState?: Uint8Array) => Promise<Uint8Array>;
}
export interface RecoverableCheckpointPersistence extends CheckpointPersistence {
  inspectRecovery: (id: string) => Promise<RecoveryInspection | null>;
  recoverCheckpoint: (id: string, expectedSha256: unknown, checkpoint: RoomCheckpoint) => Promise<RecoveryReceipt>;
}
export const createFilePersistence = (directory: string): RecoverableCheckpointPersistence => {
  const root = resolve(directory);
  const path = (id: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid room storage identity');
    return resolve(root, `${id.toLowerCase()}.yjs`);
  };
  const loadRecord = async (id: string): Promise<RoomRecord | null> => {
      const file = path(id);
      try {
        if ((await stat(file)).size > MAX_CHECKPOINT_BYTES) throw new Error('Room state exceeds budget');
        const state = await readFile(file);
        return decodeRoomRecord(state);
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
        throw new Error('Room state unavailable', { cause: error });
      }
    };
  const write = async (id: string, state: Uint8Array) => {
      const destination = path(id);
      await mkdir(root, { recursive: true, mode: 0o700 });
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, state, { flag: 'wx', mode: 0o600, flush: true });
        await rename(temporary, destination);
      } catch {
        await unlink(temporary).catch((error: unknown) => {
          if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw new Error('Room temporary state cleanup failed');
        });
        throw new Error('Room persistence failed');
      }
    };
  const writes = new Map<string, Promise<void>>();
  const serialize = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    path(id);
    const key = id.toLowerCase();
    const previous = writes.get(key) ?? Promise.resolve();
    let release: () => void = () => { throw new Error('Room write reservation unavailable'); };
    const finished = new Promise<void>(resolve => { release = resolve; });
    writes.set(key, finished);
    await previous;
    try { return await operation(); }
    finally { release(); if (writes.get(key) === finished) writes.delete(key); }
  };
  const recovery = createRoomRecoveryStore(root, path, write);
  return {
    loadRecord,
    inspectRecovery: recovery.inspect,
    async recoverCheckpoint(id, expectedSha256, checkpoint) {
      const encoded = encodeRoomCheckpoint(checkpoint);
      const snapshot = decodeRoomRecord(encoded);
      if (!snapshot.checkpoint) throw new Error('Invalid recovery checkpoint');
      const confirmed = { ...snapshot.checkpoint, state: snapshot.state };
      return serialize(id, () => recovery.recover(id, expectedSha256, confirmed));
    },
    async load(id) { return (await loadRecord(id))?.state ?? null; },
    async save(id, state) {
      if (state.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Room state exceeds budget');
      const snapshot = Uint8Array.from(state);
      await serialize(id, async () => {
      // Save operations are serialized by the room queue. Preserve a recorded
      // cloud baseline through subsequent collaborative updates.
      const previous = await loadRecord(id);
      const bytes = previous?.checkpoint
        ? encodeRoomCheckpoint({ ...previous.checkpoint, state: snapshot }) : snapshot;
      decodeRoomRecord(bytes);
      await write(id, bytes);
      });
    },
    async saveCheckpoint(id, checkpoint) {
      const snapshot = encodeRoomCheckpoint(checkpoint);
      await serialize(id, () => write(id, snapshot));
    },
  };
};
