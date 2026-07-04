/**
 * 分层配置管理系统
 * 支持配置继承、覆盖和验证
 */

import { logger } from '../utils/Logger';
import { ErrorType, ErrorSeverity, createError } from '../utils/ErrorHandler';
import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '../utils/uiStorageLogging';

const isPlainConfigObject = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const MAX_PERSISTED_LAYER_CONFIG_CHARS = 256 * 1024;
const MAX_LAYERED_CONFIG_IMPORT_JSON_LENGTH = 2 * 1024 * 1024;

// 配置层级枚举
export interface CloudStorageAdapter {
  syncWithCloud(onConfigLoaded: (key: string, value: any) => void): Promise<void>;
  saveConfig(key: string, data: any): Promise<void>;
}

export enum ConfigLayer {
  SYSTEM = 'system',           // 系统默认配置
  GLOBAL = 'global',           // 全局配置
  DIAGRAM_TYPE = 'diagramType', // 图表类型配置
  USER = 'user',               // 用户配置
  SESSION = 'session',         // 会话配置
  RUNTIME = 'runtime'          // 运行时配置
}

// 配置优先级（数值越高优先级越高）
export const CONFIG_PRIORITY: Record<ConfigLayer, number> = {
  [ConfigLayer.SYSTEM]: 0,
  [ConfigLayer.GLOBAL]: 10,
  [ConfigLayer.DIAGRAM_TYPE]: 20,
  [ConfigLayer.USER]: 30,
  [ConfigLayer.SESSION]: 40,
  [ConfigLayer.RUNTIME]: 50
};

const isConfigLayer = (value: unknown): value is ConfigLayer =>
  typeof value === 'string' && Object.values(ConfigLayer).includes(value as ConfigLayer);

// 配置变更事件
export interface LayeredConfigChangeEvent<T = any> {
  key: string;
  oldValue: T;
  newValue: T;
  layer: ConfigLayer;
  effectiveValue: T;
  timestamp: number;
}

// 配置监听器
export type LayeredConfigListener<T = any> = (event: LayeredConfigChangeEvent<T>) => void;

// 配置验证器
export interface ConfigValidator<T = any> {
  validate: (value: T) => boolean | string;
  sanitize?: (value: T) => T;
  description?: string;
}

// 配置模式定义
export interface ConfigSchema<T = any> {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue: T;
  description?: string;
  validator?: ConfigValidator<T>;
  required?: boolean;
  deprecated?: boolean;
  migrationPath?: string;
  group?: string;
  tags?: string[];
}

// 配置层数据
export interface ConfigLayerData {
  layer: ConfigLayer;
  data: Map<string, any>;
  metadata: {
    lastModified: number;
    source: string;
    version?: string;
  };
}

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
  private effectiveConfigCache = new Map<string, any>();
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

  /**
   * 初始化默认配置模式
   */
  private initializeDefaultSchemas(): void {
    // 主题性能配置模式
    this.registerSchema({
      key: 'theme.performance',
      type: 'object',
      defaultValue: {
        enableTransitions: true,
        transitionDuration: 300,
        batchUpdates: true,
        debounceDelay: 100,
        cacheThemes: true,
        preloadThemes: ['light', 'dark']
      },
      description: '主题性能优化配置',
      validator: {
        validate: (value: any) => {
          if (typeof value !== 'object' || value === null) return false;
          return true;
        },
        description: '必须是有效的性能配置对象'
      },
      group: 'theme'
    });

    // 图表配置模式
    this.registerSchema({
      key: 'diagram.node.width',
      type: 'number',
      defaultValue: 200,
      description: '节点默认宽度',
      validator: {
        validate: (value: number) => typeof value === 'number' && value > 0 && value <= 1000,
        description: '必须是1-1000之间的数字'
      },
      group: 'diagram'
    });

    this.registerSchema({
      key: 'diagram.node.height',
      type: 'number',
      defaultValue: 60,
      description: '节点默认高度',
      validator: {
        validate: (value: number) => typeof value === 'number' && value > 0 && value <= 500,
        description: '必须是1-500之间的数字'
      },
      group: 'diagram'
    });

    this.registerSchema({
      key: 'diagram.spacing.horizontal',
      type: 'number',
      defaultValue: 100,
      description: '水平间距',
      validator: {
        validate: (value: number) => typeof value === 'number' && value >= 0 && value <= 500,
        description: '必须是0-500之间的数字'
      },
      group: 'diagram'
    });

    this.registerSchema({
      key: 'diagram.spacing.vertical',
      type: 'number',
      defaultValue: 80,
      description: '垂直间距',
      validator: {
        validate: (value: number) => typeof value === 'number' && value >= 0 && value <= 500,
        description: '必须是0-500之间的数字'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：视图层域宽更新开关
     * - 目的：控制视图层在回收域容器高度时，是否同时按最终投影精确更新“域宽与左锚 x”
     * - 默认：false（仅更新高度与 y，保持既有左锚与宽度）；设为 true 时启用宽度与左锚更新
     */
    this.registerSchema({
      key: 'diagram.layout.view.updateDomainWidth',
      type: 'boolean',
      defaultValue: true,
      description: '视图层是否回收域宽并更新左锚',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：域宽是否仅由子域容器参与计算
     * - 目的：域宽最终投影时，仅以“可见子域容器”的水平投影参与包围盒计算，忽略普通业务节点；
     * - 默认：true（仅子域容器参与，保证域宽对齐与子域并排一致性）
     */
    this.registerSchema({
      key: 'diagram.layout.domainWidthBySubGroupsOnly',
      type: 'boolean',
      defaultValue: true,
      description: '域宽计算是否仅按子域容器参与',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：是否将子域容器与自由节点混排为块
     * - 默认：false（仅对子域容器做块级纵向堆叠；自由节点按节点布局策略单独排列）
     */
    this.registerSchema({
      key: 'diagram.layout.subGroupBlockLayout',
      type: 'boolean',
      defaultValue: false,
      description: '子域容器与自由节点是否混排为块',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：视图层域高更新开关
     * - 目的：控制视图层在回收域容器高度时是否参与更新；
     * - 默认：false（高度仅由策略层最终投影回收），设为 true 时视图层也会回收高度与 y。
     */
    this.registerSchema({
      key: 'diagram.layout.view.updateDomainHeight',
      type: 'boolean',
      defaultValue: false,
      description: '视图层是否回收域高并更新顶边 y',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });
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
        const data = this.readPersistedLayerData(localStorage, 'layered-config-global');
        if (data) {
          this.setLayerData(ConfigLayer.GLOBAL, data, 'localStorage');
        }

        // 加载用户配置
        const userData = this.readPersistedLayerData(localStorage, 'layered-config-user');
        if (userData) {
          this.setLayerData(ConfigLayer.USER, userData, 'localStorage');
        }
      }

      // 加载会话配置
      if (hasSessionStorage) {
        const data = this.readPersistedLayerData(sessionStorage, 'layered-config-session');
        if (data) {
          this.setLayerData(ConfigLayer.SESSION, data, 'sessionStorage');
        }
      }


      // 尝试从云端加载配置 (如果已登录)
      this.syncWithCloud();

    } catch (error) {
      safeLog.error('LayeredConfigManager: Failed to load persisted configs:', redactSensitiveLogValue(error));
      this.configLogger.error('加载持久化配置失败', { error });
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
        } catch (error) {
          this.configLogger.warn('忽略无效云端配置层', { key, error });
        }
      });
    } catch (e) {
      safeLog.error('LayeredConfigManager: Cloud sync failed', redactSensitiveLogValue(e));
    }
  }

  // ... (lines 318-668 omitted)



  /**
   * 设置配置层数据
   */
  private setLayerData(layer: ConfigLayer, data: Record<string, any>, source: string): void {
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
    this.schemas.set(schema.key, schema);
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
  public getConfig<T = any>(key: string, fallback?: T): T {
    return this.get(key, fallback);
  }

  /**
   * 设置配置值 (别名方法，兼容旧接口)
   */
  public setConfig<T = any>(
    key: string,
    value: T,
    layer: ConfigLayer = ConfigLayer.USER
  ): void {
    this.set(key, value, layer);
  }

  /**
   * 获取配置值
   */
  public get<T = any>(key: string, fallback?: T): T {
    // 检查缓存
    const cacheKey = `${key}:${this.cacheVersion}`;
    if (this.effectiveConfigCache.has(cacheKey)) {
      return this.effectiveConfigCache.get(cacheKey) as T;
    }

    // 按优先级合并配置
    let effectiveValue: T | undefined;
    const sortedLayers = Array.from(this.layers.entries())
      .sort(([, a], [, b]) => CONFIG_PRIORITY[a.layer] - CONFIG_PRIORITY[b.layer]);

    for (const [, layerData] of sortedLayers) {
      if (layerData.data.has(key)) {
        effectiveValue = layerData.data.get(key);
      }
    }

    // 使用默认值
    if (effectiveValue === undefined) {
      const schema = this.schemas.get(key);
      effectiveValue = schema?.defaultValue ?? fallback;
    }

    // 验证配置值
    if (effectiveValue !== undefined) {
      const validatedValue = this.validateAndSanitize(key, effectiveValue);
      if (validatedValue !== undefined) {
        effectiveValue = validatedValue;
      }
    }

    // 缓存结果
    this.effectiveConfigCache.set(cacheKey, effectiveValue);

    return effectiveValue as T;
  }

  /**
   * 设置配置值
   */
  public set<T = any>(
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
    configs: Record<string, any>,
    layer: ConfigLayer = ConfigLayer.USER
  ): void {
    const layerData = this.getLayerDataOrThrow(layer);
    if (!layerData) return;
    const normalizedConfigs = this.normalizeConfigRecord(configs, { requireKnown: true, invalidValueMode: 'throw' });
    const changes: Array<{
      key: string;
      oldValue: any;
      newValue: any;
      effectiveValue: any;
    }> = [];

    // 收集所有变更
    Object.entries(normalizedConfigs).forEach(([key, value]) => {
      const oldValue = this.get(key);
      layerData.data.set(key, value);
      changes.push({
        key,
        oldValue,
        newValue: value,
        effectiveValue: value
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
    changes.forEach(({ key, oldValue, newValue, effectiveValue }) => {
      this.notifyListeners(key, oldValue, newValue, layer, effectiveValue);
    });
  }

  /**
   * 获取配置层的所有配置
   */
  public getLayer(layer: ConfigLayer): Record<string, any> {
    const layerData = this.layers.get(layer);
    if (!layerData) return {};

    const result: Record<string, any> = {};
    layerData.data.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * 获取有效配置（合并所有层）
   */
  public getEffectiveConfig(): Record<string, any> {
    const result: Record<string, any> = {};

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
  public addListener<T = any>(key: string, listener: LayeredConfigListener<T>): void {
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
  public removeListener<T = any>(key: string, listener: LayeredConfigListener<T>): void {
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
    if (!schema?.validator) return value;

    try {
      // 验证
      const validationResult = schema.validator.validate(value);
      if (validationResult !== true) {
        this.configLogger.warn(`配置验证失败 ${key}:`, { validationResult });
        return undefined;
      }

      // 清理
      if (schema.validator.sanitize) {
        return schema.validator.sanitize(value);
      }

      return value;
    } catch (error) {
      this.configLogger.error(`配置验证异常 ${key}:`, { error });
      return undefined;
    }
  }

  private readPersistedLayerData(storage: Storage, key: string): Record<string, any> | null {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      if (raw.length > MAX_PERSISTED_LAYER_CONFIG_CHARS) {
        storage.removeItem(key);
        this.configLogger.warn('移除过大的持久化配置层', { key });
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!isPlainConfigObject(parsed)) {
        storage.removeItem(key);
        return null;
      }

      return parsed;
    } catch (error) {
      try {
        storage.removeItem(key);
      } catch {
        void 0;
      }
      logUiStorageReadFailure('LayeredConfigManager.readPersistedLayerData', key, error);
      this.configLogger.warn('移除损坏的持久化配置层', { key, error });
      return null;
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
  ): Record<string, any> {
    if (!isPlainConfigObject(configs)) {
      throw new Error('配置必须是对象');
    }

    const normalized: Record<string, any> = {};
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

      const data: Record<string, any> = {};
      layerData.data.forEach((value, key) => {
        data[key] = value;
      });

      const hasLocalStorage = typeof localStorage !== 'undefined';
      const hasSessionStorage = typeof sessionStorage !== 'undefined';

      switch (layer) {
        case ConfigLayer.GLOBAL:
        case ConfigLayer.USER:
          if (hasLocalStorage) {
            storageKey = `layered-config-${layer}`;
            localStorage.setItem(storageKey, JSON.stringify(data));

            // Async sync to cloud via adapter
            if (this.cloudAdapter) {
              this.cloudAdapter.saveConfig(storageKey, data).catch(err => {
                safeLog.error('Cloud save failed for layer', layer, redactSensitiveLogValue(err));
              });
            }
          }
          break;
        case ConfigLayer.SESSION:
          if (hasSessionStorage) {
            storageKey = `layered-config-${layer}`;
            sessionStorage.setItem(storageKey, JSON.stringify(data));
          }
          break;
      }
    } catch (error) {
      if (storageKey) {
        logUiStorageWriteFailure('LayeredConfigManager.persistLayer', storageKey, error);
      }
      this.configLogger.error(`持久化配置层失败 ${layer}:`, { error });
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
    const event: LayeredConfigChangeEvent<T> = {
      key,
      oldValue,
      newValue,
      layer,
      effectiveValue,
      timestamp: Date.now()
    };

    // 通知特定键的监听器
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          this.configLogger.error(`配置监听器异常 ${key}:`, { error });
        }
      });
    }

    // 通知全局监听器
    this.globalListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        this.configLogger.error('全局配置监听器异常:', { error });
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
    const exportData: Record<string, any> = {};

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
        const normalizedByLayer = new Map<ConfigLayer, Record<string, any>>();
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
    } catch (error) {
      throw createError(
        '导入配置失败',
        ErrorType.CONFIG,
        ErrorSeverity.HIGH,
        { data: { error: error instanceof Error ? error.message : String(error) } }
      );
    }
  }

  /**
   * 获取配置统计信息
   */
  public getStats(): Record<string, any> {
    const stats: Record<string, any> = {
      layers: {},
      schemas: this.schemas.size,
      listeners: this.listeners.size,
      globalListeners: this.globalListeners.size,
      cacheSize: this.effectiveConfigCache.size,
      cacheVersion: this.cacheVersion
    };

    this.layers.forEach((layerData, layer) => {
      stats.layers[layer] = {
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
export const getLayeredConfig = <T = any>(key: string, fallback?: T): T => {
  return layeredConfigManager.get(key, fallback);
};

export const setLayeredConfig = <T = any>(
  key: string,
  value: T,
  layer: ConfigLayer = ConfigLayer.USER
): void => {
  layeredConfigManager.set(key, value, layer);
};

export const onLayeredConfigChange = <T = any>(
  key: string,
  listener: LayeredConfigListener<T>
): void => {
  layeredConfigManager.addListener(key, listener);
};
