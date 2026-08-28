import { describe, expect, it } from 'vitest';

import {
  shouldUseIncrementalEdgePathQualityEvaluation,
  shouldUseIncrementalEdgePathQualityState,
} from '../edgePathQualityIncrementalPolicy';

describe('edgePathQualityIncrementalPolicy', () => {
  it('admits only bounded broad changes whose affected pairs beat a full scan', () => {
    expect(shouldUseIncrementalEdgePathQualityEvaluation(45, 9)).toBe(true);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(45, 21)).toBe(true);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(12, 9)).toBe(false);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(45, 33)).toBe(false);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(1_000, 9)).toBe(false);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(45, 44)).toBe(false);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(8, 8)).toBe(true);
  });

  it('rejects invalid counts and keeps state chains narrowly bounded', () => {
    expect(shouldUseIncrementalEdgePathQualityEvaluation(8, -1)).toBe(false);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(8, 9)).toBe(false);
    expect(shouldUseIncrementalEdgePathQualityEvaluation(Number.NaN, 1)).toBe(false);
    expect(shouldUseIncrementalEdgePathQualityState(8)).toBe(true);
    expect(shouldUseIncrementalEdgePathQualityState(9)).toBe(false);
  });
});
