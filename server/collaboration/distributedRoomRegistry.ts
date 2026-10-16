import { acquireDistributedRoomLease, RoomLeaseUnavailableError, type DistributedRoomLease, type DistributedRoomLeaseStore } from './distributedRoomLease.js';
import { createAtomicCheckpointPersistence } from './atomicCheckpointPersistence.js';
import { isRoomGeneration, parseAtomicRoomSnapshot, type AtomicRoomStore } from './atomicRoomCommit.js';
import type { CheckpointPersistence, RecoverableCheckpointPersistence } from './persistence.js';
import { decodeRoomRecord, encodeRoomCheckpoint, type RoomCheckpoint } from './roomCheckpoint.js';
import { RecoveryRecordChangedError, type RecoveryInspection, type RecoveryReceipt } from './roomRecoveryStore.js';

export interface DistributedRecoveryStore extends DistributedRoomLeaseStore {
  inspectRecovery: (id: string) => Promise<RecoveryInspection | null>;
  recoverCheckpoint: (id: string, leaseId: string, generation: string, expectedSha256: unknown, checkpoint: RoomCheckpoint) => Promise<RecoveryReceipt>;
}
class RegistryStoppedError extends Error { constructor() { super('Room registry stopped'); } }
interface Binding { lease: DistributedRoomLease; persistence: CheckpointPersistence; store: AtomicRoomStore }

/** Room lifetime owns admission; storage never creates a new lease during save. */
export const createDistributedRoomRegistry = (
  control: DistributedRecoveryStore, createStore: (lease: DistributedRoomLease) => AtomicRoomStore, capacity = 64,
) => {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 64) throw new Error('Invalid registry capacity');
  const bindings = new Map<string, Binding>();
  const pending = new Map<string, Promise<DistributedRoomLease>>();
  const recovering = new Map<string, Promise<RecoveryReceipt>>();
  let stopped = false; let stopPromise: Promise<void> | undefined;
  const key = (id: string) => {
    if (!isRoomGeneration(id)) throw new Error('Invalid registry room identity');
    if (stopped) throw new RegistryStoppedError();
    return id.toLowerCase();
  };
  const reserve = (id: string) => {
    const roomId = key(id);
    if (bindings.has(roomId) || pending.has(roomId) || recovering.has(roomId)) throw new RoomLeaseUnavailableError();
    if (bindings.size + pending.size + recovering.size >= capacity) throw new RoomLeaseUnavailableError();
    return roomId;
  };
  const acquireRoomLease = async (id: string): Promise<DistributedRoomLease> => {
    const roomId = reserve(id);
    const operation = (async () => {
      const acquired = await acquireDistributedRoomLease(control, roomId, 'edit');
      try {
        if (stopped) throw new RegistryStoppedError();
        const store = createStore(acquired);
        const persistence = createAtomicCheckpointPersistence(roomId, acquired, store);
        if (stopped) throw new RegistryStoppedError();
        acquired.assertActive();
        let closePromise: Promise<void> | undefined;
        const boundLease = Object.freeze({ ...acquired, close: () => {
          closePromise ??= (async () => {
            try { await acquired.close(); }
            finally { if (bindings.get(roomId)?.lease === boundLease) bindings.delete(roomId); }
          })();
          return closePromise;
        } });
        bindings.set(roomId, { lease: boundLease, persistence, store });
        return boundLease;
      } catch (error: unknown) { await acquired.close(); throw error; }
    })();
    pending.set(roomId, operation);
    try { return await operation; }
    finally { if (pending.get(roomId) === operation) pending.delete(roomId); }
  };
  const get = (id: string) => {
    const binding = bindings.get(key(id));
    if (!binding) throw new RoomLeaseUnavailableError();
    binding.lease.assertActive(); return binding.persistence;
  };
  const persistence: RecoverableCheckpointPersistence = {
    loadRecord: async id => get(id).loadRecord(id), load: async id => get(id).load(id),
    save: async (id, state) => get(id).save(id, state),
    saveCheckpoint: async (id, checkpoint) => get(id).saveCheckpoint(id, checkpoint),
    coordinateCheckpoint: async (id, checkpoint, live) => {
      const coordinate = get(id).coordinateCheckpoint;
      if (!coordinate) throw new Error('Atomic coordination unavailable');
      return coordinate(id, checkpoint, live);
    },
    inspectRecovery: async id => control.inspectRecovery(key(id)),
    async recoverCheckpoint(id, expectedSha256, checkpoint) {
      let roomId: string;
      try { roomId = reserve(id); }
      catch (error: unknown) { if (error instanceof RoomLeaseUnavailableError) throw new RecoveryRecordChangedError(); throw error; }
      if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Invalid recovery confirmation');
      const snapshot = decodeRoomRecord(encodeRoomCheckpoint(checkpoint));
      if (!snapshot.checkpoint) throw new Error('Missing recovery checkpoint metadata');
      const copied = { ...snapshot.checkpoint, state: snapshot.state };
      const operation = (async () => {
        let lease: DistributedRoomLease;
        try { lease = await acquireDistributedRoomLease(control, roomId, 'recovery'); }
        catch (error: unknown) { if (error instanceof RoomLeaseUnavailableError) throw new RecoveryRecordChangedError(); throw error; }
        try {
          if (stopped) throw new RegistryStoppedError();
          lease.assertActive();
          return await control.recoverCheckpoint(roomId, lease.leaseId, lease.generation, expectedSha256, copied);
        } finally { await lease.close(); }
      })();
      recovering.set(roomId, operation);
      try { return await operation; }
      finally { if (recovering.get(roomId) === operation) recovering.delete(roomId); }
    },
  };
  return {
    acquireRoomLease, persistence,
    async readAdmittedSnapshot(id: string) {
      const roomId = key(id); get(roomId);
      const binding = bindings.get(roomId);
      if (!binding) throw new RoomLeaseUnavailableError();
      const raw = await binding.store.read(roomId);
      binding.lease.assertActive();
      if (stopped || bindings.get(roomId) !== binding) throw new RoomLeaseUnavailableError();
      const snapshot = raw === null ? null : parseAtomicRoomSnapshot(raw);
      if (snapshot && snapshot.generation !== binding.lease.generation) throw new Error('Room generation changed');
      return snapshot;
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopped = true;
      const pendingWork = [...pending.values()].map(operation => operation.then(() => undefined))
        .concat([...recovering.values()].map(operation => operation.then(() => undefined)));
      // Publish the stop promise before abort listeners can re-enter shutdown.
      stopPromise = Promise.resolve().then(async () => {
          const closes = [...bindings.values()].map(binding => binding.lease.close());
          const results = await Promise.allSettled(closes.concat(pendingWork));
          if (results.some((result, index) => result.status === 'rejected' && (index < closes.length
            || !(result.reason instanceof RegistryStoppedError || result.reason instanceof RecoveryRecordChangedError
              || result.reason instanceof RoomLeaseUnavailableError)))) {
            throw new Error('Room registry disposal failed');
          }
        });
      return stopPromise;
    },
  };
};
