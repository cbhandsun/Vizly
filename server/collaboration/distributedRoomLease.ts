import { randomUUID } from 'node:crypto';
import { isRoomGeneration } from './atomicRoomCommit.js';

export type RoomLeaseKind = 'edit' | 'recovery';
export interface DistributedLeaseReceipt { generation: string; expiresAt: string }
export interface DistributedRoomLeaseStore {
  claim: (id: string, leaseId: string, proposedGeneration: string, kind: RoomLeaseKind) => Promise<DistributedLeaseReceipt | null>;
  renew: (id: string, leaseId: string, generation: string) => Promise<boolean>;
  release: (id: string, leaseId: string, generation: string) => Promise<boolean>;
}
export interface DistributedRoomLease {
  readonly leaseId: string; readonly generation: string; readonly signal: AbortSignal;
  assertActive: () => void;
  close: () => Promise<void>;
}
export class RoomLeaseUnavailableError extends Error { constructor() { super('Room lease unavailable'); } }

/** SQL grants 30s; use a conservative monotonic 20s lifetime from request start. */
export const acquireDistributedRoomLease = async (
  store: DistributedRoomLeaseStore, id: string, kind: RoomLeaseKind,
  now: () => number = () => performance.now(),
): Promise<DistributedRoomLease> => {
  if (!isRoomGeneration(id) || !['edit', 'recovery'].includes(kind)) throw new Error('Invalid room lease identity');
  const leaseId = randomUUID();
  const key = id.toLowerCase();
  const started = now();
  const receipt = await store.claim(key, leaseId, randomUUID(), kind);
  if (!receipt) throw new RoomLeaseUnavailableError();
  if (!isRoomGeneration(receipt.generation) || typeof receipt.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(receipt.expiresAt))) throw new Error('Invalid room lease receipt');
  const generation = receipt.generation.toLowerCase();
  const controller = new AbortController();
  let deadline = Math.min(started + 20_000, now() + Math.max(0, Date.parse(receipt.expiresAt) - Date.now() - 5000));
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let expiration: ReturnType<typeof setTimeout> | undefined;
  let closePromise: Promise<void> | undefined;
  const invalidate = () => {
    if (heartbeat) clearTimeout(heartbeat);
    if (expiration) clearTimeout(expiration);
    if (!controller.signal.aborted) controller.abort(new Error('Room lease inactive'));
  };
  const active = () => {
    if (now() >= deadline) invalidate();
    if (controller.signal.aborted) throw new Error('Room lease inactive');
  };
  const close = () => {
    invalidate();
    closePromise ??= (async () => {
      const released: unknown = await store.release(key, leaseId, generation);
      if (typeof released !== 'boolean') throw new Error('Invalid room lease release receipt');
    })();
    return closePromise;
  };
  const armExpiry = () => {
    if (expiration) clearTimeout(expiration);
    expiration = setTimeout(invalidate, Math.max(0, deadline - now()));
    expiration.unref?.();
  };
  const schedule = (delay: number) => {
    heartbeat = setTimeout(() => { void renew(); }, delay);
    heartbeat.unref?.();
  };
  const renew = async () => {
    const requestStarted = now();
    try {
      active();
      const renewed: unknown = await store.renew(key, leaseId, generation);
      active();
      if (renewed !== true) { invalidate(); return; }
      deadline = requestStarted + 20_000;
      armExpiry();
      schedule(Math.max(0, 8000 - (now() - requestStarted)));
    } catch { invalidate(); }
  };
  try { active(); }
  catch { await close(); throw new Error('Room lease admission expired'); }
  armExpiry(); schedule(Math.max(0, 8000 - (now() - started)));
  return Object.freeze({ leaseId, generation, signal: controller.signal, assertActive: active, close });
};
