import { createDistributedRoomRegistry } from './distributedRoomRegistry.js';
import { createSupabaseRoomLeaseStore } from './supabaseRoomLeaseStore.js';
import { createSupabaseAtomicRoomStore } from './supabaseAtomicRoomStore.js';
import { createSupabaseRoomNoticeBus } from './supabaseRoomNoticeBus.js';
import { createDistributedRoomSync, type RoomNoticeBus } from './distributedRoomSync.js';
import { randomUUID } from 'node:crypto';

/** Compose backend-only stores and private document notifications; startup is separate. */
export const createSupabaseRoomRuntime = (url: string, serverKey: string, transport: typeof fetch = fetch,
  suppliedNotices?: RoomNoticeBus & { stop: () => Promise<void> }) => {
  const control = createSupabaseRoomLeaseStore(url, serverKey, transport);
  const registry = createDistributedRoomRegistry(control, lease => createSupabaseAtomicRoomStore(url, serverKey, lease.leaseId, transport));
  const notices = suppliedNotices ?? createSupabaseRoomNoticeBus(url, serverKey);
  const openRoomSynchronization = createDistributedRoomSync({ source: randomUUID(), bus: notices, read: registry.readAdmittedSnapshot });
  let stopPromise: Promise<void> | undefined;
  const disposing: Promise<void>[] = [];
  return { ...registry, openRoomSynchronization,
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = Promise.resolve().then(async () => {
        const results = await Promise.allSettled(disposing);
        if (results.some(result => result.status === 'rejected')) throw new Error('Supabase room runtime disposal failed');
      });
      for (const operation of [() => registry.stop(), () => notices.stop()]) {
        try { disposing.push(operation()); }
        catch { disposing.push(Promise.reject(new Error('Supabase room runtime disposal failed'))); }
      }
      return stopPromise;
    },
  };
};
