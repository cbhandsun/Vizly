const SVG_PATH_COMMANDS = new Set(['M', 'm', 'L', 'l', 'H', 'h', 'V', 'v', 'C', 'c', 'S', 's', 'Q', 'q', 'T', 't', 'A', 'a', 'Z', 'z']);
const SVG_PATH_TOKEN_PATTERN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)/g;
const MAX_SVG_PATH_LENGTH = 20_000;

const isPathSeparator = (value: string): boolean => /^[\s,]*$/.test(value);

const tokenizeSvgPathData = (trimmed: string): string[] | null => {
  const tokenPattern = new RegExp(SVG_PATH_TOKEN_PATTERN);
  const tokens: string[] = [];
  let cursor = 0;
  let previousTokenWasNumber = false;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(trimmed)) !== null) {
    const gap = trimmed.slice(cursor, match.index);
    if (!isPathSeparator(gap)) return null;
    const token = match[0];
    if (/^[a-zA-Z]$/.test(token)) {
      if (!SVG_PATH_COMMANDS.has(token)) return null;
      cursor = tokenPattern.lastIndex;
      previousTokenWasNumber = false;
      tokens.push(token);
      continue;
    }
    if (previousTokenWasNumber && gap === '' && !/^[+-]/.test(token)) return null;
    if (!Number.isFinite(Number(token))) return null;
    cursor = tokenPattern.lastIndex;
    previousTokenWasNumber = true;
    tokens.push(token);
  }
  return isPathSeparator(trimmed.slice(cursor)) ? tokens : null;
};

const commandArity = (command: string): number => {
  switch (command.toUpperCase()) {
    case 'H':
    case 'V':
      return 1;
    case 'M':
    case 'L':
    case 'T':
      return 2;
    case 'S':
    case 'Q':
      return 4;
    case 'C':
      return 6;
    case 'A':
      return 7;
    case 'Z':
      return 0;
    default:
      return -1;
  }
};

const hasValidCommandArity = (tokens: readonly string[]): boolean => {
  if (!tokens.length || !/^[Mm]$/.test(tokens[0])) return false;
  let index = 0;
  while (index < tokens.length) {
    const command = tokens[index];
    if (!/^[a-zA-Z]$/.test(command)) return false;
    const arity = commandArity(command);
    if (arity < 0) return false;
    index += 1;

    let numberCount = 0;
    while (index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
      numberCount += 1;
      index += 1;
    }

    if (arity === 0) {
      if (numberCount !== 0) return false;
      continue;
    }
    if (numberCount === 0 || numberCount % arity !== 0) return false;
  }
  return true;
};

export const isSafeSvgPathData = (path: unknown): path is string => {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed || trimmed.length > MAX_SVG_PATH_LENGTH) return false;
  if (/[^a-zA-Z0-9+\-.,\s]/.test(trimmed)) return false;

  const tokens = tokenizeSvgPathData(trimmed);
  return tokens !== null && hasValidCommandArity(tokens);
};
