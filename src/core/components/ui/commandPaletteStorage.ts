export const COMMAND_PALETTE_USAGE_STORAGE_KEY = 'commandPalette.usage';
export const COMMAND_PALETTE_RECENT_STORAGE_KEY = 'commandPalette.recent';
import { logCommandPaletteStorageFailure } from './commandPaletteStorageLogging';
import { safeJsonParseWithLimit } from '@/core/utils/jsonUtils';

const MAX_USAGE_ENTRIES = 200;
const MAX_RECENT_ENTRIES = 20;
const MAX_USAGE_COUNT = 1000;
const MAX_COMMAND_ID_LENGTH = 160;
const MAX_COMMAND_PALETTE_JSON_LENGTH = 2 * 1024 * 1024;

export const isSafeCommandId = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_COMMAND_ID_LENGTH && /^[a-z0-9:_./-]+$/i.test(trimmed);
};

const parseJson = (value: string | null, action: 'readCommandUsage' | 'readRecentCommandIds'): unknown => {
  return safeJsonParseWithLimit<unknown>(value, null, {
    maxLength: MAX_COMMAND_PALETTE_JSON_LENGTH,
    onFailure: (error) => {
      logCommandPaletteStorageFailure(action, error);
    },
    buildOversizeError: () => new Error('Command palette storage JSON is too large.'),
  });
};

export const coerceCommandUsage = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([id]) => isSafeCommandId(id))
    .map(([id, count]) => [id.trim(), Math.min(MAX_USAGE_COUNT, Math.max(0, Math.floor(Number(count) || 0)))] as const)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_USAGE_ENTRIES);

  return Object.fromEntries(entries);
};

export const coerceRecentCommandIds = (value: unknown, maxEntries = MAX_RECENT_ENTRIES): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawId of value) {
    if (!isSafeCommandId(rawId)) continue;
    const id = rawId.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= maxEntries) break;
  }

  return result;
};

export const readCommandUsage = (): Record<string, number> => {
  try {
    return coerceCommandUsage(parseJson(localStorage.getItem(COMMAND_PALETTE_USAGE_STORAGE_KEY), 'readCommandUsage'));
  } catch (error) {
    logCommandPaletteStorageFailure('readCommandUsage', error);
    return {};
  }
};

export const bumpCommandUsage = (id: string): void => {
  if (!isSafeCommandId(id)) return;
  try {
    const usage = readCommandUsage();
    const normalizedId = id.trim();
    usage[normalizedId] = Math.min(MAX_USAGE_COUNT, (usage[normalizedId] || 0) + 1);
    localStorage.setItem(COMMAND_PALETTE_USAGE_STORAGE_KEY, JSON.stringify(coerceCommandUsage(usage)));
  } catch (error) {
    logCommandPaletteStorageFailure('bumpCommandUsage', error);
  }
};

export const readRecentCommandIds = (maxEntries = MAX_RECENT_ENTRIES): string[] => {
  try {
    return coerceRecentCommandIds(parseJson(localStorage.getItem(COMMAND_PALETTE_RECENT_STORAGE_KEY), 'readRecentCommandIds'), maxEntries);
  } catch (error) {
    logCommandPaletteStorageFailure('readRecentCommandIds', error);
    return [];
  }
};

export const bumpRecentCommandId = (id: string): string[] => {
  if (!isSafeCommandId(id)) return readRecentCommandIds();
  const normalizedId = id.trim();
  const next = [normalizedId, ...readRecentCommandIds().filter(item => item !== normalizedId)].slice(0, MAX_RECENT_ENTRIES);
  try {
    localStorage.setItem(COMMAND_PALETTE_RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    logCommandPaletteStorageFailure('bumpRecentCommandId', error);
  }
  return next;
};
