import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  calculateEdgePathQualityScore,
  countStrictEdgeCrossings,
} from '../../../strategies/shared/edgeStrictCrossingGuard';
import { displayStrictCrossingsFromKnownQuality } from '../baseReactFlowDisplayStrictCrossingCount';

const edgeWithPath = (id: string): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: {
    computedPath: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  },
});

describe('displayStrictCrossingsFromKnownQuality', () => {
  it('reuses the evaluated strict count when every edge has a complete computed path', () => {
    const metrics = { knownQualityStrictReuseCount: 0 };
    expect(displayStrictCrossingsFromKnownQuality(
      [edgeWithPath('complete')],
      { strictCrossings: 7 },
      metrics,
    )).toBe(7);
    expect(metrics.knownQualityStrictReuseCount).toBe(1);
  });

  it('keeps the display compatibility fallback when a computed path is missing', () => {
    const metrics = { knownQualityStrictReuseCount: 0 };
    const incomplete: Edge = {
      id: 'incomplete',
      source: 'source',
      target: 'target',
      data: {},
    };

    expect(displayStrictCrossingsFromKnownQuality(
      [edgeWithPath('complete'), incomplete],
      { strictCrossings: 7 },
      metrics,
    )).toBe(0);
    expect(metrics.knownQualityStrictReuseCount).toBe(0);
  });

  it('keeps the full-quality strict count equivalent to the strict-only evaluator', () => {
    const crossingEdges: Edge[] = [
      {
        ...edgeWithPath('horizontal'),
        data: { computedPath: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
      },
      {
        ...edgeWithPath('vertical'),
        data: { computedPath: [{ x: 50, y: 0 }, { x: 50, y: 100 }] },
      },
    ];

    for (const candidate of [[edgeWithPath('clean')], crossingEdges]) {
      expect(calculateEdgePathQualityScore(candidate).strictCrossings).toBe(
        countStrictEdgeCrossings(candidate),
      );
    }
  });
});
