import { describe, expect, it } from 'vitest';

import { hashPrecompiledDisplayRouteSource } from './precompiled-display-route-source-hash.mjs';

describe('hashPrecompiledDisplayRouteSource', () => {
  it('produces the same hash for LF, CRLF, and legacy CR sources', () => {
    const lf = '{\n  "id": "route"\n}\n';

    expect(hashPrecompiledDisplayRouteSource(lf)).toBe(
      hashPrecompiledDisplayRouteSource(lf.replace(/\n/g, '\r\n')),
    );
    expect(hashPrecompiledDisplayRouteSource(lf)).toBe(
      hashPrecompiledDisplayRouteSource(lf.replace(/\n/g, '\r')),
    );
  });

  it('keeps content changes significant after normalization', () => {
    expect(hashPrecompiledDisplayRouteSource('alpha\n')).not.toBe(
      hashPrecompiledDisplayRouteSource('beta\n'),
    );
    expect(hashPrecompiledDisplayRouteSource('')).toMatch(/^source-v1:[0-9a-f]{64}$/);
  });

  it('rejects non-string inputs', () => {
    expect(() => hashPrecompiledDisplayRouteSource(null)).toThrow(TypeError);
    expect(() => hashPrecompiledDisplayRouteSource({ value: 'route' })).toThrow(TypeError);
  });
});
