const CSS_VAR_NAME_RE = /^[a-zA-Z][a-zA-Z0-9-]{0,80}$/;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_RE = /^rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const HSL_COLOR_RE = /^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const NAMED_COLORS = new Set(['black', 'white', 'transparent', 'currentcolor']);
const FORBIDDEN_CSS_VALUE_RE = /[;{}<>]|url\s*\(|@import|expression\s*\(|javascript:/i;

const isSafeCssVariableValue = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120 || FORBIDDEN_CSS_VALUE_RE.test(trimmed)) return false;
  return (
    HEX_COLOR_RE.test(trimmed) ||
    RGB_COLOR_RE.test(trimmed) ||
    HSL_COLOR_RE.test(trimmed) ||
    NAMED_COLORS.has(trimmed.toLowerCase())
  );
};

export const sanitizeCssVariableDeclarations = (styles: Record<string, unknown>): string[] => {
  return Object.entries(styles)
    .map(([rawKey, rawValue]) => {
      const key = rawKey.trim();
      const value = String(rawValue ?? '').trim();
      if (!CSS_VAR_NAME_RE.test(key) || !isSafeCssVariableValue(value)) return null;
      return `  --${key}: ${value} !important;`;
    })
    .filter((declaration): declaration is string => Boolean(declaration));
};

export const renderCssVariableBlock = (styles: Record<string, unknown>): string => {
  const declarations = sanitizeCssVariableDeclarations(styles);
  return declarations.length > 0 ? `:root {\n${declarations.join('\n')}\n}` : '';
};
