import * as Y from 'yjs';
import { isRecord, validateDocument } from './boundary.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';

export class CloudRoomConflictError extends Error {
  constructor() {
    super('Cloud and collaborative edits require conflict resolution');
    this.name = 'CloudRoomConflictError';
  }
}

const equal = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equal(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
};

/** Compare visible graphs without confusing independently encoded CRDT clocks. */
export const areRoomCanvasesEqual = (left: Y.Doc, right: Y.Doc): boolean => {
  if (![left, right].every(validateDocument)) throw new Error('Invalid reconciliation document');
  return ['flowchart-nodes', 'flowchart-edges'].every(name => {
    const first = left.getMap<unknown>(name);
    const second = right.getMap<unknown>(name);
    return first.size === second.size && [...first].every(([id, value]) => second.has(id)
      && equal(readCollaborationElement(value), readCollaborationElement(second.get(id))));
  });
};

/** Arrays are atomic; complementary additions and independent object edits can merge. */
const merge = (base: unknown, live: unknown, cloud: unknown): unknown => {
  if (equal(base, cloud)) return live;
  if (equal(base, live) || equal(live, cloud)) return cloud;
  // A saved newly created element has no checkpoint base. Cloud conversion can
  // add persisted geometry/default metadata while the live element retains
  // fields omitted by that format. Merge only nonconflicting fields; different
  // labels, positions, types or arrays still fail at their individual boundary.
  const baseline = base === undefined ? {} : base;
  if (!isRecord(baseline) || !isRecord(live) || !isRecord(cloud)) throw new CloudRoomConflictError();
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(live), ...Object.keys(cloud)])) {
    const value = merge(baseline[key], live[key], cloud[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
};

/**
 * Produce a validated candidate without mutating any accepted document. The
 * caller must persist it before broadcasting; failed merge/validation writes
 * nothing. Cloud CRDT client IDs are never imported into the live document.
 */
export const reconcileCloudRoom = (base: Y.Doc, live: Y.Doc, cloud: Y.Doc): Uint8Array => {
  if (![base, live, cloud].every(validateDocument)) throw new Error('Invalid reconciliation document');
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(live));
    candidate.transact(() => {
      for (const name of ['flowchart-nodes', 'flowchart-edges'] as const) {
        const baseMap = base.getMap<unknown>(name);
        const liveMap = live.getMap<unknown>(name);
        const cloudMap = cloud.getMap<unknown>(name);
        const target = candidate.getMap<unknown>(name);
        const ids = new Set([...baseMap.keys(), ...liveMap.keys(), ...cloudMap.keys()]);
        for (const id of ids) {
          const previous = readCollaborationElement(liveMap.get(id)) ?? undefined;
          const merged = merge(readCollaborationElement(baseMap.get(id)) ?? undefined,
            previous, readCollaborationElement(cloudMap.get(id)) ?? undefined);
          if (equal(previous, merged)) continue;
          if (merged === undefined) target.delete(id);
          else if (!publishCollaborationElement(target, id, merged, previous)) throw new Error('Invalid reconciliation element');
        }
      }
    });
    // For example, a cloud deletion can conflict with a newly added live edge.
    // Reject the complete candidate instead of discarding an edge or a node.
    if (!validateDocument(candidate)) throw new CloudRoomConflictError();
    return Y.encodeStateAsUpdate(candidate);
  } finally { candidate.destroy(); }
};
