import * as encoding from 'lib0/encoding';
import { applyAwarenessUpdate, type Awareness } from 'y-protocols/awareness';
import type { PresenceDelta, RemotePresencePeer } from './distributedPresence.js';
import { sanitizePresence } from './presence.js';

/** Server-owned IDs above uint32 cannot collide with admitted browser client IDs. */
export const createRemoteRoomAwareness = (awareness: Awareness) => {
  const mapped = new Map<string, { id: number; peer: RemotePresencePeer }>();
  const key = (peer: RemotePresencePeer) => `${peer.source}:${peer.clientId}`;
  const allocate = (reserved: ReadonlySet<number>) => {
    const occupied = new Set([...mapped.values()].map(entry => entry.id));
    let id = 0x100000000;
    while (reserved.has(id) || occupied.has(id) || id === awareness.clientID) id++;
    if (!Number.isSafeInteger(id) || mapped.size >= 256) throw new Error('Remote awareness capacity exceeded');
    return id;
  };
  const write = (entries: Array<{ id: number; peer: RemotePresencePeer | null }>): Uint8Array | null => {
    if (entries.length === 0) return null;
    const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, entries.length);
    const clocks = new Map<number, number>();
    for (const entry of entries) {
      const clock = (clocks.get(entry.id) ?? awareness.meta.get(entry.id)?.clock ?? 0) + 1;
      if (!Number.isSafeInteger(clock) || clock > 0xffffffff) throw new Error('Remote awareness clock exhausted');
      clocks.set(entry.id, clock);
      encoding.writeVarUint(encoder, entry.id); encoding.writeVarUint(encoder, clock);
      encoding.writeVarString(encoder, JSON.stringify(entry.peer === null ? null : sanitizePresence(entry.peer.state, entry.peer.userId)));
    }
    const update = encoding.toUint8Array(encoder); applyAwarenessUpdate(awareness, update, 'remote-presence'); return update;
  };
  return {
    apply(delta: PresenceDelta, reserved: ReadonlySet<number>) {
      const entries: Array<{ id: number; peer: RemotePresencePeer | null }> = [];
      for (const peer of delta.removed) {
        const entry = mapped.get(key(peer)); if (entry) { mapped.delete(key(peer)); entries.push({ id: entry.id, peer: null }); }
      }
      for (const peer of delta.updated) {
        const previous = mapped.get(key(peer));
        const entry = { id: previous?.id ?? allocate(reserved), peer }; mapped.set(key(peer), entry);
        entries.push(entry);
      }
      return write(entries);
    },
  };
};
