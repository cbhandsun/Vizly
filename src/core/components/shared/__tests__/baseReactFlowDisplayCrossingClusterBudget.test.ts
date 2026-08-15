import { describe, expect, it } from 'vitest';

import { resolveDisplayCrossingClusterCandidateBudget } from '../baseReactFlowDisplayCrossingClusterBudget';

describe('baseReactFlowDisplayCrossingClusterBudget', () => {
  it.each([1, 8, 16])('uses the compact ordered sample for %i edges', edgeCount => {
    expect(resolveDisplayCrossingClusterCandidateBudget(edgeCount)).toEqual({
      maxLocalCandidates: 512,
      maxSidePairCandidates: 64,
    });
  });

  it.each([17, 20, 24])('retains the broader bounded sample for %i edges', edgeCount => {
    expect(resolveDisplayCrossingClusterCandidateBudget(edgeCount)).toEqual({
      maxLocalCandidates: 4_096,
      maxSidePairCandidates: 512,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5, 25])(
    'rejects an invalid or out-of-scope edge count %s',
    edgeCount => {
      expect(resolveDisplayCrossingClusterCandidateBudget(edgeCount)).toBeNull();
    },
  );
});
