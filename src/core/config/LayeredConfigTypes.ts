/** 分层配置的数据模型与层级定义。 */

import { cloneConfigValue } from './ConfigValueBoundary';

export interface CloudStorageAdapter {
  syncWithCloud(onConfigLoaded: (key: string, value: Record<string, unknown>) => void): Promise<void>;
  saveConfig(key: string, data: Record<string, unknown>): Promise<void>;
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

export const isConfigLayer = (value: unknown): value is ConfigLayer =>
  typeof value === 'string' && Object.values(ConfigLayer).includes(value as ConfigLayer);

export const isLayeredConfigValueType = (
  value: unknown,
  type: ConfigSchema['type']
): boolean => {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return Boolean(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
      );
  }
};

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

export const createLayeredConfigChangeEvent = <T>(
  key: string,
  oldValue: T,
  newValue: T,
  layer: ConfigLayer,
  effectiveValue: T
): LayeredConfigChangeEvent<T> => ({
  key,
  oldValue: oldValue === undefined ? oldValue : cloneConfigValue(oldValue),
  newValue: newValue === undefined ? newValue : cloneConfigValue(newValue),
  layer,
  effectiveValue: effectiveValue === undefined ? effectiveValue : cloneConfigValue(effectiveValue),
  timestamp: Date.now()
});

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
