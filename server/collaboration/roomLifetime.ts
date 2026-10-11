interface Entry<T> { value: Promise<T>; leases: number; retiring?: Promise<void> }
export interface RoomLease<T> { value: T; release: () => Promise<void> }

/** Keep a room alive through both upgrade preparation and connected peers. */
export const createRoomLifetime = <T>(capacity: number, dispose: (value: T) => Promise<void>) => {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid room capacity');
  const entries = new Map<string, Entry<T>>();
  let stopped = false;
  const retire = (id: string, entry: Entry<T>) => {
    entry.retiring ??= (async () => {
      try { await dispose(await entry.value); }
      finally { if (entries.get(id) === entry) entries.delete(id); }
    })();
    return entry.retiring;
  };
  const acquire = async (id: string, load: () => Promise<T>): Promise<RoomLease<T>> => {
    if (stopped) throw new Error('Room service stopped');
    let entry = entries.get(id);
    if (entry?.retiring) {
      await entry.retiring;
      return acquire(id, load);
    }
    if (!entry) {
      if (entries.size >= capacity) throw new Error('Room capacity reached');
      entry = { value: Promise.resolve().then(load), leases: 0 };
      entries.set(id, entry);
    }
    const reserved = entry;
    reserved.leases++;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      if (--reserved.leases === 0) await retire(id, reserved);
    };
    try {
      const value = await reserved.value;
      if (stopped) throw new Error('Room service stopped');
      return { value, release };
    } catch (error: unknown) {
      // A failed loader owns no resource to dispose. Every reservation still
      // releases exactly once, including concurrent unsuccessful upgrades.
      released = true;
      if (--reserved.leases === 0 && entries.get(id) === reserved) entries.delete(id);
      throw error;
    }
  };
  let stopPromise: Promise<void> | undefined;
  return {
    acquire,
    stop() {
      stopped = true;
      stopPromise ??= Promise.allSettled([...entries].map(([id, entry]) => retire(id, entry))).then(results => {
        if (results.some(result => result.status === 'rejected')) throw new Error('Room disposal failed');
      });
      return stopPromise;
    },
  };
};
