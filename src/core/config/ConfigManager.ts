/**
 * 统一配置管理系统
 */

import { DiagramConfig, SpacingConfig, ThemeColor } from '../types/common';
import { logger } from '../utils/Logger';
import { ErrorType, ErrorSeverity, createError } from '../utils/ErrorHandler';

// 配置来源枚举
export enum ConfigSource {
  DEFAULT = 'default',
  LOCAL_STORAGE = 'localStorage',
  SESSION_STORAGE = 'sessionStorage',
  REMOTE = 'remote',
  ENVIRONMENT = 'environment',
  USER_OVERRIDE = 'userOverride'
}

// 配置变更事件
export interface ConfigChangeEvent<T = any> {
  key: string;
  oldValue: T;
  newValue: T;
  source: ConfigSource;
  timestamp: number;
}

// 配置监听器
export type ConfigListener<T = any> = (event: ConfigChangeEvent<T>) => void;

// 配置验证器
export type ConfigValidator<T = any> = (value: T) => boolean | string;

// 配置项定义
export interface ConfigDefinition<T = any> {
  /** 配置键名 */
  key: string;
  /** 默认值 */
  defaultValue: T;
  /** 描述 */
  description?: string;
  /** 验证器 */
  validator?: ConfigValidator<T>;
  /** 是否持久化 */
  persistent?: boolean;
  /** 存储键名（用于持久化） */
  storageKey?: string;
  /** 是否敏感信息 */
  sensitive?: boolean;
  /** 配置分组 */
  group?: string;
}

// 预定义配置
export const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
  // 主题配置
  'theme.mode': {
    key: 'theme.mode',
    defaultValue: 'light',
    description: '主题模式',
    validator: (value: string) => ['light', 'dark', 'auto'].includes(value),
    persistent: true,
    group: 'theme'
  },
  'theme.primaryColor': {
    key: 'theme.primaryColor',
    defaultValue: '#1890ff',
    description: '主色调',
    validator: (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value),
    persistent: true,
    group: 'theme'
  },
  'theme.current': {
    key: 'theme.current',
    defaultValue: null,
    description: '当前激活的主题对象',
    persistent: false, // 通常在运行时动态设置，无需持久化
    group: 'theme'
  },
  // 当前主题 ID（持久化选择）
  'theme.currentId': {
    key: 'theme.currentId',
    defaultValue: '',
    description: '当前选择的主题 ID',
    validator: (value: string) => typeof value === 'string',
    persistent: true,
    group: 'theme'
  },
  // 自定义主题集合（持久化）
  'theme.customThemes': {
    key: 'theme.customThemes',
    defaultValue: [],
    description: '用户自定义主题列表',
    validator: (value: any) => Array.isArray(value),
    persistent: true,
    group: 'theme'
  },
  // 主题预设集合（持久化）
  'theme.presets': {
    key: 'theme.presets',
    defaultValue: {},
    description: '主题预设集合',
    validator: (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value),
    persistent: true,
    group: 'theme'
  },
  // 域主题增强开关（持久化）
  'theme.domainAugmentationEnabled': {
    key: 'theme.domainAugmentationEnabled',
    defaultValue: false,
    description: '启用域主题增强（域颜色与样式联动）',
    validator: (value: boolean) => typeof value === 'boolean',
    persistent: true,
    group: 'theme'
  },

  // 布局配置
  'layout.spacing.node': {
    key: 'layout.spacing.node',
    defaultValue: 100,
    description: '节点间距',
    validator: (value: number) => value > 0 && value <= 500,
    persistent: true,
    group: 'layout'
  },
  'layout.spacing.level': {
    key: 'layout.spacing.level',
    defaultValue: 150,
    description: '层级间距',
    validator: (value: number) => value > 0 && value <= 500,
    persistent: true,
    group: 'layout'
  },
  'layout.spacing.domain': {
    key: 'layout.spacing.domain',
    defaultValue: 200,
    description: '域间距',
    validator: (value: number) => value > 0 && value <= 500,
    persistent: true,
    group: 'layout'
  },
  'layout.containmentPolicy': {
    key: 'layout.containmentPolicy',
    defaultValue: 'elastic',
    description: '域包含策略 (strict, soft, elastic)',
    validator: (value: string) => ['strict', 'soft', 'elastic'].includes(value),
    persistent: true,
    group: 'layout'
  },
  'layout.rankMode': {
    key: 'layout.rankMode',
    defaultValue: 'elk',
    description: '层级排序模式 (elk, dagre_like)',
    validator: (value: string) => ['elk', 'dagre_like'].includes(value),
    persistent: true,
    group: 'layout'
  },

  // 性能配置
  'performance.enableVirtualization': {
    key: 'performance.enableVirtualization',
    defaultValue: true,
    description: '启用虚拟化',
    persistent: true,
    group: 'performance'
  },
  'performance.maxNodes': {
    key: 'performance.maxNodes',
    defaultValue: 1000,
    description: '最大节点数',
    validator: (value: number) => value > 0 && value <= 10000,
    persistent: true,
    group: 'performance'
  },

  // 导出配置
  'export.defaultFormat': {
    key: 'export.defaultFormat',
    defaultValue: 'png',
    description: '默认导出格式',
    validator: (value: string) => ['png', 'jpg', 'svg', 'pdf'].includes(value),
    persistent: true,
    group: 'export'
  },
  'export.quality': {
    key: 'export.quality',
    defaultValue: 1.0,
    description: '导出质量',
    validator: (value: number) => value > 0 && value <= 3,
    persistent: true,
    group: 'export'
  },

  // 开发配置
  'dev.enableDebugMode': {
    key: 'dev.enableDebugMode',
    defaultValue: false,
    description: '启用调试模式',
    persistent: false,
    group: 'development'
  },
  'dev.showPerformanceMetrics': {
    key: 'dev.showPerformanceMetrics',
    defaultValue: false,
    description: '显示性能指标',
    persistent: false,
    group: 'development'
  }
};

/**
 * 配置管理器类
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private configs = new Map<string, any>();
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
      this.definitions.set(definition.key, definition);
      this.configs.set(definition.key, definition.defaultValue);
    });
  }

  /**
   * 加载持久化配置
   */
  private loadPersistedConfigs(): void {
    this.definitions.forEach((definition, key) => {
      if (definition.persistent) {
        try {
          const storageKey = definition.storageKey || key;
          const stored = localStorage.getItem(`config_${storageKey}`);
          
          if (stored !== null) {
            const value = JSON.parse(stored);
            if (this.validateConfig(key, value)) {
              this.configs.set(key, value);
              this.configLogger.debug(`加载持久化配置: ${key}`, { value });
            }
          }
        } catch (error) {
          this.configLogger.warn(`加载配置失败: ${key}`, { error });
        }
      }
    });
  }

  /**
   * 验证配置值
   */
  private validateConfig(key: string, value: any): boolean {
    const definition = this.definitions.get(key);
    if (!definition) return false;

    if (definition.validator) {
      const result = definition.validator(value);
      if (typeof result === 'string') {
        this.configLogger.warn(`配置验证失败: ${key}`, { error: result, value });
        return false;
      }
      return result;
    }

    return true;
  }

  /**
   * 持久化配置
   */
  private persistConfig(key: string, value: any): void {
    const definition = this.definitions.get(key);
    if (!definition || !definition.persistent) return;

    try {
      const storageKey = definition.storageKey || key;
      localStorage.setItem(`config_${storageKey}`, JSON.stringify(value));
      this.configLogger.debug(`持久化配置: ${key}`, { value });
    } catch (error) {
      this.configLogger.error(`持久化配置失败: ${key}`, { error, value });
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners<T>(key: string, oldValue: T, newValue: T, source: ConfigSource): void {
    const listeners = this.listeners.get(key);
    if (!listeners) return;

    const event: ConfigChangeEvent<T> = {
      key,
      oldValue,
      newValue,
      source,
      timestamp: Date.now()
    };

    listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        this.configLogger.error(`配置监听器执行失败: ${key}`, { error });
      }
    });
  }

  /**
   * 获取配置值
   */
  public get<T = any>(key: string, fallback?: T): T {
    if (this.configs.has(key)) {
      return this.configs.get(key) as T;
    }

    const definition = this.definitions.get(key);
    if (definition) {
      return definition.defaultValue as T;
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
  public set<T = any>(key: string, value: T, source: ConfigSource = ConfigSource.USER_OVERRIDE): void {
    const oldValue = this.configs.get(key);

    // 验证配置
    if (!this.validateConfig(key, value)) {
      throw createError(
      `配置值验证失败: ${key}`,
      ErrorType.VALIDATION,
      ErrorSeverity.MEDIUM,
      { 
        component: 'ConfigManager',
        action: 'set',
        data: { key, value }
      }
    );
    }

    // 设置配置
    this.configs.set(key, value);

    // 持久化
    this.persistConfig(key, value);

    // 通知监听器
    this.notifyListeners(key, oldValue, value, source);

    this.configLogger.info(`配置已更新: ${key}`, { oldValue, newValue: value, source });
  }

  /**
   * 批量设置配置
   */
  public setMultiple(configs: Record<string, any>, source: ConfigSource = ConfigSource.USER_OVERRIDE): void {
    const changes: Array<{ key: string; oldValue: any; newValue: any }> = [];

    // 验证所有配置
    for (const [key, value] of Object.entries(configs)) {
      if (!this.validateConfig(key, value)) {
        throw createError(
          `批量配置验证失败: ${key}`,
          ErrorType.VALIDATION,
          ErrorSeverity.MEDIUM,
          { 
            component: 'ConfigManager',
            action: 'setMultiple',
            data: { key, value }
          }
        );
      }
    }

    // 应用所有配置
    for (const [key, value] of Object.entries(configs)) {
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
  public addListener<T = any>(key: string, listener: ConfigListener<T>): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
  }

  /**
   * 移除配置监听器
   */
  public removeListener<T = any>(key: string, listener: ConfigListener<T>): void {
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
    this.definitions.set(definition.key, definition);
    
    // 如果没有设置过该配置，使用默认值
    if (!this.configs.has(definition.key)) {
      this.configs.set(definition.key, definition.defaultValue);
    }

    this.configLogger.debug(`注册配置定义: ${definition.key}`, { definition });
  }

  /**
   * 获取配置分组
   */
  public getGroup(group: string): Record<string, any> {
    const result: Record<string, any> = {};
    
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
  public getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    
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
    const config: Record<string, any> = {};

    this.definitions.forEach((definition, key) => {
      if (definition.sensitive) return;

      const currentValue = this.get(key);
      const isDefault = currentValue === definition.defaultValue;

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
      const config = JSON.parse(configJson);
      this.setMultiple(config, ConfigSource.USER_OVERRIDE);
      this.configLogger.info('配置导入成功', { keys: Object.keys(config) });
    } catch (error) {
      throw createError(
        '配置导入失败',
        ErrorType.VALIDATION,
        ErrorSeverity.HIGH,
        { 
          component: 'ConfigManager',
          action: 'importConfig',
          data: { error }
        }
      );
    }
  }

  /**
   * 获取配置统计
   */
  public getStats(): Record<string, any> {
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
      if (currentValue !== definition.defaultValue) {
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
      const snapshot = JSON.parse(snapshotJson);
      
      if (!snapshot.configs) {
        throw new Error('无效的快照格式');
      }

      this.setMultiple(snapshot.configs, ConfigSource.USER_OVERRIDE);
      this.configLogger.info('配置快照恢复成功', { 
        timestamp: snapshot.timestamp,
        keys: Object.keys(snapshot.configs)
      });
    } catch (error) {
      throw createError(
        '配置快照恢复失败',
        ErrorType.CONFIG,
        ErrorSeverity.HIGH,
        { 
          component: 'ConfigManager',
          action: 'restoreSnapshot',
          data: { error }
        }
      );
    }
  }
}

// 导出默认实例
export const configManager = ConfigManager.getInstance();

// 便捷函数
export const getConfig = <T = any>(key: string, fallback?: T): T => {
  return configManager.get(key, fallback);
};

export const setConfig = <T = any>(key: string, value: T): void => {
  configManager.set(key, value);
};

export const onConfigChange = <T = any>(key: string, listener: ConfigListener<T>): void => {
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
