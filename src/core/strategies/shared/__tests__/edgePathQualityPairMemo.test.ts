import { describe, expect, it } from 'vitest';

import {
  EdgePathQualityGenerationalPairMemo,
  EdgePathQualityPairMemo,
} from '../edgePathQualityPairMemo';

const contribution = (strictCrossings: number) => ({
  strictCrossings,
  reverseOverlap: 0,
  unrelatedOverlap: 0,
  relatedOverlap: 0,
  unexplainedRelatedOverlap: 0,
});

describe('EdgePathQualityPairMemo', () => {
  it('reuses exact ordered signature pairs without retaining caller values', () => {
    const memo = new EdgePathQualityPairMemo(8, 8);
    const value = contribution(2);
    expect(memo.set('first', 'second', value)).toBe(true);
    value.strictCrossings = 9;

    expect(memo.get('first', 'second')).toEqual(contribution(2));
    expect(memo.get('second', 'first')).toBeUndefined();
    expect(memo.metrics()).toMatchObject({ hitCount: 1, missCount: 1, pairCount: 1 });
  });

  it('evicts pair entries and clears interned IDs at their independent bounds', () => {
    const memo = new EdgePathQualityPairMemo(3, 2);
    memo.set('a', 'b', contribution(1));
    memo.set('a', 'c', contribution(2));
    memo.set('a', 'd', contribution(3));

    expect(memo.get('a', 'b')).toBeUndefined();
    expect(memo.get('a', 'd')).toEqual(contribution(3));
    expect(memo.metrics()).toMatchObject({ signatureCount: 2, pairCount: 1 });
  });

  it('fails closed for empty and oversized signatures', () => {
    const memo = new EdgePathQualityPairMemo();
    expect(memo.set('', 'second', contribution(1))).toBe(false);
    expect(memo.set('x'.repeat(32_769), 'second', contribution(1))).toBe(false);
    expect(memo.get('', 'second')).toBeUndefined();
    expect(memo.metrics()).toMatchObject({ pairCount: 0, signatureCount: 0 });
  });

});

describe('EdgePathQualityGenerationalPairMemo', () => {
  it('reuses ordered pairs and replaces the bounded generation atomically', () => {
    const memo = new EdgePathQualityGenerationalPairMemo(2);
    memo.set('a', 'b', contribution(1));
    memo.set('a', 'c', contribution(2));

    expect(memo.get('a', 'b')).toEqual(contribution(1));
    memo.set('d', 'e', contribution(3));

    expect(memo.get('a', 'b')).toBeUndefined();
    expect(memo.get('d', 'e')).toEqual(contribution(3));
    expect(memo.metrics()).toMatchObject({ hitCount: 2, missCount: 1, pairCount: 1 });
  });
});
