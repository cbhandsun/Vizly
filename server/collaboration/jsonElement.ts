export type JsonValue = null | boolean | number | string | JsonValue[] | JsonRecord;
export interface JsonRecord { [key: string]: JsonValue }
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();
const maxBytes = 2 * 1024 * 1024;
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);
const isJsonRecord = (value: JsonValue | undefined): value is JsonRecord => (
  value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
);

/** Decode only bounded JSON and shared maps, never arbitrary Yjs types/prototypes. */
export const readCollaborationJsonElement = (input: unknown, sharedReader?: (value: object) => Array<[string, unknown]> | null): JsonRecord | null => {
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
      const sharedEntries = sharedReader?.(value);
      if (!sharedEntries && !isRecord(value)) throw new Error('Invalid collaboration element');
      const entries: Array<[string, unknown]> = sharedEntries ?? Object.entries(value);
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
