import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScoreExact } from '../edgePathQualityFullScan';

const edge = (
  id: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath },
});

describe('edgePathQualityFullScan', () => {
  it('scans every edge pair and reports strict crossings', () => {
    const edges = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
      edge('separate', [{ x: 0, y: 150 }, { x: 100, y: 150 }]),
    ];
    const metrics = { scannedEdgePairCount: 0 };

    const score = calculateEdgePathQualityScoreExact(edges, metrics);

    expect(score.strictCrossings).toBe(1);
    expect(metrics.scannedEdgePairCount).toBe(3);
  });

  it('handles an empty graph without scanning', () => {
    const metrics = { scannedEdgePairCount: 0 };

    expect(calculateEdgePathQualityScoreExact([], metrics).strictCrossings).toBe(0);
    expect(metrics.scannedEdgePairCount).toBe(0);
  });
});
