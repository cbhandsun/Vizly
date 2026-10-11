import * as Y from 'yjs';

type JsonValue = null | boolean | number | string | JsonValue[] | JsonRecord;
interface JsonRecord { [key: string]: JsonValue }
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();
const maxBytes = 2 * 1024 * 1024;
export const COLLABORATION_FIELD_FORMAT = 'fields-v1';
export const formatCollaborationAccess = (role: 'editor' | 'viewer'): string => `${role}:${COLLABORATION_FIELD_FORMAT}`;
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);
const isJsonRecord = (value: JsonValue | undefined): value is JsonRecord => (
  value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
);

/** Decode only bounded JSON and shared maps, never arbitrary Yjs types/prototypes. */
export const readCollaborationElement = (input: unknown): JsonRecord | null => {
  const budget = { bytes: 0 };
  const ancestors = new Set<object>();
  const read = (value: unknown, depth: number): JsonValue => {
    if (depth > 8) throw new Error('Invalid collaboration element');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Invalid collaboration element');
      return value;
    }
    if (typeof value === 'string') {
      budget.bytes += encoder.encode(value).byteLength;
      if (value.length > 20_000 || budget.bytes > maxBytes) throw new Error('Invalid collaboration element');
      return value;
    }
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('Invalid collaboration element');
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (value.length > 2000) throw new Error('Invalid collaboration element');
        budget.bytes += value.length * 8;
        if (budget.bytes > maxBytes) throw new Error('Invalid collaboration element');
        return value.map(item => read(item, depth + 1));
      }
      if (!(value instanceof Y.Map) && !isRecord(value)) throw new Error('Invalid collaboration element');
      const entries: Array<[string, unknown]> = value instanceof Y.Map ? [...value.entries()] : Object.entries(value);
      if (entries.length > 200) throw new Error('Invalid collaboration element');
      const result: JsonRecord = {};
      for (const [key, child] of entries) {
        budget.bytes += encoder.encode(key).byteLength + 8;
        if (forbidden.has(key) || budget.bytes > maxBytes) throw new Error('Invalid collaboration element');
        // Optional JavaScript fields serialize as absent, never as shared types.
        if (child !== undefined) result[key] = read(child, depth + 1);
      }
      return result;
    } finally { ancestors.delete(value); }
  };
  try {
    const value = read(input, 0);
    if (!isJsonRecord(value)) return null;
    // Interaction state is local to each editor, never durable diagram content.
    for (const key of ['selected', 'dragging', 'resizing', 'measured']) delete value[key];
    if (isJsonRecord(value.data)) {
      delete value.data.isEditing;
      // The standard save bridge synthesizes this fallback from the label.
      // Keep independent descriptions, including explicitly empty descriptions.
      if (typeof value.data.label === 'string' && value.data.description === `<b>${value.data.label}</b>`) delete value.data.description;
    }
    return value;
  } catch { return null; }
};

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
