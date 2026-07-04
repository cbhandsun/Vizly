const MAX_STYLE_TOKEN_CHARS = 80;

const NAMED_PAINTS = new Set([
  'black',
  'white',
  'transparent',
  'currentcolor',
  'none',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'gray',
  'grey',
]);

const isSafeSvgPaint = (value: string): boolean => {
  const token = value.trim();
  const lower = token.toLowerCase();
  if (!token || token.length > MAX_STYLE_TOKEN_CHARS) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(token)) return true;
  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(token)) return true;
  return NAMED_PAINTS.has(lower);
};

export const normalizeSvgPaint = (value: unknown, fallback: string): string => (
  typeof value === 'string' && isSafeSvgPaint(value) ? value.trim() : fallback
);

export const normalizeSvgStrokeDasharray = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const token = value.trim();
  if (!token || token.length > MAX_STYLE_TOKEN_CHARS) return undefined;
  return /^[\d\s.,]+$/.test(token) ? token : undefined;
};

export const normalizeSvgFontWeight = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 100 && value <= 900 && value % 100 === 0 ? String(value) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const token = value.trim().toLowerCase();
  if (token === 'normal' || token === 'bold' || token === 'bolder' || token === 'lighter') return token;
  return /^[1-9]00$/.test(token) && Number(token) <= 900 ? token : undefined;
};
