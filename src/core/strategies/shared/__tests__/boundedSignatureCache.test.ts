import { describe, expect, it } from 'vitest';

import {
  readSignatureValue,
  rememberBoundedSignatureValue,
} from '../boundedSignatureCache';

describe('bounded signature cache', () => {
  it('refreshes a value when it is read', () => {
    const cache = new Map<string, number>([['first', 1], ['second', 2]]);

    expect(readSignatureValue(cache, 'first')).toBe(1);
    expect([...cache.keys()]).toEqual(['second', 'first']);
  });

  it('evicts the least recently used signature at the configured limit', () => {
    const cache = new Map<string, number>([['first', 1], ['second', 2]]);

    rememberBoundedSignatureValue(cache, 'third', 3, 2);

    expect([...cache.entries()]).toEqual([['second', 2], ['third', 3]]);
  });

  it('returns undefined without changing the cache for a missing signature', () => {
    const cache = new Map<string, number>([['present', 1]]);

    expect(readSignatureValue(cache, 'missing')).toBeUndefined();
    expect([...cache.entries()]).toEqual([['present', 1]]);
  });
});
