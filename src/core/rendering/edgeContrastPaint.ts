/** Paint-only WCAG non-text contrast decisions shared by canvas and exports. */
export const EDGE_NON_TEXT_MIN_CONTRAST = 3;
export const EDGE_CONTRAST_OUTLINE_WIDTH = 1;

const DEFAULT_CANVAS_BACKGROUND = '#ffffff';
const DARK_UNDERLAY = '#334155';
const LIGHT_UNDERLAY = '#f8fafc';
const DARKEST_UNDERLAY = '#000000';
const LIGHTEST_UNDERLAY = '#ffffff';
const MAX_COLOR_INPUT_LENGTH = 64;
const MIN_EDGE_STROKE_WIDTH = 0.5;
const MAX_EDGE_STROKE_WIDTH = 64;

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface EdgeContrastPaintInput {
  stroke: unknown;
  strokeWidth: unknown;
  canvasBackground: unknown;
  opacity?: unknown;
  ancestorOpacity?: unknown;
}

export type EdgeContrastPaintDecision = Readonly<
  | {
    kind: 'unresolved';
    semanticContrastRatio: null;
  }
  | {
    kind: 'sufficient';
    semanticContrastRatio: number;
    effectiveSemanticOpacity: number;
  }
  | {
    kind: 'underlay';
    semanticContrastRatio: number;
    effectiveSemanticOpacity: number;
    effectiveBoundaryOpacity: number;
    underlayColor: string;
    underlayContrastRatio: number;
    underlayStrokeWidth: number;
    underlayTone: 'dark' | 'light';
  }
>;

const clamp = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

const parseHexByte = (value: string): number | null => {
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseHexColor = (value: string): RgbaColor | null => {
  const hex = value.slice(1);
  if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/iu.test(hex)) return null;
  const expanded = hex.length <= 4
    ? [...hex].map(character => `${character}${character}`).join('')
    : hex;
  const r = parseHexByte(expanded.slice(0, 2));
  const g = parseHexByte(expanded.slice(2, 4));
  const b = parseHexByte(expanded.slice(4, 6));
  const alphaByte = expanded.length === 8 ? parseHexByte(expanded.slice(6, 8)) : 255;
  if (r === null || g === null || b === null || alphaByte === null) return null;
  return { r, g, b, a: alphaByte / 255 };
};

const parseRgbChannel = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/u.test(trimmed)) return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return trimmed.endsWith('%')
    ? clamp(parsed * 2.55, 0, 255)
    : clamp(parsed, 0, 255);
};

const parseAlpha = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/u.test(trimmed)) return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return trimmed.endsWith('%')
    ? clamp(parsed / 100, 0, 1)
    : clamp(parsed, 0, 1);
};

const parseRgbColor = (value: string): RgbaColor | null => {
  const match = value.match(/^rgba?\((.*)\)$/iu);
  if (!match) return null;
  const components = match[1].split(',');
  if (components.length !== 3 && components.length !== 4) return null;
  const r = parseRgbChannel(components[0]);
  const g = parseRgbChannel(components[1]);
  const b = parseRgbChannel(components[2]);
  const a = components.length === 4 ? parseAlpha(components[3]) : 1;
  if (r === null || g === null || b === null || a === null) return null;
  return { r, g, b, a };
};

const parseCssColor = (value: unknown): RgbaColor | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_COLOR_INPUT_LENGTH) return null;
  if (normalized === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (normalized === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (normalized === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (normalized.startsWith('#')) return parseHexColor(normalized);
  return parseRgbColor(normalized);
};

const composite = (foreground: RgbaColor, background: RgbaColor): RgbaColor => ({
  r: foreground.r * foreground.a + background.r * (1 - foreground.a),
  g: foreground.g * foreground.a + background.g * (1 - foreground.a),
  b: foreground.b * foreground.a + background.b * (1 - foreground.a),
  a: 1,
});

const channelLuminance = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const luminance = (color: RgbaColor): number => (
  0.2126 * channelLuminance(color.r)
  + 0.7152 * channelLuminance(color.g)
  + 0.0722 * channelLuminance(color.b)
);

const contrastRatio = (first: RgbaColor, second: RgbaColor): number => {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const readStrokeWidth = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(value, MIN_EDGE_STROKE_WIDTH, MAX_EDGE_STROKE_WIDTH);
  }
  if (typeof value !== 'string' || !/^\s*(?:\d+(?:\.\d+)?|\.\d+)(?:px)?\s*$/iu.test(value)) {
    return 1.5;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed)
    ? clamp(parsed, MIN_EDGE_STROKE_WIDTH, MAX_EDGE_STROKE_WIDTH)
    : 1.5;
};

const readOpacity = (value: unknown, defaultValue: number): number | null => {
  if (value === undefined) return defaultValue;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? clamp(value, 0, 1) : null;
  }
  if (typeof value !== 'string' || !/^\s*(?:\d+(?:\.\d+)?|\.\d+)\s*$/u.test(value)) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : null;
};

const withOpacity = (color: RgbaColor, opacity: number): RgbaColor => ({
  ...color,
  a: color.a * opacity,
});

export const resolveEdgeContrastPaint = ({
  stroke,
  strokeWidth,
  canvasBackground,
  opacity,
  ancestorOpacity,
}: EdgeContrastPaintInput): EdgeContrastPaintDecision => {
  const semanticColor = parseCssColor(stroke);
  if (!semanticColor) return { kind: 'unresolved', semanticContrastRatio: null };
  const localOpacity = readOpacity(opacity, 1);
  const inheritedOpacity = readOpacity(ancestorOpacity, 1);
  if (localOpacity === null || inheritedOpacity === null || localOpacity === 0 || inheritedOpacity === 0) {
    return { kind: 'unresolved', semanticContrastRatio: null };
  }

  const white = parseHexColor(DEFAULT_CANVAS_BACKGROUND);
  if (!white) return { kind: 'unresolved', semanticContrastRatio: null };
  const parsedBackground = parseCssColor(canvasBackground);
  if (!parsedBackground) return { kind: 'unresolved', semanticContrastRatio: null };
  const opaqueBackground = composite(parsedBackground, white);
  const effectiveSemanticOpacity = semanticColor.a * localOpacity * inheritedOpacity;
  const opaqueSemanticColor = composite(
    { ...semanticColor, a: effectiveSemanticOpacity },
    opaqueBackground,
  );
  const semanticContrastRatio = contrastRatio(opaqueSemanticColor, opaqueBackground);
  if (semanticContrastRatio >= EDGE_NON_TEXT_MIN_CONTRAST) {
    return { kind: 'sufficient', semanticContrastRatio, effectiveSemanticOpacity };
  }

  const evaluateUnderlays = (values: ReadonlyArray<{
    color: string;
    tone: 'dark' | 'light';
  }>) => values.flatMap(candidate => {
    const parsed = parseHexColor(candidate.color);
    if (!parsed) return [];
    const composited = composite(withOpacity(parsed, inheritedOpacity), opaqueBackground);
    return [{ ...candidate, contrast: contrastRatio(composited, opaqueBackground) }];
  });
  const preferredUnderlay = evaluateUnderlays([
    { color: DARK_UNDERLAY, tone: 'dark' },
    { color: LIGHT_UNDERLAY, tone: 'light' },
  ]).sort((first, second) => second.contrast - first.contrast)[0];
  const bestUnderlay = preferredUnderlay?.contrast >= EDGE_NON_TEXT_MIN_CONTRAST
    ? preferredUnderlay
    : evaluateUnderlays([
      { color: DARKEST_UNDERLAY, tone: 'dark' },
      { color: LIGHTEST_UNDERLAY, tone: 'light' },
    ]).sort((first, second) => second.contrast - first.contrast)[0];
  if (!bestUnderlay || bestUnderlay.contrast < EDGE_NON_TEXT_MIN_CONTRAST) {
    return { kind: 'unresolved', semanticContrastRatio: null };
  }

  return {
    kind: 'underlay',
    semanticContrastRatio,
    effectiveSemanticOpacity,
    effectiveBoundaryOpacity: inheritedOpacity,
    underlayColor: bestUnderlay.color,
    underlayContrastRatio: bestUnderlay.contrast,
    underlayStrokeWidth: readStrokeWidth(strokeWidth) + EDGE_CONTRAST_OUTLINE_WIDTH * 2,
    underlayTone: bestUnderlay.tone,
  };
};
