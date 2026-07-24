export type ConfigValue = string | number | boolean;
export type ConfigValues = Record<string, ConfigValue>;
export type ConfigTab = 'basic' | 'nodes' | 'containers' | 'spacing' | 'edges' | 'layout' | 'performance';

export interface ConfigItem {
  key: string;
  value: ConfigValue;
  type: 'number' | 'string' | 'boolean' | 'select';
  label?: string;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  group?: string;
}

export const INSTANT_CONFIG_KEYS = new Set<string>([
  'diagram.layout.strategy',
  'diagram.layout.ELK_ALGORITHM',
  'diagram.layout.ELK_DIRECTION',
  'diagram.layout.direction',
]);

const clampNumber = (value: number, min?: number, max?: number): number => {
  let next = value;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
  return next;
};

export const coerceTextConfigValue = (value: unknown): string => {
  const text = String(value ?? '').trim().slice(0, 200);
  return /[{};]|url\s*\(|expression\s*\(|javascript:/i.test(text) ? '' : text;
};

export const coerceConfigValue = (item: ConfigItem, rawValue: unknown): ConfigValue => {
  switch (item.type) {
    case 'number': {
      const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      const fallback = typeof item.value === 'number' && Number.isFinite(item.value)
        ? item.value
        : 0;
      return clampNumber(
        Number.isFinite(numericValue) ? numericValue : fallback,
        item.min,
        item.max,
      );
    }
    case 'boolean':
      return Boolean(rawValue);
    case 'select': {
      const selected = String(rawValue ?? '');
      return item.options?.includes(selected) ? selected : String(item.value);
    }
    case 'string':
    default:
      return coerceTextConfigValue(rawValue);
  }
};
