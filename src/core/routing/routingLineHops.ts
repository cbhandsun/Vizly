export const MAX_ROUTING_LINE_HOP_LENGTH = 128;
export const MAX_ROUTING_LINE_HOP_COUNT = 16;
export const MAX_ROUTING_LINE_HOP_COORDINATE = 1_000_000_000;

const COORDINATE_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Parses the bounded `;x,y;` carrier used by the SVG line-hop renderer. */
export const parseRoutingLineHops = (value: unknown): string | null => {
  if (
    typeof value !== 'string'
    || value.length < 5
    || value.length > MAX_ROUTING_LINE_HOP_LENGTH
    || !value.startsWith(';')
    || !value.endsWith(';')
  ) return null;
  const tokens = value.slice(1, -1).split(';');
  if (tokens.length === 0 || tokens.length > MAX_ROUTING_LINE_HOP_COUNT) return null;
  for (const token of tokens) {
    const coordinates = token.split(',');
    if (
      coordinates.length !== 2
      || !coordinates.every(coordinate => COORDINATE_PATTERN.test(coordinate))
    ) return null;
    const [x, y] = coordinates.map(Number);
    if (
      !Number.isFinite(x)
      || !Number.isFinite(y)
      || Math.abs(x) > MAX_ROUTING_LINE_HOP_COORDINATE
      || Math.abs(y) > MAX_ROUTING_LINE_HOP_COORDINATE
    ) return null;
  }
  return value;
};
