import * as Y from 'yjs';
import { compareCloudCheckpointRevisions, encodeRoomCheckpoint, type RoomCheckpoint, type RoomRecord } from './roomCheckpoint.js';
import { areRoomCanvasesEqual, CloudRoomConflictError, reconcileCloudRoom } from './cloudRoomReconciliation.js';
import { upgradeCollaborationDocument } from './documentModel.js';
import { validateDocument } from './boundary.js';

/** Compute against a single accepted snapshot; callers own atomic persistence. */
export const reconcileRoomCheckpoint = (stored: RoomRecord | null, cloud: RoomCheckpoint, liveState?: Uint8Array): RoomCheckpoint => {
  encodeRoomCheckpoint(cloud);
  if (!Buffer.from(cloud.base).equals(Buffer.from(cloud.state))) throw new Error('Invalid cloud checkpoint');
  const liveDoc = new Y.Doc();
  const cloudDoc = new Y.Doc();
  const baseDoc = new Y.Doc();
  try {
    Y.applyUpdate(cloudDoc, cloud.base);
    if (!validateDocument(cloudDoc)) throw new Error('Invalid cloud checkpoint');
    let accepted = cloud.state;
    if (stored) {
      Y.applyUpdate(liveDoc, liveState ?? stored.state);
      if (!upgradeCollaborationDocument(liveDoc) || !validateDocument(liveDoc)) throw new Error('Invalid persisted room');
      if (stored.checkpoint) {
        const comparison = compareCloudCheckpointRevisions(cloud.revision, stored.checkpoint.revision);
        if (comparison < 0) throw new CloudRoomConflictError();
        Y.applyUpdate(baseDoc, stored.checkpoint.base);
        if (comparison === 0 && !areRoomCanvasesEqual(baseDoc, cloudDoc)) throw new CloudRoomConflictError();
        accepted = reconcileCloudRoom(baseDoc, liveDoc, cloudDoc);
      } else {
        // No reliable historical base exists. A different graph could be an
        // unsaved collaborative edit or a newer cloud edit: never guess.
        if (!areRoomCanvasesEqual(liveDoc, cloudDoc)) throw new CloudRoomConflictError();
        accepted = Y.encodeStateAsUpdate(liveDoc);
      }
    }
    const acceptedDoc = new Y.Doc();
    try {
      Y.applyUpdate(acceptedDoc, accepted);
      if (!validateDocument(acceptedDoc)) throw new Error('Invalid coordinated room');
      // An equal but never-initialized legacy empty graph still needs an
      // authoritative state vector so stale clients cannot seed local content.
      if (Y.decodeStateVector(Y.encodeStateVector(acceptedDoc)).size === 0) {
        const nodes = acceptedDoc.getMap('flowchart-nodes');
        nodes.set('__room_initialized__', true); nodes.delete('__room_initialized__');
        accepted = Y.encodeStateAsUpdate(acceptedDoc);
      }
    } finally { acceptedDoc.destroy(); }
    return { revision: cloud.revision, base: Uint8Array.from(cloud.base), state: Uint8Array.from(accepted) };
  } finally { liveDoc.destroy(); cloudDoc.destroy(); baseDoc.destroy(); }
};
