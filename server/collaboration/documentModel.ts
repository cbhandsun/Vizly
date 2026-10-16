import * as Y from 'yjs';
import { readCollaborationJsonElement, type JsonValue, type JsonRecord } from './jsonElement.js';

export const COLLABORATION_FIELD_FORMAT = 'fields-v1';
export const formatCollaborationAccess = (role: 'editor' | 'viewer'): string => `${role}:${COLLABORATION_FIELD_FORMAT}`;
const isJsonRecord = (value: JsonValue | undefined): value is JsonRecord => (
  value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const readCollaborationElement = (input: unknown): JsonRecord | null => readCollaborationJsonElement(input,
  value => value instanceof Y.Map ? [...value.entries()] : null,
);

const createMap = (record: JsonRecord): Y.Map<unknown> => {
  const result = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(record)) result.set(key, isJsonRecord(value) ? createMap(value) : value);
  return result;
};
const sameValue = (left: JsonValue | undefined, right: JsonValue | undefined): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  if (!isJsonRecord(left) || !isJsonRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
};
const patchMap = (map: Y.Map<unknown>, next: JsonRecord, previous: JsonRecord, current: JsonRecord) => {
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (sameValue(next[key], previous[key]) || sameValue(next[key], current[key])) continue;
    if (!Object.hasOwn(next, key)) { map.delete(key); continue; }
    const value = next[key];
    const before = previous[key];
    const existing = map.get(key);
    if (isJsonRecord(value) && isJsonRecord(before) && existing instanceof Y.Map) {
      patchMap(existing, value, before, isJsonRecord(current[key]) ? current[key] : {});
    } else if (isJsonRecord(value) && isJsonRecord(before) && existing === undefined) {
      // A peer removed this optional subtree. A stale edit cannot resurrect it.
      continue;
    } else { map.set(key, isJsonRecord(value) ? createMap(value) : value); }
  }
};

/** Publish only locally changed fields; peer changes in other fields survive. */
export const publishCollaborationElement = (
  elements: Y.Map<unknown>, id: string, input: unknown, previousInput?: unknown,
): boolean => {
  const next = readCollaborationElement(input);
  const previous = previousInput === undefined ? null : readCollaborationElement(previousInput);
  if (!next || next.id !== id || (previousInput !== undefined && (!previous || previous.id !== id))) return false;
  const existing = elements.get(id);
  if (existing === undefined && previous) return false; // Remote deletion wins over a stale local canvas.
  if (existing instanceof Y.Map) {
    const current = readCollaborationElement(existing);
    const baseline = previous ?? current;
    if (!baseline || !current || current.id !== id) return false;
    patchMap(existing, next, baseline, current);
  } else {
    const baseline = existing === undefined ? next : readCollaborationElement(existing);
    if (!baseline || baseline.id !== id) return false;
    const shared = createMap(baseline);
    elements.set(id, shared);
    if (previous) patchMap(shared, next, previous, baseline);
    else patchMap(shared, next, baseline, baseline);
  }
  return true;
};

/** Upgrade validated legacy persisted objects before clients receive a room. */
export const upgradeCollaborationDocument = (doc: Y.Doc): boolean => {
  const pending: Array<{ map: Y.Map<unknown>; id: string; value: JsonRecord }> = [];
  for (const name of ['flowchart-nodes', 'flowchart-edges']) {
    const map = doc.getMap<unknown>(name);
    for (const [id, value] of map) {
      const parsed = readCollaborationElement(value);
      if (!parsed || parsed.id !== id) return false;
      if (!(value instanceof Y.Map)) pending.push({ map, id, value: parsed });
    }
  }
  doc.transact(() => { for (const entry of pending) entry.map.set(entry.id, createMap(entry.value)); });
  return true;
};

/** Runtime writers must use shared fields; plain objects are read-only legacy input. */
export const hasSharedCollaborationElements = (doc: Y.Doc): boolean => (
  ['flowchart-nodes', 'flowchart-edges'].every(name =>
    [...doc.getMap<unknown>(name).values()].every(value => value instanceof Y.Map))
);
