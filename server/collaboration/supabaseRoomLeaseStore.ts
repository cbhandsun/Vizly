import { randomUUID } from 'node:crypto';
import { isRoomGeneration } from './atomicRoomCommit.js';
import type { DistributedRoomLeaseStore } from './distributedRoomLease.js';
import { createSupabaseRoomRpc, RoomStorageConflictError } from './supabaseRoomRpc.js';
import { compareCloudCheckpointRevisions, encodeRoomCheckpoint, MAX_CHECKPOINT_BYTES, type RoomCheckpoint } from './roomCheckpoint.js';
import { RecoveryRecordChangedError, type RecoveryInspection, type RecoveryReceipt } from './roomRecoveryStore.js';

const unavailable = () => new Error('Room lease storage unavailable');
export const createSupabaseRoomLeaseStore = (url: string, serverKey: string, transport: typeof fetch = fetch) => {
  const rpc = createSupabaseRoomRpc(url, serverKey, transport);
  const parameters = (id: string, leaseId: string, generation: string) => {
    if (!isRoomGeneration(id) || !isRoomGeneration(leaseId) || !isRoomGeneration(generation)) throw unavailable();
    return { p_diagram_id: id.toLowerCase(), p_lease_id: leaseId.toLowerCase(), p_generation: generation.toLowerCase() };
  };
  const store: DistributedRoomLeaseStore = {
    async claim(id, leaseId, generation, kind) {
      if (!['edit', 'recovery'].includes(kind)) throw unavailable();
      const row = await rpc('vizly_claim_room_lease', { ...parameters(id, leaseId, generation), p_kind: kind });
      if (row === null) return null;
      if (!row || typeof row !== 'object' || !('generation' in row) || !isRoomGeneration(row.generation)
        || !('expiresAt' in row) || typeof row.expiresAt !== 'string') throw unavailable();
      try { compareCloudCheckpointRevisions(row.expiresAt, row.expiresAt); } catch { throw unavailable(); }
      return { generation: row.generation.toLowerCase(), expiresAt: row.expiresAt };
    },
    async renew(id, leaseId, generation) {
      const result = await rpc('vizly_renew_room_lease', parameters(id, leaseId, generation));
      if (typeof result !== 'boolean') throw unavailable();
      return result;
    },
    async release(id, leaseId, generation) {
      const result = await rpc('vizly_release_room_lease', parameters(id, leaseId, generation));
      if (typeof result !== 'boolean') throw unavailable();
      return result;
    },
  };
  return {
    ...store,
    async inspectRecovery(id: string): Promise<RecoveryInspection | null> {
      if (!isRoomGeneration(id)) throw unavailable();
      const row = await rpc('vizly_inspect_room_recovery', { p_diagram_id: id.toLowerCase() });
      if (row === null) return null;
      if (!row || typeof row !== 'object' || !('sha256' in row) || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)
        || !('bytes' in row) || typeof row.bytes !== 'number' || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > MAX_CHECKPOINT_BYTES) throw unavailable();
      return { sha256: row.sha256, bytes: row.bytes };
    },
    async recoverCheckpoint(id: string, leaseId: string, generation: string, expectedSha256: unknown, checkpoint: RoomCheckpoint): Promise<RecoveryReceipt> {
      const identity = parameters(id, leaseId, generation);
      if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw unavailable();
      const encoded = encodeRoomCheckpoint(checkpoint);
      const revision = checkpoint.revision;
      const nextGeneration = randomUUID();
      let row: unknown;
      try {
        row = await rpc('vizly_recover_atomic_room', { ...identity, p_new_generation: nextGeneration,
          p_sha256: expectedSha256, p_record: Buffer.from(encoded).toString('base64') });
      } catch (error: unknown) {
        if (error instanceof RoomStorageConflictError) throw new RecoveryRecordChangedError();
        throw error;
      }
      const backupId = `${id.toLowerCase()}.${expectedSha256}.yjs`;
      if (!row || typeof row !== 'object' || !('generation' in row) || row.generation !== nextGeneration
        || !('backupId' in row) || row.backupId !== backupId || !('previousSha256' in row) || row.previousSha256 !== expectedSha256) throw unavailable();
      return { backupId, previousSha256: expectedSha256, revision };
    },
  };
};
