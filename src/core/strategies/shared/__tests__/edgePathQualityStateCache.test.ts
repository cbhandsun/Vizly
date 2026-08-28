import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScoreExact } from '../edgePathQualityFullScan';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
} from '../edgeStrictCrossingGuard';

const edge = (index: number, y = index % 3): Edge => ({
  id: `edge-${index}`,
  source: `source-${index}`,
  target: `target-${index}`,
  data: { computedPath: [{ x: 0, y }, { x: 400, y }] },
});

describe('edgePathQualityStateCache', () => {
  it('publishes an owned exact state to the normal bounded score cache', () => {
    const baseline = Array.from({ length: 12 }, (_, index) => edge(index));
    const context = createEdgePathQualityEvaluationContext(baseline);
    const rootState = context.createState(baseline);
    const candidate = baseline.map((current, index) => index < 3
      ? edge(index, 20 + index)
      : current);
    const state = context.evaluateStateChanged(rootState, candidate, [0, 1, 2]);

    expect(context.rememberState?.(candidate, state)).toBe(true);
    const cachedMetrics = { scannedEdgePairCount: 0 };
    const cached = calculateEdgePathQualityScore(candidate, cachedMetrics);
    const exactMetrics = { scannedEdgePairCount: 0 };
    const exact = calculateEdgePathQualityScoreExact(candidate, exactMetrics);

    expect(cached).toEqual(exact);
    expect(cachedMetrics.scannedEdgePairCount).toBe(0);
    expect(exactMetrics.scannedEdgePairCount).toBe(66);
  });

  it('rejects foreign states and invalidates an in-place path mutation', () => {
    const baseline = Array.from({ length: 12 }, (_, index) => edge(index));
    const context = createEdgePathQualityEvaluationContext(baseline);
    const candidate = baseline.map((current, index) => index === 0
      ? edge(index, 20)
      : current);
    const state = context.evaluateStateChanged(context.createState(baseline), candidate, [0]);
    const foreignContext = createEdgePathQualityEvaluationContext([...baseline]);

    expect(foreignContext.rememberState?.(candidate, state)).toBe(false);
    expect(context.rememberState?.(candidate, state)).toBe(true);
    const data = candidate[0].data as Record<string, unknown>;
    data.computedPath = [{ x: 0, y: 80 }, { x: 400, y: 80 }];
    const mutated = calculateEdgePathQualityScore(candidate);
    expect(mutated).not.toBe(state.score);
    expect(mutated).toEqual(calculateEdgePathQualityScoreExact(candidate));
  });
});
