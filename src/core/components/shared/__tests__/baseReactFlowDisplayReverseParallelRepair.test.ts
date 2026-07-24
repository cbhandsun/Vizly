import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  collectExactThresholdResidualPairs,
  repairBoundedReverseParallelOverlapsWithCandidates,
} from '../baseReactFlowDisplayReverseParallelRepair';

const edge = (id: string, source: string, target: string, computedPath: Array<{ x: number; y: number }>): Edge => ({
  id,
  source,
  target,
  data: { computedPath },
});

describe('baseReactFlowDisplayReverseParallelRepair', () => {
  it('collects exact residual pairs in descending overlap order', () => {
    const edges = [
      edge('long-forward', 'a', 'b', [{ x: 0, y: 0 }, { x: 120, y: 0 }]),
      edge('long-reverse', 'c', 'd', [{ x: 120, y: 0 }, { x: 0, y: 0 }]),
      edge('short-reverse', 'e', 'f', [{ x: 80, y: 20 }, { x: 20, y: 20 }]),
      edge('short-forward', 'g', 'h', [{ x: 20, y: 20 }, { x: 80, y: 20 }]),
    ];

    expect(collectExactThresholdResidualPairs(edges).map(pair => pair.overlap)).toEqual([120, 60]);
    expect(collectExactThresholdResidualPairs([])).toEqual([]);
  });

  it('accepts a bounded candidate only when reverse overlap improves', () => {
    const baseline = [
      edge('forward', 'a', 'b', [{ x: 0, y: 0 }, { x: 120, y: 0 }]),
      edge('reverse', 'c', 'd', [{ x: 120, y: 0 }, { x: 0, y: 0 }]),
    ];
    const separated = [
      baseline[0],
      edge('reverse', 'c', 'd', [{ x: 120, y: 24 }, { x: 0, y: 24 }]),
    ];

    const repaired = repairBoundedReverseParallelOverlapsWithCandidates(
      baseline,
      [],
      4,
      () => [separated],
    );

    expect(calculateEdgePathQualityScore(baseline).reverseOverlap).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(repaired).reverseOverlap).toBe(0);
  });
});
