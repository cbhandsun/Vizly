import { logUiStorageReadFailure, logUiStorageWriteFailure } from '@/core/utils/uiStorageLogging';

const COMMAND_PALETTE_USAGE_STORAGE_KEY = 'commandPalette.usage';
const COMMAND_PALETTE_RECENT_STORAGE_KEY = 'commandPalette.recent';

const READ_ACTIONS = new Set(['readCommandUsage', 'readRecentCommandIds']);

const getStorageKey = (action: string): string => {
  switch (action) {
    case 'readRecentCommandIds':
    case 'bumpRecentCommandId':
      return COMMAND_PALETTE_RECENT_STORAGE_KEY;
    case 'readCommandUsage':
    case 'bumpCommandUsage':
    default:
      return COMMAND_PALETTE_USAGE_STORAGE_KEY;
  }
};

export const logCommandPaletteStorageFailure = (action: string, error: unknown): void => {
  const key = getStorageKey(action);
  if (READ_ACTIONS.has(action)) {
    logUiStorageReadFailure(`commandPaletteStorage.${action}`, key, error);
    return;
  }

  logUiStorageWriteFailure(`commandPaletteStorage.${action}`, key, error);
};
