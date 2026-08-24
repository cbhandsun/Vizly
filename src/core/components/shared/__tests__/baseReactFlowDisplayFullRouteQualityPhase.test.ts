import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { shouldMaterializeDetachedMicroAlternative } from '../baseReactFlowDisplayFullRouteQualityPhase';
import { selectDisplayQualityInitialDetachedOverlapOptions } from '../baseReactFlowDisplayQualityCrossingCandidates';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
} from '../baseReactFlowDisplayOverlapRepair';
import {
  changedDisplayPathIndexes,
  collectDisplayRoutingAffectedEdgeIndexes,
} from '../baseReactFlowDisplayChangedEdgePromotion';
import { createDisplayQualityGlobalRefineSession } from '../baseReactFlowDisplayQualityGlobalRefine';
import { repairBaseReactFlowQualityStructuralCrossings } from '../baseReactFlowDisplayQualityStructuralCrossing';

describe('baseReactFlowDisplayFullRouteQualityPhase', () => {
  it('reports each structural crossing repair stage without changing a clean route', () => {
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 50, y: 60 }, { x: 50, y: 200 }] },
    }];
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
      { id: 'target', position: { x: 0, y: 200 }, width: 100, height: 60, data: {} },
    ];
    const traces: Array<{ phase: string; parentPhase?: string }> = [];

    const result = repairBaseReactFlowQualityStructuralCrossings({
      edges,
      nodes,
      onPhaseTrace: trace => traces.push(trace),
    });

    expect(result).toBe(edges);
    expect(traces.map(trace => trace.phase)).toEqual([
      'quality-crossing-structural-reverse-initial',
      'quality-crossing-structural-shared-initial',
      'quality-crossing-structural-reverse-final',
      'quality-crossing-structural-shared-final',
      'quality-crossing-structural-endpoint-lane',
    ]);
    expect(traces.every(trace => (
      trace.parentPhase === 'quality-crossing-structural'
    ))).toBe(true);
  });

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

    expect(collectDisplayRoutingAffectedEdgeIndexes(baseline, derivative))
      .toEqual([0, 1]);
  });

  it('reuses only an identical request-local global-refine input', () => {
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const traces: Array<{
      resolution: string;
      cacheHitCount?: number;
      candidateCount?: number;
    }> = [];
    const session = createDisplayQualityGlobalRefineSession({
      nodes: [],
      onPhaseTrace: trace => traces.push(trace),
    });

    const first = session.run({
      edges,
      mutableEdgeIndexes: [0],
      normalize: false,
      phase: 'quality-crossing-global-refine-fixed-point',
    });
    const equivalentEdges = edges.map(edge => ({ ...edge, data: { ...edge.data } }));
    const second = session.run({
      edges: equivalentEdges,
      mutableEdgeIndexes: [0, 0],
      normalize: false,
      phase: 'quality-crossing-global-refine-dogleg',
    });
    const third = session.run({
      edges: equivalentEdges,
      normalize: false,
      phase: 'quality-crossing-global-refine-fixed-point',
    });

    expect(first).toBe(edges);
    expect(second).toBe(equivalentEdges);
    expect(third).toBe(equivalentEdges);
    expect(traces.map(trace => trace.resolution)).toEqual(['skip', 'hit', 'skip']);
    expect(traces.map(trace => trace.candidateCount)).toEqual([1, 1, 1]);
    expect(traces[1]?.cacheHitCount).toBe(1);
    expect(traces[2]?.cacheHitCount).toBe(0);
  });
});
