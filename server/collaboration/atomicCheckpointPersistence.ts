import { createAtomicRoomCommitter, isRoomGeneration, parseAtomicRoomSnapshot, type AtomicRoomStore } from './atomicRoomCommit.js';
import type { DistributedRoomLease } from './distributedRoomLease.js';
import type { CheckpointPersistence } from './persistence.js';
import { decodeRoomRecord, encodeRoomCheckpoint, type RoomCheckpoint, type RoomRecord } from './roomCheckpoint.js';
import { reconcileRoomCheckpoint } from './roomCheckpointCoordination.js';
import { mergeCheckpointProposal } from './checkpointProposal.js';
import { acceptPersistedRoomState } from './acceptedRoomState.js';
import { CloudRoomConflictError } from './cloudRoomReconciliation.js';

/** Bind persistence to one admitted room and its immutable generation. */
export const createAtomicCheckpointPersistence = (id: string, lease: DistributedRoomLease, store: AtomicRoomStore): CheckpointPersistence => {
  if (!isRoomGeneration(id) || !isRoomGeneration(lease.generation)) throw new Error('Invalid checkpoint room identity');
  const roomId = id.toLowerCase(); const generation = lease.generation.toLowerCase();
  const guard = (key: string) => {
    if (typeof key !== 'string' || key.toLowerCase() !== roomId) throw new Error('Checkpoint room identity mismatch');
    lease.assertActive();
  };
  const bound: AtomicRoomStore = {
    async read(key) {
      guard(key); const raw = await store.read(roomId); guard(key);
      if (raw === null) return null;
      const snapshot = parseAtomicRoomSnapshot(raw);
      if (snapshot.generation !== generation) throw new Error('Checkpoint room generation changed');
      return snapshot;
    },
    async compareExchange(key, nextGeneration, version, record) {
      guard(key);
      if (nextGeneration !== generation) throw new Error('Checkpoint room generation changed');
      const exchanged = await store.compareExchange(roomId, generation, version, record);
      guard(key); return exchanged;
    },
  };
  const committer = createAtomicRoomCommitter(bound);
  const write = async (key: string, compute: (current: RoomRecord | null) => RoomCheckpoint) => {
    guard(key);
    for (let attempt = 0; attempt < 8; attempt++) {
      const snapshot = await bound.read(key);
      const candidate = compute(snapshot ? decodeRoomRecord(snapshot.record) : null);
      const exchanged: unknown = await bound.compareExchange(key, generation, snapshot?.version ?? null, encodeRoomCheckpoint(candidate));
      if (exchanged === true) return Uint8Array.from(candidate.state);
      if (exchanged !== false) throw new Error('Invalid checkpoint commit receipt');
    }
    throw new Error('Checkpoint contention budget exhausted');
  };
  return {
    async loadRecord(key) { const snapshot = await bound.read(key); return snapshot ? decodeRoomRecord(snapshot.record) : null; },
    async load(key) { const snapshot = await bound.read(key); return snapshot ? decodeRoomRecord(snapshot.record).state : null; },
    async save(key, input) { guard(key); return committer.commit(roomId, generation, input); },
    async saveCheckpoint(key, proposed) {
      guard(key);
      const copied = decodeRoomRecord(encodeRoomCheckpoint(proposed));
      if (!copied.checkpoint) throw new Error('Missing checkpoint metadata');
      const checkpoint = { ...copied.checkpoint, state: copied.state };
      return write(key, current => mergeCheckpointProposal(current, checkpoint));
    },
    async coordinateCheckpoint(key, cloud, liveState) {
      guard(key);
      const copied = decodeRoomRecord(encodeRoomCheckpoint(cloud));
      if (!copied.checkpoint || !Buffer.from(copied.state).equals(Buffer.from(copied.checkpoint.base))) throw new Error('Invalid cloud checkpoint');
      const checkpoint = { ...copied.checkpoint, state: copied.state };
      const live = liveState === undefined ? undefined : acceptPersistedRoomState(liveState, undefined);
      return write(key, current => {
        if (live) {
          if (!current) throw new CloudRoomConflictError();
          // Server live state contains only previously committed edits. A
          // concurrent instance may add more, but must not omit this history.
          acceptPersistedRoomState(live, current.state);
        }
        return reconcileRoomCheckpoint(current, checkpoint);
      });
    },
  };
};
