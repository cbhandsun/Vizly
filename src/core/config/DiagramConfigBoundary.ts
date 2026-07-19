import type { DiagramConfig } from './DiagramConfigTypes';
import { defaultConfig } from './DiagramConfigDefaults';

export const DIAGRAM_CONFIG_STORAGE_KEY = 'architecture-diagram-config';
export const MAX_STORED_DIAGRAM_CONFIG_CHARS = 512 * 1024;
export const MAX_IMPORTED_DIAGRAM_CONFIG_CHARS = 1024 * 1024;
const MAX_CONFIG_DEPTH = 10;
const MAX_CONFIG_ARRAY_ITEMS = 2000;
const MAX_CONFIG_OBJECT_KEYS = 1000;
const MAX_CONFIG_STRING_CHARS = 64 * 1024;
export const DANGEROUS_CONFIG_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type ConfigRecord = Record<string, unknown>;
type ConfigValue = undefined | null | boolean | number | string | ConfigValue[] | { [key: string]: ConfigValue };

export const isPlainConfigObject = (value: unknown): value is ConfigRecord =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );

export const parseBoundedConfigJson = (json: string, maxChars: number, label: string): unknown => {
  if (json.length > maxChars) {
    throw new Error(`${label}超过大小限制`);
  }

  return JSON.parse(json);
};

const sanitizeConfigValue = (value: unknown, depth = 0): ConfigValue => {
  if (depth > MAX_CONFIG_DEPTH) {
    throw new Error('配置对象嵌套过深');
  }

  if (value === undefined || value === null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('配置数字必须是有限值');
    }
    return value;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_CONFIG_STRING_CHARS) {
      throw new Error('配置字符串超过大小限制');
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_CONFIG_ARRAY_ITEMS) {
      throw new Error('配置数组超过长度限制');
    }
    return value.map(item => sanitizeConfigValue(item, depth + 1));
  }

  if (!isPlainConfigObject(value)) {
    throw new Error('配置值必须是可序列化对象');
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_CONFIG_OBJECT_KEYS) {
    throw new Error('配置对象键数量超过限制');
  }

  const sanitized: Record<string, ConfigValue> = {};
  entries.forEach(([key, nestedValue]) => {
    if (DANGEROUS_CONFIG_KEYS.has(key)) {
      return;
    }
    sanitized[key] = sanitizeConfigValue(nestedValue, depth + 1);
  });

  return sanitized;
};

const validateKnownConfigTypes = (
  patch: ConfigRecord,
  template: ConfigRecord,
  path = 'config'
): void => {
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || !(key in template)) {
      return;
    }

    const expected = template[key];
    const currentPath = `${path}.${key}`;
    if (isPlainConfigObject(expected)) {
      if (!isPlainConfigObject(value)) {
        throw new Error(`${currentPath}必须是对象`);
      }
      validateKnownConfigTypes(value, expected, currentPath);
      return;
    }

    if (Array.isArray(expected)) {
      if (!Array.isArray(value)) {
        throw new Error(`${currentPath}必须是数组`);
      }
      return;
    }

    if (expected !== null && typeof value !== typeof expected) {
      throw new Error(`${currentPath}类型无效`);
    }
  });
};

const OPTIONAL_OBJECT_PATHS = [
  ['edge', 'preAssignedPorts'],
  ['edge', 'nodePortConstraints']
] as const;

const validateOptionalObjectPaths = (patch: ConfigRecord): void => {
  OPTIONAL_OBJECT_PATHS.forEach(([sectionKey, fieldKey]) => {
    const section = patch[sectionKey];
    if (!isPlainConfigObject(section)) {
      return;
    }
    const value = section[fieldKey];
    if (value !== undefined && !isPlainConfigObject(value)) {
      throw new Error(`config.${sectionKey}.${fieldKey}必须是对象`);
    }
  });
};

export const sanitizeConfigPatch = (value: unknown): Partial<DiagramConfig> => {
  if (!isPlainConfigObject(value)) {
    throw new Error('配置必须是对象');
  }

  const sanitized = sanitizeConfigValue(value);
  if (!isPlainConfigObject(sanitized)) {
    throw new Error('配置必须是对象');
  }
  validateKnownConfigTypes(
    sanitized,
    defaultConfig as unknown as ConfigRecord
  );
  validateOptionalObjectPaths(sanitized);
  return sanitized as Partial<DiagramConfig>;
};

const mergeConfigObjects = (target: ConfigRecord, source: ConfigRecord): ConfigRecord => {
  const result: ConfigRecord = {};

  Object.entries(target).forEach(([key, value]) => {
    if (!DANGEROUS_CONFIG_KEYS.has(key)) {
      result[key] = isPlainConfigObject(value)
        ? mergeConfigObjects(value, {})
        : Array.isArray(value)
          ? value.map(item => sanitizeConfigValue(item))
          : value;
    }
  });

  Object.entries(source).forEach(([key, sourceValue]) => {
    if (DANGEROUS_CONFIG_KEYS.has(key) || sourceValue === undefined) {
      return;
    }
    const targetValue = result[key];
    result[key] = isPlainConfigObject(sourceValue)
      ? mergeConfigObjects(isPlainConfigObject(targetValue) ? targetValue : {}, sourceValue)
      : Array.isArray(sourceValue)
        ? sourceValue.map(item => sanitizeConfigValue(item))
        : sourceValue;
  });

  return result;
};

export const mergeDiagramConfig = (
  target: DiagramConfig,
  source: Partial<DiagramConfig>
): DiagramConfig => mergeConfigObjects(
  target as unknown as ConfigRecord,
  source as unknown as ConfigRecord
) as unknown as DiagramConfig;

export const cloneDiagramConfig = (config: DiagramConfig): DiagramConfig =>
  mergeDiagramConfig(defaultConfig, config);
