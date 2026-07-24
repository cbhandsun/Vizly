/** 统一配置值的解析、清洗与存储边界。 */

export type ConfigValue = null | boolean | number | string | ConfigValue[] | { [key: string]: ConfigValue };

export const isPlainConfigObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );

export const MAX_STORED_CONFIG_CHARS = 256 * 1024;
export const MAX_IMPORT_CONFIG_CHARS = 1024 * 1024;
const MAX_CONFIG_VALUE_DEPTH = 8;
const MAX_CONFIG_ARRAY_ITEMS = 5000;
const MAX_CONFIG_OBJECT_KEYS = 1000;
const MAX_CONFIG_STRING_CHARS = 64 * 1024;
const DANGEROUS_CONFIG_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CONFIG_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const getConfigLocalStorage = (): Storage | null => {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export const parseBoundedConfigJson = (json: string, maxChars: number, label: string): unknown => {
  if (json.length > maxChars) {
    throw new Error(`${label}超过大小限制`);
  }

  return JSON.parse(json);
};

export const sanitizeConfigValue = (value: unknown, depth = 0): ConfigValue => {
  if (depth > MAX_CONFIG_VALUE_DEPTH) {
    throw new Error('配置对象嵌套过深');
  }

  if (value === null || typeof value === 'boolean') {
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

export const cloneConfigValue = <T>(value: T): T => sanitizeConfigValue(value) as T;

export const createNestedConfigPatch = (
  pathSegments: readonly string[],
  value: unknown,
): ConfigValue => {
  if (pathSegments.length > MAX_CONFIG_VALUE_DEPTH) {
    throw new Error('配置路径嵌套过深');
  }

  let patch: ConfigValue = sanitizeConfigValue(value);
  for (const segment of [...pathSegments].reverse()) {
    if (!CONFIG_PATH_SEGMENT_PATTERN.test(segment) || DANGEROUS_CONFIG_KEYS.has(segment)) {
      throw new Error('配置路径包含非法字段');
    }
    patch = { [segment]: patch };
  }
  return patch;
};

export const configValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => configValuesEqual(value, right[index]));
  }
  if (!isPlainConfigObject(left) || !isPlainConfigObject(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(key => Object.hasOwn(right, key) && configValuesEqual(left[key], right[key]));
};
