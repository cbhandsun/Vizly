const MAX_NODE_DESCRIPTION_LENGTH = 10_000;

const decodeHtmlEntity = (entity: string): string => {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  const normalized = entity.toLowerCase();
  if (named[normalized]) return named[normalized];
  if (normalized.startsWith('#x')) {
    const value = Number.parseInt(normalized.slice(2), 16);
    return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
      ? String.fromCodePoint(value)
      : '';
  }
  if (normalized.startsWith('#')) {
    const value = Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
      ? String.fromCodePoint(value)
      : '';
  }
  return `&${entity};`;
};

export const normalizeNodeDescriptionForEditing = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value
    .slice(0, MAX_NODE_DESCRIPTION_LENGTH * 2)
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|section|article|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&([a-z]+|#\d+|#x[0-9a-f]+);/gi, (_, entity: string) => decodeHtmlEntity(entity))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, MAX_NODE_DESCRIPTION_LENGTH);
};
