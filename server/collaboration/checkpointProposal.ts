import * as Y from 'yjs';
import { reconcileCloudRoom } from './cloudRoomReconciliation.js';
import { acceptPersistedRoomState } from './acceptedRoomState.js';
import { reconcileRoomCheckpoint } from './roomCheckpointCoordination.js';
import { encodeRoomCheckpoint, type RoomCheckpoint, type RoomRecord } from './roomCheckpoint.js';

/** Recompute cloud coordination, then merge proposal edits against its own base. */
export const mergeCheckpointProposal = (current: RoomRecord | null, proposed: RoomCheckpoint): RoomCheckpoint => {
  encodeRoomCheckpoint(proposed);
  if (!current) return { revision: proposed.revision, base: Uint8Array.from(proposed.base), state: Uint8Array.from(proposed.state) };
  const coordinated = reconcileRoomCheckpoint(current, { ...proposed, state: proposed.base });
  const base = new Y.Doc(); const local = new Y.Doc(); const remote = new Y.Doc(); const merged = new Y.Doc(); const desired = new Y.Doc();
  try {
    Y.applyUpdate(base, proposed.base); Y.applyUpdate(local, proposed.state); Y.applyUpdate(remote, coordinated.state);
    Y.applyUpdate(desired, reconcileCloudRoom(base, local, remote));
    // Preserve both histories before projecting the conflict-checked graph.
    Y.applyUpdate(merged, proposed.state); Y.applyUpdate(merged, coordinated.state);
    const state = reconcileCloudRoom(merged, merged, desired);
    acceptPersistedRoomState(coordinated.state, state);
    acceptPersistedRoomState(proposed.state, state);
    return { revision: proposed.revision, base: Uint8Array.from(proposed.base), state };
  } finally { base.destroy(); local.destroy(); remote.destroy(); merged.destroy(); desired.destroy(); }
};
