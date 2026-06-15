import type { Theme, ThemeAnimation, ThemeBorderRadius, ThemeColor, ThemePalette, ThemePreset, ThemeShadow, ThemeSpacing, ThemeTypography } from './types/ThemeTypes';

export const THEME_IMPORT_MAX_CHARS = 1024 * 1024;
export const THEME_IMPORT_MAX_PRESETS = 50;
const MAX_TEXT_LENGTH = 240;
const MAX_ID_LENGTH = 80;
const MAX_TAGS = 16;
const MAX_DOMAIN_COLORS = 64;

const REQUIRED_COLOR_KEYS: Array<keyof ThemeColor> = [
  'main',
  'light',
  'dark',
  'contrast',
  'border',
  'background',
  'text',
  'shadow',
];

const PALETTE_KEYS: Array<keyof ThemePalette> = [
  'primary',
  'secondary',
  'success',
  'warning',
  'error',
  'info',
  'neutral',
];

const EDGE_KEYS = ['default', 'primary', 'secondary', 'dashed'] as const;
const NODE_KEYS = ['default', 'selected', 'hover'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const coerceString = (value: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw new Error(`${field} is invalid`);
  return trimmed;
};

const coerceOptionalString = (value: unknown, maxLength = MAX_TEXT_LENGTH): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, maxLength);
};

const coerceFiniteNumber = (value: unknown, field: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} must be finite`);
  return Math.min(max, Math.max(min, value));
};

const isSafeCssColor = (value: string): boolean => {
  const text = value.trim();
  if (text.length > 80) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return true;
  if (/^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(text)) return true;
  if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(text)) return true;
  return ['transparent', 'currentColor', 'black', 'white'].includes(text);
};

const coerceCssColor = (value: unknown, field: string): string => {
  const color = coerceString(value, field, 80);
  if (!isSafeCssColor(color)) throw new Error(`${field} is not a safe CSS color`);
  return color;
};

const coerceThemeColor = (value: unknown, field: string): ThemeColor => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return REQUIRED_COLOR_KEYS.reduce((acc, key) => {
    acc[key] = coerceCssColor(value[key], `${field}.${key}`);
    return acc;
  }, {} as ThemeColor);
};

const coerceColorRecord = (value: unknown, field: string, maxEntries = MAX_DOMAIN_COLORS): Record<string, ThemeColor> => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const entries = Object.entries(value).slice(0, maxEntries);
  if (entries.length === 0) throw new Error(`${field} must not be empty`);
  return Object.fromEntries(entries.map(([key, color]) => [
    coerceString(key, `${field}.key`, MAX_ID_LENGTH),
    coerceThemeColor(color, `${field}.${key}`),
  ]));
};

const coercePalette = (value: unknown): ThemePalette => {
  if (!isRecord(value)) throw new Error('theme.palette must be an object');
  return PALETTE_KEYS.reduce((acc, key) => {
    acc[key] = coerceThemeColor(value[key], `theme.palette.${key}`);
    return acc;
  }, {} as ThemePalette);
};

const coerceTypography = (value: unknown): ThemeTypography => {
  if (!isRecord(value) || !isRecord(value.fontFamily) || !isRecord(value.fontSize) || !isRecord(value.fontWeight) || !isRecord(value.lineHeight)) {
    throw new Error('theme.typography is invalid');
  }
  const fontArray = (fontValue: unknown, field: string): string[] => {
    if (!Array.isArray(fontValue)) throw new Error(`${field} must be an array`);
    return fontValue.slice(0, 8).map(item => coerceString(item, field, 64));
  };
  return {
    fontFamily: {
      sans: fontArray(value.fontFamily.sans, 'theme.typography.fontFamily.sans'),
      mono: fontArray(value.fontFamily.mono, 'theme.typography.fontFamily.mono'),
    },
    fontSize: {
      xs: coerceFiniteNumber(value.fontSize.xs, 'theme.typography.fontSize.xs', 6, 64),
      sm: coerceFiniteNumber(value.fontSize.sm, 'theme.typography.fontSize.sm', 6, 64),
      md: coerceFiniteNumber(value.fontSize.md, 'theme.typography.fontSize.md', 6, 64),
      lg: coerceFiniteNumber(value.fontSize.lg, 'theme.typography.fontSize.lg', 6, 96),
      xl: coerceFiniteNumber(value.fontSize.xl, 'theme.typography.fontSize.xl', 6, 128),
      xxl: coerceFiniteNumber(value.fontSize.xxl, 'theme.typography.fontSize.xxl', 6, 160),
    },
    fontWeight: {
      light: coerceFiniteNumber(value.fontWeight.light, 'theme.typography.fontWeight.light', 100, 1000),
      normal: coerceFiniteNumber(value.fontWeight.normal, 'theme.typography.fontWeight.normal', 100, 1000),
      medium: coerceFiniteNumber(value.fontWeight.medium, 'theme.typography.fontWeight.medium', 100, 1000),
      semibold: coerceFiniteNumber(value.fontWeight.semibold, 'theme.typography.fontWeight.semibold', 100, 1000),
      bold: coerceFiniteNumber(value.fontWeight.bold, 'theme.typography.fontWeight.bold', 100, 1000),
    },
    lineHeight: {
      tight: coerceFiniteNumber(value.lineHeight.tight, 'theme.typography.lineHeight.tight', 0.8, 3),
      normal: coerceFiniteNumber(value.lineHeight.normal, 'theme.typography.lineHeight.normal', 0.8, 3),
      relaxed: coerceFiniteNumber(value.lineHeight.relaxed, 'theme.typography.lineHeight.relaxed', 0.8, 3),
    },
  };
};

const coerceNumberRecord = <T extends Record<string, number>>(value: unknown, keys: Array<keyof T>, field: string, min: number, max: number): T => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return keys.reduce((acc, key) => {
    acc[key] = coerceFiniteNumber(value[key as string], `${field}.${String(key)}`, min, max) as T[keyof T];
    return acc;
  }, {} as T);
};

const coerceShadow = (value: unknown): ThemeShadow => {
  if (!isRecord(value)) throw new Error('theme.shadow must be an object');
  const keys: Array<keyof ThemeShadow> = ['none', 'sm', 'md', 'lg', 'xl', 'inner'];
  return keys.reduce((acc, key) => {
    const shadow = coerceString(value[key], `theme.shadow.${key}`, 160);
    if (/url\s*\(|expression\s*\(|javascript:/i.test(shadow)) {
      throw new Error(`theme.shadow.${key} is invalid`);
    }
    acc[key] = shadow;
    return acc;
  }, {} as ThemeShadow);
};

const coerceAnimation = (value: unknown): ThemeAnimation => {
  if (!isRecord(value) || !isRecord(value.duration) || !isRecord(value.easing)) throw new Error('theme.animation is invalid');
  const easing = (item: unknown, field: string): string => {
    const text = coerceString(item, field, 32);
    if (!/^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(\s*-?\d?(?:\.\d+)?\s*,\s*-?\d?(?:\.\d+)?\s*,\s*-?\d?(?:\.\d+)?\s*,\s*-?\d?(?:\.\d+)?\s*\))$/.test(text)) {
      throw new Error(`${field} is invalid`);
    }
    return text;
  };
  return {
    duration: {
      fast: coerceFiniteNumber(value.duration.fast, 'theme.animation.duration.fast', 0, 5000),
      normal: coerceFiniteNumber(value.duration.normal, 'theme.animation.duration.normal', 0, 5000),
      slow: coerceFiniteNumber(value.duration.slow, 'theme.animation.duration.slow', 0, 5000),
    },
    easing: {
      linear: easing(value.easing.linear, 'theme.animation.easing.linear'),
      ease: easing(value.easing.ease, 'theme.animation.easing.ease'),
      easeIn: easing(value.easing.easeIn, 'theme.animation.easing.easeIn'),
      easeOut: easing(value.easing.easeOut, 'theme.animation.easing.easeOut'),
      easeInOut: easing(value.easing.easeInOut, 'theme.animation.easing.easeInOut'),
    },
  };
};

export const parseThemeImportJson = (content: string): unknown => {
  if (content.length > THEME_IMPORT_MAX_CHARS) {
    throw new Error(`Theme import JSON is too large. Limit is ${THEME_IMPORT_MAX_CHARS} characters.`);
  }
  return JSON.parse(content);
};

export const coerceThemeImport = (value: unknown, fallbackId?: string): Theme => {
  if (!isRecord(value)) throw new Error('theme must be an object');
  if (!isRecord(value.diagram) || !isRecord(value.diagram.canvas) || !isRecord(value.diagram.canvas.grid) || !isRecord(value.diagram.edges) || !isRecord(value.diagram.nodes)) {
    throw new Error('theme.diagram is invalid');
  }
  const id = fallbackId || coerceString(value.id, 'theme.id', MAX_ID_LENGTH);
  const mode = value.mode === 'dark' ? 'dark' : value.mode === 'light' ? 'light' : null;
  if (!mode) throw new Error('theme.mode is invalid');

  const edges = EDGE_KEYS.reduce((acc, key) => {
    acc[key] = coerceThemeColor(value.diagram.edges[key], `theme.diagram.edges.${key}`);
    return acc;
  }, {} as Theme['diagram']['edges']);

  const nodes = NODE_KEYS.reduce((acc, key) => {
    acc[key] = coerceThemeColor(value.diagram.nodes[key], `theme.diagram.nodes.${key}`);
    return acc;
  }, {} as Theme['diagram']['nodes']);

  return {
    id,
    name: coerceString(value.name, 'theme.name'),
    ...(coerceOptionalString(value.description) ? { description: coerceOptionalString(value.description) } : {}),
    mode,
    palette: coercePalette(value.palette),
    typography: coerceTypography(value.typography),
    spacing: coerceNumberRecord<ThemeSpacing>(value.spacing, ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'], 'theme.spacing', 0, 256),
    borderRadius: coerceNumberRecord<ThemeBorderRadius>(value.borderRadius, ['none', 'sm', 'md', 'lg', 'xl', 'full'], 'theme.borderRadius', 0, 9999),
    shadow: coerceShadow(value.shadow),
    animation: coerceAnimation(value.animation),
    diagram: {
      domains: coerceColorRecord(value.diagram.domains, 'theme.diagram.domains'),
      edges,
      canvas: {
        background: coerceCssColor(value.diagram.canvas.background, 'theme.diagram.canvas.background'),
        grid: {
          color: coerceCssColor(value.diagram.canvas.grid.color, 'theme.diagram.canvas.grid.color'),
          size: coerceFiniteNumber(value.diagram.canvas.grid.size, 'theme.diagram.canvas.grid.size', 1, 200),
          opacity: coerceFiniteNumber(value.diagram.canvas.grid.opacity, 'theme.diagram.canvas.grid.opacity', 0, 1),
        },
      },
      nodes,
    },
  };
};

export const coerceThemePresetImport = (value: unknown, fallbackId?: string, forcedCategory: ThemePreset['category'] = 'custom'): ThemePreset => {
  if (!isRecord(value)) throw new Error('preset must be an object');
  const id = fallbackId || coerceString(value.id, 'preset.id', MAX_ID_LENGTH);
  const tags = Array.isArray(value.tags)
    ? value.tags.slice(0, MAX_TAGS).filter(tag => typeof tag === 'string').map(tag => tag.trim().slice(0, 40)).filter(Boolean)
    : [];
  const theme = coerceThemeImport(value.theme, id);
  return {
    id,
    name: coerceString(value.name, 'preset.name'),
    description: coerceOptionalString(value.description) || '',
    category: forcedCategory,
    tags,
    ...(coerceOptionalString(value.createdAt, 64) ? { createdAt: coerceOptionalString(value.createdAt, 64) } : {}),
    theme: {
      ...theme,
      id,
    },
  };
};

export const coerceThemePackageImport = (value: unknown, forcedCategory: ThemePreset['category'] = 'community'): ThemePreset[] => {
  if (!isRecord(value) || !Array.isArray(value.presets)) throw new Error('theme package must contain presets');
  if (value.presets.length > THEME_IMPORT_MAX_PRESETS) throw new Error(`theme package can contain at most ${THEME_IMPORT_MAX_PRESETS} presets`);
  return value.presets.map(preset => coerceThemePresetImport(preset, undefined, forcedCategory));
};
