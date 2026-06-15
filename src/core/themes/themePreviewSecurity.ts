const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_RE = /^rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const HSL_COLOR_RE = /^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const NAMED_COLORS = new Set(['black', 'white', 'transparent', 'currentcolor']);
const FORBIDDEN_GRADIENT_COLOR_RE = /[\n\r;{}<>]|url\s*\(|@import|expression\s*\(|javascript:/i;

export const DEFAULT_THEME_PREVIEW_COLORS = ['#1677ff', '#f0f0f0'] as const;

export const toSafeThemePreviewColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (!color || color.length > 120 || FORBIDDEN_GRADIENT_COLOR_RE.test(color)) return null;
  if (HEX_COLOR_RE.test(color) || RGB_COLOR_RE.test(color) || HSL_COLOR_RE.test(color)) return color;
  return NAMED_COLORS.has(color.toLowerCase()) ? color : null;
};

export const coerceThemePreviewColors = (
  values: unknown[],
  fallbackColors: readonly string[] = DEFAULT_THEME_PREVIEW_COLORS,
): string[] => {
  const colors = values
    .map(toSafeThemePreviewColor)
    .filter((color): color is string => Boolean(color))
    .slice(0, 4);

  if (colors.length === 0) {
    colors.push(
      ...fallbackColors
        .map(toSafeThemePreviewColor)
        .filter((color): color is string => Boolean(color))
        .slice(0, 2),
    );
  }

  if (colors.length === 0) colors.push(...DEFAULT_THEME_PREVIEW_COLORS);
  if (colors.length === 1) colors.push(colors[0]);
  return colors;
};

export const renderSafeThemePreviewGradient = (
  values: unknown[],
  fallbackColors?: readonly string[],
): string => `linear-gradient(135deg, ${coerceThemePreviewColors(values, fallbackColors).join(', ')})`;
