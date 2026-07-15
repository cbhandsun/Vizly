import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayStrictCrossings } from '../baseReactFlowDisplayEvaluation';

const repairFinalResidualStrictCrossings = vi.hoisted(() => vi.fn((edges: Edge[]) => [...edges]));

vi.mock('../baseReactFlowDisplayStrictResidualRepair', () => ({
  repairFinalResidualStrictCrossings,
}));

import { repairFinalResidualStrictCrossingsFromKnownAnalysis } from '../baseReactFlowDisplayStrictRepairAnalysis';

const edgeWithPath = (id: string, computedPath: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath },
});

describe('repairFinalResidualStrictCrossingsFromKnownAnalysis', () => {
  it('returns the same reference when raw and render-normalized paths are known clean', () => {
    const edges = [edgeWithPath('clean', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])];

    const repaired = repairFinalResidualStrictCrossingsFromKnownAnalysis(edges, [], {
      rawStrictCrossings: 0,
      renderStrictCrossings: 0,
    });

    expect(repaired).toBe(edges);
    expect(repairFinalResidualStrictCrossings).not.toHaveBeenCalled();
  });

  it('does not skip a collinear-split raw zero that becomes a rendered crossing', () => {
    const edges = [
      edgeWithPath('horizontal', [
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
      ]),
      edgeWithPath('vertical', [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ]),
    ];
    const rawStrictCrossings = calculateEdgePathQualityScore(edges).strictCrossings;
    const renderStrictCrossings = countDisplayStrictCrossings(edges);

    expect(rawStrictCrossings).toBe(0);
    expect(renderStrictCrossings).toBe(1);

    const repaired = repairFinalResidualStrictCrossingsFromKnownAnalysis(edges, [], {
      rawStrictCrossings,
      renderStrictCrossings,
    });

    expect(repairFinalResidualStrictCrossings).toHaveBeenCalledOnce();
    expect(repairFinalResidualStrictCrossings).toHaveBeenCalledWith(edges, []);
    expect(repaired).not.toBe(edges);
  });
});
