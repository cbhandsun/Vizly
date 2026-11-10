import * as Y from 'yjs';
import { compareCloudCheckpointRevisions, encodeRoomCheckpoint, type RoomCheckpoint, type RoomRecord } from './roomCheckpoint.js';
import { areRoomCanvasesEqual, CloudRoomConflictError, reconcileCloudRoom } from './cloudRoomReconciliation.js';
import { publishCollaborationElement, readCollaborationElement, upgradeCollaborationDocument } from './documentModel.js';
import { isRecord, validateDocument } from './boundary.js';
import { restorePersistedEdgeHandlePolicy } from './persistedEdgeHandlePolicy.js';
import { restorePersistedCanvasGeometry } from './persistedCanvasGeometry.js';

/** Compute against a single accepted snapshot; callers own atomic persistence. */
export const reconcileRoomCheckpoint = (stored: RoomRecord | null, cloud: RoomCheckpoint, liveState?: Uint8Array): RoomCheckpoint => {
  encodeRoomCheckpoint(cloud);
  if (!Buffer.from(cloud.base).equals(Buffer.from(cloud.state))) throw new Error('Invalid cloud checkpoint');
  const liveDoc = new Y.Doc();
  const cloudDoc = new Y.Doc();
  const geometryCloudDoc = new Y.Doc();
  const mergeCloudDoc = new Y.Doc();
  const baseDoc = new Y.Doc();
  try {
    Y.applyUpdate(cloudDoc, cloud.base);
    if (!validateDocument(cloudDoc)) throw new Error('Invalid cloud checkpoint');
    Y.applyUpdate(geometryCloudDoc, cloud.base);
    const nodes = geometryCloudDoc.getMap('flowchart-nodes');
    for (const [id, zIndex] of cloud.canvasNodeZIndexes ?? []) {
      const element = readCollaborationElement(nodes.get(id));
      if (element) publishCollaborationElement(nodes, id, restorePersistedCanvasGeometry(element, {
        metadata: { canvasPosition: element.position, style: { zIndex } },
      }));
    }
    Y.applyUpdate(mergeCloudDoc, Y.encodeStateAsUpdate(geometryCloudDoc));
    const edges = mergeCloudDoc.getMap('flowchart-edges');
    for (const [id, roles] of cloud.automaticHandleRoles ?? []) {
      const element = readCollaborationElement(edges.get(id));
      if (element) publishCollaborationElement(edges, id,
        restorePersistedEdgeHandlePolicy(element, { metadata: { autoHandles: roles } }));
    }
    let accepted = Y.encodeStateAsUpdate(mergeCloudDoc);
    if (stored) {
      Y.applyUpdate(liveDoc, liveState ?? stored.state);
      if (!upgradeCollaborationDocument(liveDoc) || !validateDocument(liveDoc)) throw new Error('Invalid persisted room');
      if (stored.checkpoint) {
        const comparison = compareCloudCheckpointRevisions(cloud.revision, stored.checkpoint.revision);
        if (comparison < 0) throw new CloudRoomConflictError();
        Y.applyUpdate(baseDoc, stored.checkpoint.base);
        // Also accept exact geometry/port projections written by earlier fixes.
        // No other field or authored handle difference is exempted.
        if (comparison === 0 && !areRoomCanvasesEqual(baseDoc, cloudDoc)
          && !areRoomCanvasesEqual(baseDoc, geometryCloudDoc)
          && !areRoomCanvasesEqual(baseDoc, mergeCloudDoc)) throw new CloudRoomConflictError();
        // Historical converters derived top-level zIndex from defaults. Their
        // saved style still carries the prior rendered order; compare that
        // semantic base so an unchanged live layer cannot conflict with a later
        // authored cloud layer edit. The stored baseline remains byte-for-byte raw.
        const baseNodes = baseDoc.getMap('flowchart-nodes');
        for (const [id, value] of baseNodes) {
          const element = readCollaborationElement(value);
          if (element && isRecord(element.style)) publishCollaborationElement(baseNodes, id,
            restorePersistedCanvasGeometry(element, {
              metadata: { canvasPosition: element.position, style: { zIndex: element.style.zIndex } },
            }));
        }
        accepted = reconcileCloudRoom(baseDoc, liveDoc, mergeCloudDoc);
      } else {
        // No reliable historical base exists. A different graph could be an
        // unsaved collaborative edit or a newer cloud edit: never guess.
        if (![cloudDoc, geometryCloudDoc, mergeCloudDoc].some(doc => areRoomCanvasesEqual(liveDoc, doc))) throw new CloudRoomConflictError();
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
  } finally { liveDoc.destroy(); cloudDoc.destroy(); geometryCloudDoc.destroy(); mergeCloudDoc.destroy(); baseDoc.destroy(); }
};
