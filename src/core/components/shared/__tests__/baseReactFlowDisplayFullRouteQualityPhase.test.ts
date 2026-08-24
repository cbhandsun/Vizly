import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { shouldMaterializeDetachedMicroAlternative } from '../baseReactFlowDisplayFullRouteQualityPhase';
import { selectDisplayQualityInitialDetachedOverlapOptions } from '../baseReactFlowDisplayQualityCrossingCandidates';
import {
  changedDisplayPathIndexes,
  collectResidualMicroCandidateEdgeIndexes,
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
} from '../baseReactFlowDisplayOverlapRepair';
import { createDisplayQualityGlobalRefineSession } from '../baseReactFlowDisplayQualityGlobalRefine';

describe('baseReactFlowDisplayFullRouteQualityPhase', () => {
  it('bounds the speculative initial detached candidate for large routes', () => {
    expect(selectDisplayQualityInitialDetachedOverlapOptions(true))
      .toBe(DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS);
    expect(selectDisplayQualityInitialDetachedOverlapOptions(false))
      .toBe(DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS);
  });

  it('does not duplicate the micro repair family after endpoint-first progress', () => {
    expect(shouldMaterializeDetachedMicroAlternative(false)).toBe(false);
    expect(shouldMaterializeDetachedMicroAlternative(true)).toBe(true);
  });

  it('identifies only geometry-changing residual derivatives', () => {
    const edge = (id: string, middleX: number) => ({
      id,
      source: `${id}-source`,
      target: `${id}-target`,
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: middleX, y: 0 },
          { x: middleX, y: 100 },
        ],
      },
    });
    const baseline = [edge('first', 40), edge('second', 80)];

    expect(changedDisplayPathIndexes(baseline, baseline.map(item => ({
      ...item,
      data: { ...item.data },
    })))).toEqual([]);
    expect(changedDisplayPathIndexes(baseline, [edge('first', 40), edge('second', 96)]))
      .toEqual([1]);
    expect(changedDisplayPathIndexes(baseline, [edge('second', 80), edge('first', 40)]))
      .toEqual([0, 1]);
  });

  it('promotes a geometrically interacting peer into derivative cleanup', () => {
    const baseline = [
      {
        id: 'changed',
        source: 'changed-source',
        target: 'changed-target',
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      },
      {
        id: 'peer',
        source: 'peer-source',
        target: 'peer-target',
        data: { computedPath: [{ x: 50, y: 200 }, { x: 50, y: 300 }] },
      },
    ];
    const derivative = [
      {
        ...baseline[0],
        data: { computedPath: [{ x: 0, y: 250 }, { x: 100, y: 250 }] },
      },
      baseline[1],
    ];

    expect(collectResidualMicroCandidateEdgeIndexes(baseline, derivative))
      .toEqual([0, 1]);
  });

  it('reuses only an identical request-local global-refine input', () => {
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const traces: Array<{ resolution: string; cacheHitCount?: number }> = [];
    const session = createDisplayQualityGlobalRefineSession({
      nodes: [],
      onPhaseTrace: trace => traces.push(trace),
    });

    const first = session.run({
      edges,
      normalize: false,
      phase: 'quality-crossing-global-refine-fixed-point',
    });
    const equivalentEdges = edges.map(edge => ({ ...edge, data: { ...edge.data } }));
    const second = session.run({
      edges: equivalentEdges,
      normalize: false,
      phase: 'quality-crossing-global-refine-dogleg',
    });

    expect(first).toBe(edges);
    expect(second).toBe(equivalentEdges);
    expect(traces.map(trace => trace.resolution)).toEqual(['skip', 'hit']);
    expect(traces[1]?.cacheHitCount).toBe(1);
  });
});
