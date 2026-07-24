/**
 * 统一配置管理系统
 */

import { DiagramConfig, SpacingConfig } from '../types/common';
import { logger } from '../utils/Logger';
import { ErrorType, ErrorSeverity, createError } from '../utils/ErrorHandler';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '../utils/uiStorageLogging';

import {
  CONFIG_DEFINITIONS,
  ConfigSource,
  type ConfigDefinition,
  type ConfigListener
} from './ConfigDefinitions';
import {
  cloneConfigValue,
  configValuesEqual,
  getConfigLocalStorage,
  isPlainConfigObject,
  MAX_IMPORT_CONFIG_CHARS,
  MAX_STORED_CONFIG_CHARS,
  parseBoundedConfigJson,
  sanitizeConfigValue
} from './ConfigValueBoundary';

export {
  CONFIG_DEFINITIONS,
  ConfigSource,
  type ConfigChangeEvent,
  type ConfigDefinition,
  type ConfigListener,
  type ConfigValidator
} from './ConfigDefinitions';

export class ConfigManager {
  private static instance: ConfigManager;
  private configs = new Map<string, unknown>();
  private listeners = new Map<string, Set<ConfigListener>>();
  private definitions = new Map<string, ConfigDefinition>();
  private configLogger = logger.createChild('ConfigManager');

  private constructor() {
    this.initializeDefinitions();
    this.loadPersistedConfigs();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 初始化配置定义
   */
  private initializeDefinitions(): void {
    Object.values(CONFIG_DEFINITIONS).forEach(definition => {
      const registeredDefinition = {
        ...definition,
        defaultValue: cloneConfigValue(definition.defaultValue)
      };
      this.definitions.set(definition.key, registeredDefinition);
      this.configs.set(definition.key, cloneConfigValue(registeredDefinition.defaultValue));
    });
  }

  /**
   * 加载持久化配置
   */
  private loadPersistedConfigs(): void {
    const storage = getConfigLocalStorage();
    if (!storage) return;
    this.definitions.forEach((definition, key) => {
      if (definition.persistent) {
        const storageKey = definition.storageKey || key;
        try {
          const stored = storage.getItem(`config_${storageKey}`);
          
          if (stored !== null) {
            const value = sanitizeConfigValue(parseBoundedConfigJson(
              stored,
              MAX_STORED_CONFIG_CHARS,
              `持久化配置 ${key}`
            ));
            if (this.validateConfig(key, value)) {
              this.configs.set(key, value);
              this.configLogger.debug(`加载持久化配置: ${key}`);
            } else {
              storage.removeItem(`config_${storageKey}`);
            }
          }
        } catch (error) {
          logUiStorageReadFailure('ConfigManager.loadPersistedConfigs', `config_${storageKey}`, error);
          try {
            storage.removeItem(`config_${storageKey}`);
          } catch {
            // Ignore cleanup failures; defaults remain active.
          }
          this.configLogger.warn(`加载配置失败: ${key}`);
        }
      }
    });
  }

  /**
   * 验证配置值
   */
  private validateConfig(key: string, value: unknown): boolean {
    const definition = this.definitions.get(key);
    if (!definition) return false;

    if (definition.validator) {
      const result = definition.validator(value);
      if (typeof result === 'string') {
        this.configLogger.warn(`配置验证失败: ${key}`);
        return false;
      }
      return result;
    }

    return true;
  }

  private normalizeKnownConfigRecord(configs: unknown): Record<string, unknown> {
    if (!isPlainConfigObject(configs)) {
      throw new Error('配置必须是对象');
    }

    const knownConfigs: Record<string, unknown> = {};
    Object.entries(configs).forEach(([key, value]) => {
      if (this.definitions.has(key)) {
        knownConfigs[key] = sanitizeConfigValue(value);
      }
    });

    if (Object.keys(knownConfigs).length === 0) {
      throw new Error('没有可识别的配置项');
    }

    return knownConfigs;
  }

  /**
   * 持久化配置
   */
  private persistConfig(key: string, value: unknown): void {
    const definition = this.definitions.get(key);
    if (!definition || !definition.persistent) return;
    const storage = getConfigLocalStorage();
    if (!storage) return;

    try {
      const storageKey = definition.storageKey || key;
      storage.setItem(`config_${storageKey}`, JSON.stringify(value));
      this.configLogger.debug(`持久化配置: ${key}`);
    } catch (error) {
      const storageKey = definition.storageKey || key;
      logUiStorageWriteFailure('ConfigManager.persistConfig', `config_${storageKey}`, error);
      this.configLogger.error(`持久化配置失败: ${key}`);
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners<T>(key: string, oldValue: T, newValue: T, source: ConfigSource): void {
    const listeners = this.listeners.get(key);
    if (!listeners) return;

    listeners.forEach(listener => {
      try {
        listener({
          key,
          oldValue: cloneConfigValue(oldValue),
          newValue: cloneConfigValue(newValue),
          source,
          timestamp: Date.now()
        });
      } catch {
        this.configLogger.error(`配置监听器执行失败: ${key}`);
      }
    });
  }

  /**
   * 获取配置值
   */
  public get<T = unknown>(key: string, fallback?: T): T {
    if (this.configs.has(key)) {
      return cloneConfigValue(this.configs.get(key)) as T;
    }

    const definition = this.definitions.get(key);
    if (definition) {
      return cloneConfigValue(definition.defaultValue) as T;
    }

    if (fallback !== undefined) {
      return fallback;
    }

    throw createError(
      `配置项不存在: ${key}`,
      ErrorType.CONFIG,
      ErrorSeverity.MEDIUM,
      { 
        component: 'ConfigManager',
        action: 'get',
        data: { key }
      }
    );
  }

  /**
   * 设置配置值
   */
  public set<T = unknown>(key: string, value: T, source: ConfigSource = ConfigSource.USER_OVERRIDE): void {
    const oldValue = this.configs.get(key);
    let nextValue: T;

    try {
      nextValue = sanitizeConfigValue(value) as T;
    } catch {
      throw createError(
      `配置值验证失败: ${key}`,
      ErrorType.VALIDATION,
      ErrorSeverity.MEDIUM,
      {
        component: 'ConfigManager',
        action: 'set',
        data: { key }
      }
    );
    }

    // 验证配置
    if (!this.validateConfig(key, nextValue)) {
      throw createError(
      `配置值验证失败: ${key}`,
      ErrorType.VALIDATION,
      ErrorSeverity.MEDIUM,
      { 
        component: 'ConfigManager',
        action: 'set',
        data: { key }
      }
    );
    }

    // 设置配置
    this.configs.set(key, nextValue);

    // 持久化
    this.persistConfig(key, nextValue);

    // 通知监听器
    this.notifyListeners(key, oldValue, nextValue, source);

    this.configLogger.info(`配置已更新: ${key}`, { source });
  }

  /**
   * 批量设置配置
   */
  public setMultiple(configs: Record<string, unknown>, source: ConfigSource = ConfigSource.USER_OVERRIDE): void {
    const changes: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];
    const sanitizedConfigs: Record<string, unknown> = {};

    // 验证所有配置
    for (const [key, value] of Object.entries(configs)) {
      try {
        sanitizedConfigs[key] = sanitizeConfigValue(value);
      } catch {
        throw createError(
          `批量配置验证失败: ${key}`,
          ErrorType.VALIDATION,
          ErrorSeverity.MEDIUM,
          {
            component: 'ConfigManager',
            action: 'setMultiple',
            data: { key }
          }
        );
      }

      if (!this.validateConfig(key, sanitizedConfigs[key])) {
        throw createError(
          `批量配置验证失败: ${key}`,
          ErrorType.VALIDATION,
          ErrorSeverity.MEDIUM,
          { 
            component: 'ConfigManager',
            action: 'setMultiple',
            data: { key }
          }
        );
      }
    }

    // 应用所有配置
    for (const [key, value] of Object.entries(sanitizedConfigs)) {
      const oldValue = this.configs.get(key);
      this.configs.set(key, value);
      this.persistConfig(key, value);
      changes.push({ key, oldValue, newValue: value });
    }

    // 通知所有监听器
    changes.forEach(({ key, oldValue, newValue }) => {
      this.notifyListeners(key, oldValue, newValue, source);
    });

    this.configLogger.info('批量配置已更新', { changes: changes.length, source });
  }

  /**
   * 重置配置到默认值
   */
  public reset(key: string): void {
    const definition = this.definitions.get(key);
    if (!definition) {
      throw createError(
        `配置项不存在: ${key}`,
        ErrorType.CONFIG,
        ErrorSeverity.MEDIUM,
        { 
          component: 'ConfigManager',
          action: 'reset',
          data: { key }
        }
      );
    }

    this.set(key, definition.defaultValue, ConfigSource.DEFAULT);
  }

  /**
   * 重置所有配置
   */
  public resetAll(): void {
    this.definitions.forEach((definition, key) => {
      this.set(key, definition.defaultValue, ConfigSource.DEFAULT);
    });
  }

  /**
   * 添加配置监听器
   */
  public addListener<T = unknown>(key: string, listener: ConfigListener<T>): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
  }

  /**
   * 移除配置监听器
   */
  public removeListener<T = unknown>(key: string, listener: ConfigListener<T>): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(key);
      }
    }
  }

  /**
   * 注册配置定义
   */
  public registerDefinition(definition: ConfigDefinition): void {
    const safeDefaultValue = cloneConfigValue(definition.defaultValue);
    const registeredDefinition = { ...definition, defaultValue: safeDefaultValue };
    this.definitions.set(definition.key, registeredDefinition);
    
    // 如果没有设置过该配置，使用默认值
    if (!this.configs.has(definition.key)) {
      this.configs.set(definition.key, cloneConfigValue(safeDefaultValue));
    }

    this.configLogger.debug(`注册配置定义: ${definition.key}`);
  }

  /**
   * 获取配置分组
   */
  public getGroup(group: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    this.definitions.forEach((definition, key) => {
      if (definition.group === group) {
        result[key] = this.get(key);
      }
    });

    return result;
  }

  /**
   * 获取所有配置
   */
  public getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    this.configs.forEach((value, key) => {
      const definition = this.definitions.get(key);
      if (!definition?.sensitive) {
        result[key] = value;
      }
    });

    return result;
  }

  /**
   * 导出配置
   */
  public exportConfig(includeDefaults: boolean = false): string {
    const config: Record<string, unknown> = {};

    this.definitions.forEach((definition, key) => {
      if (definition.sensitive) return;

      const currentValue = this.get(key);
      const isDefault = configValuesEqual(currentValue, definition.defaultValue);

      if (!isDefault || includeDefaults) {
        config[key] = currentValue;
      }
    });

    return JSON.stringify(config, null, 2);
  }

  /**
   * 导入配置
   */
  public importConfig(configJson: string): void {
    try {
      const config = parseBoundedConfigJson(configJson, MAX_IMPORT_CONFIG_CHARS, '导入配置');
      const knownConfig = this.normalizeKnownConfigRecord(config);
      this.setMultiple(knownConfig, ConfigSource.USER_OVERRIDE);
      this.configLogger.info('配置导入成功', { keys: Object.keys(knownConfig) });
    } catch {
      throw createError(
        '配置导入失败',
        ErrorType.VALIDATION,
        ErrorSeverity.HIGH,
        { 
          component: 'ConfigManager',
          action: 'importConfig',
          data: { reason: 'invalid-config-payload' }
        }
      );
    }
  }

  /**
   * 获取配置统计
   */
  public getStats(): Record<string, unknown> {
    const stats = {
      total: this.definitions.size,
      byGroup: {} as Record<string, number>,
      persistent: 0,
      sensitive: 0,
      customized: 0
    };

    this.definitions.forEach((definition, key) => {
      // 按分组统计
      const group = definition.group || 'default';
      stats.byGroup[group] = (stats.byGroup[group] || 0) + 1;

      // 其他统计
      if (definition.persistent) stats.persistent++;
      if (definition.sensitive) stats.sensitive++;
      
      const currentValue = this.get(key);
      if (!configValuesEqual(currentValue, definition.defaultValue)) {
        stats.customized++;
      }
    });

    return stats;
  }

  /**
   * 创建配置快照
   */
  public createSnapshot(): string {
    const snapshot = {
      timestamp: Date.now(),
      configs: this.getAll(),
      version: '1.0.0'
    };

    return JSON.stringify(snapshot);
  }

  /**
   * 恢复配置快照
   */
  public restoreSnapshot(snapshotJson: string): void {
    try {
      const snapshot = parseBoundedConfigJson(snapshotJson, MAX_IMPORT_CONFIG_CHARS, '配置快照');
      
      if (!isPlainConfigObject(snapshot) || !isPlainConfigObject(snapshot.configs)) {
        throw new Error('无效的快照格式');
      }

      const knownConfig = this.normalizeKnownConfigRecord(snapshot.configs);
      this.setMultiple(knownConfig, ConfigSource.USER_OVERRIDE);
      this.configLogger.info('配置快照恢复成功', { 
        timestamp: snapshot.timestamp,
        keys: Object.keys(knownConfig)
      });
    } catch {
      throw createError(
        '配置快照恢复失败',
        ErrorType.CONFIG,
        ErrorSeverity.HIGH,
        { 
          component: 'ConfigManager',
          action: 'restoreSnapshot',
          data: { reason: 'invalid-config-snapshot' }
        }
      );
    }
  }
}

// 导出默认实例
export const configManager = ConfigManager.getInstance();

// 便捷函数
export const getConfig = <T = unknown>(key: string, fallback?: T): T => {
  return configManager.get(key, fallback);
};

export const setConfig = <T = unknown>(key: string, value: T): void => {
  configManager.set(key, value);
};

export const onConfigChange = <T = unknown>(key: string, listener: ConfigListener<T>): void => {
  configManager.addListener(key, listener);
};

// 预定义配置获取器
export const getThemeConfig = () => configManager.getGroup('theme');
export const getLayoutConfig = () => configManager.getGroup('layout');
export const getPerformanceConfig = () => configManager.getGroup('performance');
export const getExportConfig = () => configManager.getGroup('export');

// 创建 DiagramConfig 对象
export const createDiagramConfig = (): DiagramConfig => {
  const spacing: SpacingConfig = {
    H: getConfig('layout.spacing.node', 100),
    V: getConfig('layout.spacing.level', 150)
  };

  return {
    NODE_WIDTH: 200,
    NODE_HEIGHT: 80,
    SPACING: spacing,
    GROUP_PADDING: 20,
    TITLE_BAR_HEIGHT: 40,
    containmentPolicy: getConfig('layout.containmentPolicy', 'elastic'),
    rankMode: getConfig('layout.rankMode', 'elk'),
  };
};
