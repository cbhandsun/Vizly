import { describe, expect, it } from 'vitest';
import { resolveLayoutNodeMaxWidth } from '../layoutOptimizerConfig';

describe('layout optimizer config boundary', () => {
  it('uses a valid override before reading global configuration', () => {
    expect(resolveLayoutNodeMaxWidth(360, () => {
      throw new Error('must not read config');
    })).toBe(360);
  });

  it.each([undefined, null, '', -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back for invalid max width %s',
    (value) => {
      expect(resolveLayoutNodeMaxWidth(value, () => ({ node: { maxWidth: value } }))).toBe(420);
    },
  );

  it('caps extreme max widths at a bounded rendering value', () => {
    expect(resolveLayoutNodeMaxWidth(1_000_000)).toBe(10_000);
  });

  it('falls back when configuration access fails', () => {
    expect(resolveLayoutNodeMaxWidth(undefined, () => {
      throw new Error('configuration unavailable');
    })).toBe(420);
  });
});
