import { createHash } from 'node:crypto';

const normalizeLineEndings = source => source.replace(/\r\n?/g, '\n');

/**
 * Hashes source files with platform-independent line endings.
 * Git may check out text as CRLF on Windows and LF in CI; routing artifacts
 * must remain reproducible across both environments.
 */
export const hashPrecompiledDisplayRouteSource = source => {
  if (typeof source !== 'string') {
    throw new TypeError('Precompiled display route source must be a string');
  }
  return `source-v1:${createHash('sha256').update(normalizeLineEndings(source)).digest('hex')}`;
};
