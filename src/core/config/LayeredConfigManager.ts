/**
 * 分层配置管理系统
 * 支持配置继承、覆盖和验证
 */

import { logger } from '../utils/Logger';
import { ErrorType, ErrorSeverity, createError } from '../utils/ErrorHandler';
import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';
import { logUiStorageWriteFailure } from '../utils/uiStorageLogging';
import { registerDefaultLayeredConfigSchemas } from './LayeredConfigDefaults';
import {
  MAX_PERSISTED_LAYER_CONFIG_CHARS,
  readPersistedLayerData
} from './LayeredConfigPersistence';
import {
  CONFIG_PRIORITY,
  ConfigLayer,
  createLayeredConfigChangeEvent,
  isConfigLayer,
  isLayeredConfigValueType,
  type CloudStorageAdapter,
  type ConfigLayerData,
  type ConfigSchema,
  type LayeredConfigListener
} from './LayeredConfigTypes';
import {
  cloneConfigValue,
  isPlainConfigObject
} from './ConfigValueBoundary';

export {
  CONFIG_PRIORITY,
  ConfigLayer,
  type CloudStorageAdapter,
  type ConfigLayerData,
  type ConfigSchema,
  type ConfigValidator,
  type LayeredConfigChangeEvent,
  type LayeredConfigListener
} from './LayeredConfigTypes';

const MAX_LAYERED_CONFIG_IMPORT_JSON_LENGTH = 2 * 1024 * 1024;

/**
 * 分层配置管理器
 * 
 * 特性：
 * 1. 多层配置继承
 * 2. 配置验证和清理
 * 3. 配置模式定义
 * 4. 变更监听
 * 5. 配置迁移
 */
export class LayeredConfigManager {
  private static instance: LayeredConfigManager;

  // 配置层数据
  private layers = new Map<ConfigLayer, ConfigLayerData>();

  // 配置模式
  private schemas = new Map<string, ConfigSchema>();

  // 监听器
  private listeners = new Map<string, Set<LayeredConfigListener>>();
  private globalListeners = new Set<LayeredConfigListener>();

  // 缓存
  private effectiveConfigCache = new Map<string, unknown>();
  private cacheVersion = 0;

  private cloudAdapter: CloudStorageAdapter | null = null;
  public setCloudAdapter(adapter: CloudStorageAdapter): void {
    this.cloudAdapter = adapter;
    this.syncWithCloud();
  }

  private configLogger = logger.createChild('LayeredConfigManager');

  private constructor() {
    this.initializeLayers();
    this.initializeDefaultSchemas();
    this.loadPersistedConfigs();
  }

  public static getInstance(): LayeredConfigManager {
    if (!LayeredConfigManager.instance) {
      LayeredConfigManager.instance = new LayeredConfigManager();
    }
    return LayeredConfigManager.instance;
  }

  /**
   * 初始化配置层
   */
  private initializeLayers(): void {
    Object.values(ConfigLayer).forEach(layer => {
      this.layers.set(layer, {
        layer,
        data: new Map(),
        metadata: {
          lastModified: Date.now(),
          source: 'initialization'
        }
      });
    });
  }

  /** 初始化默认配置模式。 */
  private initializeDefaultSchemas(): void {
    registerDefaultLayeredConfigSchemas(schema => this.registerSchema(schema));
  }

  /**
   * 加载持久化配置
   */
  private loadPersistedConfigs(): void {
    try {
      // Check if storage is available
      const hasLocalStorage = typeof localStorage !== 'undefined';
      const hasSessionStorage = typeof sessionStorage !== 'undefined';

      // 加载全局配置
      if (hasLocalStorage) {
        const data = readPersistedLayerData(localStorage, 'layered-config-global');
        if (data) {
          this.setLayerData(ConfigLayer.GLOBAL, data, 'localStorage');
        }

        // 加载用户配置
        const userData = readPersistedLayerData(localStorage, 'layered-config-user');
        if (userData) {
          this.setLayerData(ConfigLayer.USER, userData, 'localStorage');
        }
      }

      // 加载会话配置
      if (hasSessionStorage) {
        const data = readPersistedLayerData(sessionStorage, 'layered-config-session');
        if (data) {
          this.setLayerData(ConfigLayer.SESSION, data, 'sessionStorage');
        }
      }


      // 尝试从云端加载配置 (如果已登录)
      this.syncWithCloud();

    } catch (error) {
      safeLog.error('LayeredConfigManager: Failed to load persisted configs:', redactSensitiveLogValue(error));
      this.configLogger.error('加载持久化配置失败');
    }
  }

  /**
   * 与云端同步配置
   */
  public async syncWithCloud() {
    if (!this.cloudAdapter) return;
    try {
      await this.cloudAdapter.syncWithCloud((key, value) => {
        try {
          if (key === 'layered-config-user') {
            this.setLayerData(ConfigLayer.USER, value, 'cloud');
          } else if (key === 'layered-config-global') {
            this.setLayerData(ConfigLayer.GLOBAL, value, 'cloud');
          }
        } catch {
          this.configLogger.warn('忽略无效云端配置层', { key });
        }
      });
    } catch (e) {
      safeLog.error('LayeredConfigManager: Cloud sync failed', redactSensitiveLogValue(e));
    }
  }

  /**
   * 设置配置层数据
   */
  private setLayerData(layer: ConfigLayer, data: Record<string, unknown>, source: string): void {
    const layerData = this.layers.get(layer);
    if (!layerData) return;

    const normalized = this.normalizeConfigRecord(data, { requireKnown: false, invalidValueMode: 'drop' });
    if (Object.keys(normalized).length === 0) return;

    Object.entries(normalized).forEach(([key, value]) => {
      layerData.data.set(key, value);
    });

    layerData.metadata.lastModified = Date.now();
    layerData.metadata.source = source;

    this.invalidateCache();
  }

  /**
   * 注册配置模式
   */
  public registerSchema(schema: ConfigSchema): void {
    const safeDefaultValue = cloneConfigValue(schema.defaultValue);
    if (!isLayeredConfigValueType(safeDefaultValue, schema.type)) {
      throw createError(
        `配置模式默认值类型无效: ${schema.key}`,
        ErrorType.VALIDATION,
        ErrorSeverity.HIGH
      );
    }
    const registeredSchema: ConfigSchema = {
      ...schema,
      defaultValue: safeDefaultValue,
      validator: schema.validator ? { ...schema.validator } : undefined,
      tags: schema.tags ? [...schema.tags] : undefined
    };
    const previousSchema = this.schemas.get(schema.key);
    this.schemas.set(schema.key, registeredSchema);
    const validatedDefaultValue = this.validateAndSanitize(schema.key, safeDefaultValue);
    if (validatedDefaultValue === undefined) {
      if (previousSchema) {
        this.schemas.set(schema.key, previousSchema);
      } else {
        this.schemas.delete(schema.key);
      }
      throw createError(
        `配置模式默认值验证失败: ${schema.key}`,
        ErrorType.VALIDATION,
        ErrorSeverity.HIGH
      );
    }
    registeredSchema.defaultValue = cloneConfigValue(validatedDefaultValue);
    this.invalidateCache();
    this.configLogger.debug(`注册配置模式: ${schema.key}`);
  }

  /**
   * 批量注册配置模式
   */
  public registerSchemas(schemas: ConfigSchema[]): void {
    schemas.forEach(schema => this.registerSchema(schema));
  }

  /**
   * 获取配置值 (别名方法，兼容旧接口)
   */
  public getConfig<T = unknown>(key: string, fallback?: T): T {
    return this.get(key, fallback);
  }

  /**
   * 设置配置值 (别名方法，兼容旧接口)
   */
  public setConfig<T = unknown>(
    key: string,
    value: T,
    layer: ConfigLayer = ConfigLayer.USER
  ): void {
    this.set(key, value, layer);
  }

  /**
   * 获取配置值
   */
  public get<T = unknown>(key: string, fallback?: T): T {
    // 检查缓存
    const cacheKey = `${key}:${this.cacheVersion}`;
    if (this.effectiveConfigCache.has(cacheKey)) {
      return cloneConfigValue(this.effectiveConfigCache.get(cacheKey)) as T;
    }

    // 按优先级合并配置
    let effectiveValue: T | undefined;
    const sortedLayers = Array.from(this.layers.entries())
      .sort(([, a], [, b]) => CONFIG_PRIORITY[a.layer] - CONFIG_PRIORITY[b.layer]);

    for (const [, layerData] of sortedLayers) {
      if (layerData.data.has(key)) {
        effectiveValue = layerData.data.get(key) as T | undefined;
      }
    }

    // 使用默认值
    if (effectiveValue === undefined) {
      const schema = this.schemas.get(key);
      effectiveValue = (schema?.defaultValue as T | undefined) ?? fallback;
    }

    // 验证配置值
    if (effectiveValue !== undefined) {
      const validatedValue = this.validateAndSanitize(key, effectiveValue);
      if (validatedValue !== undefined) {
        effectiveValue = validatedValue;
      }
    }

    // 缓存结果
    if (effectiveValue !== undefined) {
      this.effectiveConfigCache.set(cacheKey, cloneConfigValue(effectiveValue));
      return cloneConfigValue(effectiveValue) as T;
    }

    return effectiveValue as T;
  }

  /**
   * 设置配置值
   */
  public set<T = unknown>(
    key: string,
    value: T,
    layer: ConfigLayer = ConfigLayer.USER
  ): void {
    const oldValue = this.get(key);

    // 验证配置值
    const validatedValue = this.validateAndSanitize(key, value);
    if (validatedValue === undefined) {
      throw createError(
        `配置值验证失败: ${key}`,
        ErrorType.VALIDATION,
        ErrorSeverity.HIGH
      );
    }

    // 设置配置值
    const layerData = this.getLayerDataOrThrow(layer);
    if (!layerData) return;

    layerData.data.set(key, validatedValue);
    layerData.metadata.lastModified = Date.now();
    layerData.metadata.source = 'api';

    // 清除缓存
    this.invalidateCache();

    // 持久化配置
    this.persistLayer(layer);

    // 通知监听器
    const effectiveValue = this.get(key);
    this.notifyListeners(key, oldValue, validatedValue, layer, effectiveValue);
  }

  /**
   * 删除配置值
   */
  public remove(
    key: string,
    layer: ConfigLayer = ConfigLayer.USER
  ): void {
    const oldValue = this.get(key);

    const layerData = this.getLayerDataOrThrow(layer);
    if (!layerData) return;

    if (!layerData.data.has(key)) {
      return;
    }

    layerData.data.delete(key);
    layerData.metadata.lastModified = Date.now();
    layerData.metadata.source = 'api-remove';

    // 清除缓存
    this.invalidateCache();

    // 持久化配置
    this.persistLayer(layer);

    // 通知监听器
    const effectiveValue = this.get(key);
    this.notifyListeners(key, oldValue, undefined, layer, effectiveValue);
  }

  /**
   * 批量设置配置
   */
  public setMultiple(
    configs: Record<string, unknown>,
    layer: ConfigLayer = ConfigLayer.USER
  ): void {
    const layerData = this.getLayerDataOrThrow(layer);
    if (!layerData) return;
    const normalizedConfigs = this.normalizeConfigRecord(configs, { requireKnown: true, invalidValueMode: 'throw' });
    const changes: Array<{
      key: string;
      oldValue: unknown;
      newValue: unknown;
      effectiveValue: unknown;
    }> = [];

    // 收集所有变更
    Object.entries(normalizedConfigs).forEach(([key, value]) => {
      const oldValue = this.get(key);
      layerData.data.set(key, cloneConfigValue(value));
      changes.push({
        key,
        oldValue,
        newValue: value,
        effectiveValue: undefined
      });
    });

    // 更新元数据
    layerData.metadata.lastModified = Date.now();
    layerData.metadata.source = 'api-batch';

    // 清除缓存
    this.invalidateCache();

    // 持久化配置
    this.persistLayer(layer);

    // 批量通知监听器
    changes.forEach(({ key, oldValue, newValue }) => {
      this.notifyListeners(key, oldValue, newValue, layer, this.get(key));
    });
  }

  /**
   * 获取配置层的所有配置
   */
  public getLayer(layer: ConfigLayer): Record<string, unknown> {
    const layerData = this.layers.get(layer);
    if (!layerData) return {};

    const result: Record<string, unknown> = {};
    layerData.data.forEach((value, key) => {
      result[key] = cloneConfigValue(value);
    });
    return result;
  }

  /**
   * 获取有效配置（合并所有层）
   */
  public getEffectiveConfig(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // 收集所有配置键
    const allKeys = new Set<string>();
    this.layers.forEach(layerData => {
      layerData.data.forEach((_, key) => {
        allKeys.add(key);
      });
    });
    this.schemas.forEach((_, key) => {
      allKeys.add(key);
    });

    // 获取每个键的有效值
    allKeys.forEach(key => {
      result[key] = this.get(key);
    });

    return result;
  }

  /**
   * 重置配置层
   */
  public resetLayer(layer: ConfigLayer): void {
    const layerData = this.getLayerDataOrThrow(layer);
    if (!layerData) return;

    const oldData = new Map(layerData.data);
    layerData.data.clear();
    layerData.metadata.lastModified = Date.now();
    layerData.metadata.source = 'reset';

    this.invalidateCache();
    this.persistLayer(layer);

    // 通知所有受影响的配置
    oldData.forEach((oldValue, key) => {
      const effectiveValue = this.get(key);
      this.notifyListeners(key, oldValue, undefined, layer, effectiveValue);
    });
  }

  /**
   * 添加配置监听器
   */
  public addListener<T = unknown>(key: string, listener: LayeredConfigListener<T>): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
  }

  /**
   * 添加全局监听器
   */
  public addGlobalListener(listener: LayeredConfigListener): void {
    this.globalListeners.add(listener);
  }

  /**
   * 移除配置监听器
   */
  public removeListener<T = unknown>(key: string, listener: LayeredConfigListener<T>): void {
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.delete(listener);
      if (keyListeners.size === 0) {
        this.listeners.delete(key);
      }
    }
  }

  /**
   * 移除全局监听器
   */
  public removeGlobalListener(listener: LayeredConfigListener): void {
    this.globalListeners.delete(listener);
  }

  /**
   * 验证和清理配置值
   */
  private validateAndSanitize<T>(key: string, value: T): T | undefined {
    const schema = this.schemas.get(key);

    try {
      const safeValue = cloneConfigValue(value);
      if (schema && !isLayeredConfigValueType(safeValue, schema.type)) {
        this.configLogger.warn(`配置类型验证失败: ${key}`);
        return undefined;
      }
      if (!schema?.validator) return safeValue;

      // 验证
      const validationResult = schema.validator.validate(safeValue);
      if (validationResult !== true) {
        this.configLogger.warn(`配置验证失败: ${key}`);
        return undefined;
      }

      // 清理
      if (schema.validator.sanitize) {
        const sanitizedValue = cloneConfigValue(schema.validator.sanitize(safeValue));
        return isLayeredConfigValueType(sanitizedValue, schema.type)
          ? sanitizedValue as T
          : undefined;
      }

      return safeValue;
    } catch {
      this.configLogger.error(`配置验证异常: ${key}`);
      return undefined;
    }
  }

  private getLayerDataOrThrow(layer: ConfigLayer): ConfigLayerData | null {
    const layerData = this.layers.get(layer);
    if (!layerData) {
      throw createError(
        `无效的配置层: ${layer}`,
        ErrorType.CONFIG,
        ErrorSeverity.HIGH
      );
    }
    return layerData;
  }

  private normalizeConfigRecord(
    configs: unknown,
    options: { requireKnown: boolean; invalidValueMode: 'throw' | 'drop' }
  ): Record<string, unknown> {
    if (!isPlainConfigObject(configs)) {
      throw new Error('配置必须是对象');
    }

    const normalized: Record<string, unknown> = {};
    Object.entries(configs).forEach(([key, value]) => {
      if (!this.schemas.has(key)) return;
      const validatedValue = this.validateAndSanitize(key, value);
      if (validatedValue === undefined) {
        if (options.invalidValueMode === 'throw') {
          throw new Error(`配置值验证失败: ${key}`);
        }
        return;
      }
      normalized[key] = validatedValue;
    });

    if (options.requireKnown && Object.keys(normalized).length === 0) {
      throw new Error('没有可识别的配置项');
    }

    return normalized;
  }

  /**
   * 持久化配置层
   */
  private persistLayer(layer: ConfigLayer): void {
    let storageKey: string | null = null;
    try {
      const layerData = this.layers.get(layer);
      if (!layerData) return;

      const data: Record<string, unknown> = {};
      layerData.data.forEach((value, key) => {
        data[key] = cloneConfigValue(value);
      });
      const serialized = JSON.stringify(data);
      if (serialized.length > MAX_PERSISTED_LAYER_CONFIG_CHARS) {
        this.configLogger.warn('配置层超过持久化大小限制', { layer });
        return;
      }

      const hasLocalStorage = typeof localStorage !== 'undefined';
      const hasSessionStorage = typeof sessionStorage !== 'undefined';

      switch (layer) {
        case ConfigLayer.GLOBAL:
        case ConfigLayer.USER:
          if (hasLocalStorage) {
            storageKey = `layered-config-${layer}`;
            localStorage.setItem(storageKey, serialized);

            // Async sync to cloud via adapter
            if (this.cloudAdapter) {
              this.cloudAdapter.saveConfig(storageKey, cloneConfigValue(data)).catch(err => {
                safeLog.error('Cloud save failed for layer', layer, redactSensitiveLogValue(err));
              });
            }
          }
          break;
        case ConfigLayer.SESSION:
          if (hasSessionStorage) {
            storageKey = `layered-config-${layer}`;
            sessionStorage.setItem(storageKey, serialized);
          }
          break;
      }
    } catch (error) {
      if (storageKey) {
        logUiStorageWriteFailure('LayeredConfigManager.persistLayer', storageKey, error);
      }
      this.configLogger.error(`持久化配置层失败: ${layer}`);
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners<T>(
    key: string,
    oldValue: T,
    newValue: T,
    layer: ConfigLayer,
    effectiveValue: T
  ): void {
    // 通知特定键的监听器
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(listener => {
        try {
          listener(createLayeredConfigChangeEvent(key, oldValue, newValue, layer, effectiveValue));
        } catch {
          this.configLogger.error(`配置监听器异常: ${key}`);
        }
      });
    }

    // 通知全局监听器
    this.globalListeners.forEach(listener => {
      try {
        listener(createLayeredConfigChangeEvent(key, oldValue, newValue, layer, effectiveValue));
      } catch (error) {
        safeLog.error(
          'LayeredConfigManager: global listener failed',
          redactSensitiveLogValue(error),
        );
      }
    });
  }

  /**
   * 清除缓存
   */
  private invalidateCache(): void {
    this.cacheVersion++;
    this.effectiveConfigCache.clear();
  }

  /**
   * 导出配置
   */
  public exportConfig(layers?: ConfigLayer[]): string {
    const targetLayers = layers || Object.values(ConfigLayer);
    const exportData: Record<string, unknown> = {};

    targetLayers.forEach(layer => {
      exportData[layer] = this.getLayer(layer);
    });

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导入配置
   */
  public importConfig(configJson: string, targetLayer: ConfigLayer = ConfigLayer.USER): void {
    try {
      if (configJson.length > MAX_LAYERED_CONFIG_IMPORT_JSON_LENGTH) {
        throw new Error('Layered config JSON is too large.');
      }

      const data = JSON.parse(configJson);

      if (!isPlainConfigObject(data)) {
        throw new Error('配置必须是对象');
      }

      // 如果是分层数据，先完成所有层的校验，避免部分写入。
      if (Object.keys(data).some(isConfigLayer)) {
        const normalizedByLayer = new Map<ConfigLayer, Record<string, unknown>>();
        Object.entries(data).forEach(([layer, configs]) => {
          if (!isConfigLayer(layer)) return;
          const normalized = this.normalizeConfigRecord(configs, { requireKnown: false, invalidValueMode: 'throw' });
          if (Object.keys(normalized).length > 0) {
            normalizedByLayer.set(layer, normalized);
          }
        });
        if (normalizedByLayer.size === 0) throw new Error('没有可识别的配置项');
        normalizedByLayer.forEach((configs, layer) => this.setMultiple(configs, layer));
        return;
      }

      // 如果是平面数据
      this.setMultiple(data, targetLayer);
    } catch {
      throw createError(
        '导入配置失败',
        ErrorType.CONFIG,
        ErrorSeverity.HIGH,
        { data: { reason: 'invalid-layered-config-payload' } }
      );
    }
  }

  /**
   * 获取配置统计信息
   */
  public getStats(): Record<string, unknown> {
    const layers: Record<string, {
      configCount: number;
      lastModified: number;
      source: string;
    }> = {};
    const stats = {
      layers,
      schemas: this.schemas.size,
      listeners: this.listeners.size,
      globalListeners: this.globalListeners.size,
      cacheSize: this.effectiveConfigCache.size,
      cacheVersion: this.cacheVersion
    };

    this.layers.forEach((layerData, layer) => {
      layers[layer] = {
        configCount: layerData.data.size,
        lastModified: layerData.metadata.lastModified,
        source: layerData.metadata.source
      };
    });

    return stats;
  }
}

// 导出单例实例
export const layeredConfigManager = LayeredConfigManager.getInstance();

// 便捷函数
export const getLayeredConfig = <T = unknown>(key: string, fallback?: T): T => {
  return layeredConfigManager.get(key, fallback);
};

export const setLayeredConfig = <T = unknown>(
  key: string,
  value: T,
  layer: ConfigLayer = ConfigLayer.USER
): void => {
  layeredConfigManager.set(key, value, layer);
};

export const onLayeredConfigChange = <T = unknown>(
  key: string,
  listener: LayeredConfigListener<T>
): void => {
  layeredConfigManager.addListener(key, listener);
};
