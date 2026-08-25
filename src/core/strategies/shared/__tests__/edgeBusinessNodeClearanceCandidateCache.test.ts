import { describe, expect, it, vi } from 'vitest';

import { createBusinessNodeClearanceCandidateCache } from '../edgeBusinessNodeClearanceCandidateCache';

const path = [{ x: 0, y: 20 }, { x: 100, y: 20 }];

describe('business-node clearance candidate cache', () => {
  it('reuses only an exact bounded collection identity', () => {
    const cache = createBusinessNodeClearanceCandidateCache<object>();
    const create = vi.fn(() => ({}));
    const input = {
      path,
      sourceId: 'source',
      targetId: 'target',
      minimumClearance: 48,
      create,
    };

    const first = cache.getOrCreate(input);
    const second = cache.getOrCreate({
      ...input,
      path: path.map(point => ({ ...point })),
    });

    expect(first.cacheHit).toBe(false);
    expect(second).toEqual({ value: first.value, cacheHit: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps terminals, clearance, and geometry isolated', () => {
    const cache = createBusinessNodeClearanceCandidateCache<number>();
    let value = 0;
    const base = {
      path,
      sourceId: 'source',
      targetId: 'target',
      minimumClearance: 48,
      create: () => ++value,
    };

    expect(cache.getOrCreate(base).value).toBe(1);
    expect(cache.getOrCreate({ ...base, sourceId: 'other' }).value).toBe(2);
    expect(cache.getOrCreate({ ...base, minimumClearance: 49 }).value).toBe(3);
    expect(cache.getOrCreate({ ...base, path: [{ x: 0, y: 21 }, path[1]] }).value).toBe(4);
  });

  it('fails open for non-finite, oversized, or unbounded identities', () => {
    const cache = createBusinessNodeClearanceCandidateCache<number>();
    let value = 0;
    const create = () => ++value;
    const invalidInputs = [
      { path: [{ x: Number.POSITIVE_INFINITY, y: 0 }], sourceId: 's', targetId: 't' },
      { path: Array.from({ length: 257 }, (_, index) => ({ x: index, y: 0 })), sourceId: 's', targetId: 't' },
      { path, sourceId: 's'.repeat(513), targetId: 't' },
    ];

    for (const input of invalidInputs) {
      const request = { ...input, minimumClearance: 48, create };
      expect(cache.getOrCreate(request).cacheHit).toBe(false);
      expect(cache.getOrCreate(request).cacheHit).toBe(false);
    }
    expect(value).toBe(6);
  });
});
