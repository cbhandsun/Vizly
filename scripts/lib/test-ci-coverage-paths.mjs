import path from 'node:path';

export const normalizeCiTestPath = value => value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
const isTestPath = value => /^(?:src|supabase|scripts\/lib)(?:\/|$)/.test(value);

/** Parse literal repository filters, without executing package script contents. */
export const extractCiTestPaths = command => {
  const paths = [];
  const excludes = [];
  const invalidPaths = [];
  if (typeof command !== 'string' || !/\bvitest\s+run\b/.test(command)) return { paths, excludes, invalidPaths };
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  if (tokens[0] !== 'vitest' || tokens[1] !== 'run'
    || tokens.some(token => ['&&', '||', ';', '|'].includes(token))) {
    return { paths, excludes, invalidPaths: ['unsupported-vitest-command'] };
  }
  const accept = (raw, exclusion = false) => {
    const value = normalizeCiTestPath(raw.replace(/^(['"])(.*)\1$/, '$2'));
    if (!isTestPath(value) || value.split('/').some(part => part === '..' || part === '.')
      || /[\0\r\n]/.test(value) || (!exclusion && /[*?{}[\]]/.test(value))) {
      invalidPaths.push(raw);
      return;
    }
    (exclusion ? excludes : paths).push(value);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--exclude') {
      accept(tokens[++index] ?? '', true);
      continue;
    }
    if (token.startsWith('--exclude=')) {
      accept(token.slice('--exclude='.length), true);
      continue;
    }
    if (token === '--environment') { index += 1; continue; }
    if (token.startsWith('-')) continue;
    const candidate = normalizeCiTestPath(token.replace(/^(['"])(.*)\1$/, '$2'));
    if (isTestPath(candidate) || /\.test\.(?:ts|tsx|mjs)$/.test(candidate)) accept(token);
  }
  return { paths, excludes, invalidPaths };
};

export const ciShardCoversTest = (shard, file) => shard.paths.some(filter => (
  file === filter || file.startsWith(`${filter}/`)
)) && !shard.excludes.some(filter => file === filter || file.startsWith(`${filter}/`)
  || path.posix.matchesGlob(file, filter));
