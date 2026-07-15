import { describe, expect, it } from 'vitest';

import { BoundedEvaluationLruCache } from '../boundedEvaluationLruCache';

const oneSlot = { edges: 1, segments: 1, pairs: 1 } as const;

describe('BoundedEvaluationLruCache', () => {
  it('evicts the least-recently-used entry when the entry budget is exceeded', () => {
    const cache = new BoundedEvaluationLruCache<string>({
      entries: 2,
      edgeSlots: 10,
      segmentSlots: 10,
      pairSlots: 10,
    });
    cache.set('first', 'first-value', oneSlot);
    cache.set('second', 'second-value', oneSlot);
    expect(cache.get('first')).toBe('first-value');

    cache.set('third', 'third-value', oneSlot);

    expect(cache.size).toBe(2);
    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('first')).toBe('first-value');
    expect(cache.get('third')).toBe('third-value');
  });

  it('enforces aggregate slot budgets and does not retain invalid or oversized entries', () => {
    const cache = new BoundedEvaluationLruCache<string>({
      entries: 10,
      edgeSlots: 2,
      segmentSlots: 3,
      pairSlots: 2,
    });
    expect(cache.set('dense', 'dense-value', { edges: 2, segments: 2, pairs: 2 })).toBe(true);
    expect(cache.set('newest', 'newest-value', oneSlot)).toBe(true);
    expect(cache.get('dense')).toBeUndefined();
    expect(cache.get('newest')).toBe('newest-value');

    expect(cache.set('oversized', 'oversized-value', { edges: 3, segments: 1, pairs: 1 })).toBe(false);
    expect(cache.set('invalid', 'invalid-value', { edges: Number.NaN, segments: 1, pairs: 1 })).toBe(false);
    expect(cache.get('oversized')).toBeUndefined();
    expect(cache.get('invalid')).toBeUndefined();
  });
});
