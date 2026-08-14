import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import type { SortKey, ViewMode } from './diagramManagementPage.helpers';

export const WORKSPACE_DISPLAY_PREFERENCES_STORAGE_KEY = 'vizly.workspace.display-preferences.v1';

const WORKSPACE_DISPLAY_PREFERENCES_VERSION = 1;
const MAX_PREFERENCES_LENGTH = 512;

export interface WorkspaceDisplayPreferences {
  readonly version: typeof WORKSPACE_DISPLAY_PREFERENCES_VERSION;
  readonly viewMode: ViewMode;
  readonly sortKey: SortKey;
}

export interface WorkspaceDisplayPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type WorkspaceDisplayPreferencesStorageProvider = () => WorkspaceDisplayPreferencesStorage | null;

export const DEFAULT_WORKSPACE_DISPLAY_PREFERENCES: WorkspaceDisplayPreferences = Object.freeze({
  version: WORKSPACE_DISPLAY_PREFERENCES_VERSION,
  viewMode: 'grid',
  sortKey: 'updated',
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isViewMode = (value: unknown): value is ViewMode => value === 'grid' || value === 'list';

const isSortKey = (value: unknown): value is SortKey => (
  value === 'updated' || value === 'name' || value === 'type'
);

export const coerceWorkspaceDisplayPreferences = (value: unknown): WorkspaceDisplayPreferences => {
  if (!isRecord(value)
    || !Object.hasOwn(value, 'version')
    || !Object.hasOwn(value, 'viewMode')
    || !Object.hasOwn(value, 'sortKey')
    || value.version !== WORKSPACE_DISPLAY_PREFERENCES_VERSION
    || !isViewMode(value.viewMode)
    || !isSortKey(value.sortKey)) {
    return DEFAULT_WORKSPACE_DISPLAY_PREFERENCES;
  }

  return {
    version: WORKSPACE_DISPLAY_PREFERENCES_VERSION,
    viewMode: value.viewMode,
    sortKey: value.sortKey,
  };
};

export const parseWorkspaceDisplayPreferences = (value: unknown): WorkspaceDisplayPreferences => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PREFERENCES_LENGTH) {
    return DEFAULT_WORKSPACE_DISPLAY_PREFERENCES;
  }

  try {
    return coerceWorkspaceDisplayPreferences(JSON.parse(value) as unknown);
  } catch {
    return DEFAULT_WORKSPACE_DISPLAY_PREFERENCES;
  }
};

const defaultStorageProvider: WorkspaceDisplayPreferencesStorageProvider = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

export const readWorkspaceDisplayPreferences = (
  storageProvider: WorkspaceDisplayPreferencesStorageProvider = defaultStorageProvider,
): WorkspaceDisplayPreferences => {
  try {
    const storage = storageProvider();
    if (!storage) return DEFAULT_WORKSPACE_DISPLAY_PREFERENCES;
    return parseWorkspaceDisplayPreferences(storage.getItem(WORKSPACE_DISPLAY_PREFERENCES_STORAGE_KEY));
  } catch (error) {
    safeLog.warn(
      '[Workspace] Failed to read display preferences:',
      redactSensitiveLogValue(error),
    );
    return DEFAULT_WORKSPACE_DISPLAY_PREFERENCES;
  }
};

export const writeWorkspaceDisplayPreferences = (
  preferences: WorkspaceDisplayPreferences,
  storageProvider: WorkspaceDisplayPreferencesStorageProvider = defaultStorageProvider,
): boolean => {
  const safePreferences = coerceWorkspaceDisplayPreferences(preferences);
  try {
    const storage = storageProvider();
    if (!storage) return false;
    storage.setItem(WORKSPACE_DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(safePreferences));
    return true;
  } catch (error) {
    safeLog.warn(
      '[Workspace] Failed to save display preferences:',
      redactSensitiveLogValue(error),
    );
    return false;
  }
};
