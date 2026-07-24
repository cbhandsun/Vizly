import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createChangedEdgePathEvaluationBuffer } from '../edgeLocalDoglegGeometry';
import * as edgeStrictCrossingGuard from '../edgeStrictCrossingGuard';

describe('edgeLocalDoglegRepair changed-edge evaluation buffer', () => {
  it('reuses one private candidate identity and preserves exact quality after in-place path updates', () => {
    const baselinePath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const baselineEdges: Edge[] = [
      {
        id: 'candidate-edge',
        source: 'source',
        target: 'target',
        data: { computedPath: baselinePath },
      },
      {
        id: 'crossing-edge',
        source: 'other-source',
        target: 'other-target',
        data: { computedPath: [{ x: 50, y: -50 }, { x: 50, y: 50 }] },
      },
    ];
    const buffer = createChangedEdgePathEvaluationBuffer(baselineEdges, 0);
    const qualityContext = edgeStrictCrossingGuard.createEdgePathQualityEvaluationContext(baselineEdges);
    const candidatePaths = [
      [{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 100, y: 60 }],
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 0, y: 0 }, { x: 0, y: -60 }, { x: 100, y: -60 }],
    ];
    let reusedArray: Edge[] | null = null;
    let reusedEdge: Edge | null = null;

    for (const candidatePath of candidatePaths) {
      const candidate = buffer.withPath(candidatePath);
      if (!reusedArray) {
        reusedArray = candidate;
        reusedEdge = candidate[0];
      } else {
        expect(candidate).toBe(reusedArray);
        expect(candidate[0]).toBe(reusedEdge);
      }
      const exactCandidate = candidate.map(edge => ({
        ...edge,
        data: {
          ...(edge.data || {}),
          computedPath: ((edge.data as any)?.computedPath || []).map((point: { x: number; y: number }) => ({ ...point })),
        },
      }));
      const exact = edgeStrictCrossingGuard.calculateEdgePathQualityScore(exactCandidate);
      const incremental = qualityContext.evaluateChanged(candidate, [0]);
      expect(incremental).toEqual(exact);
      expect((candidate[0].data as any).computedPath).toBe(candidatePath);
    }

    expect(reusedArray).not.toBe(baselineEdges);
    expect(reusedEdge).not.toBe(baselineEdges[0]);
    expect((baselineEdges[0].data as any).computedPath).toBe(baselinePath);
    expect((baselineEdges[0].data as any).computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });
});
