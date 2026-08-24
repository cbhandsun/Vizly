import { createHash } from 'node:crypto';

export const normalizePrecompiledDisplayRouteSource = source => {
  if (typeof source !== 'string') {
    throw new TypeError('Precompiled display route source must be a string');
  }
  return source.replace(/\r\n?/g, '\n');
};

/**
 * Hashes source files with platform-independent line endings.
 * Git may check out text as CRLF on Windows and LF in CI; routing artifacts
 * must remain reproducible across both environments.
 */
export const hashPrecompiledDisplayRouteSource = source => {
  const normalizedSource = normalizePrecompiledDisplayRouteSource(source);
  return `source-v1:${createHash('sha256').update(normalizedSource).digest('hex')}`;
};
