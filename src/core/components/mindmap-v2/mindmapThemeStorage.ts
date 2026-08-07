import { logUiStorageReadFailure, logUiStorageWriteFailure } from '../../utils/uiStorageLogging';

const MINDMAP_THEME_STORAGE_KEY = 'vizly_mindmap_theme';
const APPLICATION_THEME_STORAGE_KEY = 'vizly-theme';
const MINDMAP_THEME_KEYS = new Set(['indigo', 'ocean', 'emerald', 'rose', 'dark']);

export type MindMapThemeKey = 'indigo' | 'ocean' | 'emerald' | 'rose' | 'dark';
type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

const getBrowserStorage = (): ThemeStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (error) {
    logUiStorageReadFailure('mindmapThemeStorage.getBrowserStorage', MINDMAP_THEME_STORAGE_KEY, error);
    return null;
  }
};

const readStorageValue = (
  key: string,
  storage: ThemeStorage | null = getBrowserStorage(),
): string | null => {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    return typeof value === 'string' && value.length <= 80 ? value : null;
  } catch (error) {
    logUiStorageReadFailure('mindmapThemeStorage.read', key, error);
    return null;
  }
};

export const readStoredMindMapThemeKey = (
  storage: ThemeStorage | null = getBrowserStorage(),
): MindMapThemeKey | null => {
  const value = readStorageValue(MINDMAP_THEME_STORAGE_KEY, storage);
  return value && MINDMAP_THEME_KEYS.has(value) ? value as MindMapThemeKey : null;
};

export const resolveMindMapThemeKey = (
  storage: ThemeStorage | null = getBrowserStorage(),
): MindMapThemeKey => readStoredMindMapThemeKey(storage) ?? 'indigo';

export const shouldSyncMindMapThemeWithApplication = (
  storage: ThemeStorage | null = getBrowserStorage(),
): boolean => readStoredMindMapThemeKey(storage) === null;

export const isStoredApplicationThemeDark = (
  storage: ThemeStorage | null = getBrowserStorage(),
): boolean => readStorageValue(APPLICATION_THEME_STORAGE_KEY, storage) === 'dark';

export const persistMindMapThemeKey = (
  value: unknown,
  storage: ThemeStorage | null = getBrowserStorage(),
): value is MindMapThemeKey => {
  if (typeof value !== 'string' || !MINDMAP_THEME_KEYS.has(value) || !storage) return false;
  try {
    storage.setItem(MINDMAP_THEME_STORAGE_KEY, value);
    return true;
  } catch (error) {
    logUiStorageWriteFailure('mindmapThemeStorage.persist', MINDMAP_THEME_STORAGE_KEY, error);
    return false;
  }
};
