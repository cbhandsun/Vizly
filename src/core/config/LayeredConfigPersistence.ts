import { safeLog } from '../utils/consoleCleanup';
import { logUiStorageReadFailure } from '../utils/uiStorageLogging';
import { isPlainConfigObject, sanitizeConfigValue } from './ConfigValueBoundary';

export const MAX_PERSISTED_LAYER_CONFIG_CHARS = 256 * 1024;

/** 读取并清洗单个持久化配置层。无效数据会被隔离并删除。 */
export const readPersistedLayerData = (
  storage: Storage,
  key: string
): Record<string, unknown> | null => {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > MAX_PERSISTED_LAYER_CONFIG_CHARS) {
      storage.removeItem(key);
      safeLog.warn('LayeredConfigManager: removed oversized persisted layer', { key });
      return null;
    }

    const parsed = sanitizeConfigValue(JSON.parse(raw));
    if (!isPlainConfigObject(parsed)) {
      storage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (error) {
    try {
      storage.removeItem(key);
    } catch {
      // The invalid payload is still ignored when cleanup is unavailable.
    }
    logUiStorageReadFailure('LayeredConfigManager.readPersistedLayerData', key, error);
    return null;
  }
};
