import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  shouldMaterializeDetachedMicroAlternative,
  shouldMaterializePostEndpointLocalAlternative,
  shouldMaterializeQualityMicroAlternative,
} from '../baseReactFlowDisplayFullRouteQualityPhase';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  selectDisplayQualityFinalOverlapOptions,
  selectDisplayQualityInitialDetachedOverlapOptions,
} from '../baseReactFlowDisplayQualityCrossingCandidates';
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
import { tryDisplayQualityEarlyClosure } from '../baseReactFlowDisplayQualityEarlyClosure';
import * as skirtRepair from '../baseReactFlowDisplayCrossedSpineSkirtRepair';
import * as postRender from '../baseReactFlowDisplayFullRoutePostRenderPhase';
import * as stubRepair from '../baseReactFlowDisplayEndpointStubRepair';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { resolveDisplayQualityBudget } from '../baseReactFlowDisplayEvaluation';
import { createDisplayRoutingTopologyPlan } from '../baseReactFlowDisplayRoutingTopologyPlan';
import type { BaseReactFlowFullRouteContext } from '../baseReactFlowDisplayFullRouteTypes';

describe('tryDisplayQualityEarlyClosure', () => {
  afterEach(() => vi.restoreAllMocks());

  const fixture = () => {
    const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target',
      sourceHandle: 'bottom', targetHandle: 'top',
      data: { computedPath: [{ x: 50, y: 60 }, { x: 50, y: 200 }] } }];
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
      { id: 'target', position: { x: 0, y: 200 }, width: 100, height: 60, data: {} },
    ];
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const cleanReport = evaluation.hardReport(edges);
    const crossedReport = { ...cleanReport, hardClean: false,
      quality: { ...cleanReport.quality, strictCrossings: 2 } };
    const report = vi.spyOn(evaluation, 'hardReport')
      .mockImplementation(candidate => candidate === edges ? crossedReport : cleanReport);
    const context: BaseReactFlowFullRouteContext = {
      inputSignature: 'test', routeSeedEdges: edges, normalizedEdges: edges,
      repairNodes: nodes, renderNodes: nodes, enableSmartEdges: true,
      smartEdgePadding: 20, isLargeGraph: false, layoutDirection: 'TB',
      qualityBudget: resolveDisplayQualityBudget(edges, nodes, false, true),
      useBoundedLargeRepair: false, canReusePreparedGlobalRouting: false,
      reusePreparedGlobalRouting: false, evaluationSession: evaluation,
      topologyPlan: createDisplayRoutingTopologyPlan(nodes, edges), onPhaseTrace: vi.fn(),
    };
    const skirt = structuredClone(edges);
    const closed = structuredClone(edges);
    const repair = vi.spyOn(skirtRepair, 'repairCrossedSpineWithOuterSkirt').mockReturnValue(skirt);
    const close = vi.spyOn(postRender, 'runBaseReactFlowFullRoutePostRenderPhase')
      .mockReturnValue({ kind: 'finalized', edges: closed });
    return { edges, skirt, closed, context, report, cleanReport, crossedReport, repair, close };
  };

  it('accepts a complete safe closure and reports its work once', () => {
    const f = fixture();
    const before = structuredClone(f.edges);
    expect(tryDisplayQualityEarlyClosure(f.context, f.edges)).toBe(f.closed);
    expect(f.edges).toEqual(before);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.context.onPhaseTrace).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      phase: 'quality-crossing-early-closure', resolution: 'accepted',
    }));
  });

  it.each(['empty', 'large', 'bounded'] as const)('does not speculate for %s routes', mode => {
    const f = fixture();
    const edges = mode === 'empty' ? [] : mode === 'large'
      ? Array.from({ length: 25 }, () => f.edges[0]) : f.edges;
    expect(tryDisplayQualityEarlyClosure({ ...f.context, useBoundedLargeRepair: mode === 'bounded' }, edges))
      .toBeNull();
    expect(f.repair).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });

  it('continues the original pipeline when there are obstacles or no crossed spine', () => {
    const f = fixture();
    f.report.mockReturnValue({ ...f.crossedReport, obstacleHits: 1 });
    expect(tryDisplayQualityEarlyClosure(f.context, f.edges)).toBeNull();
    f.report.mockReturnValue(f.cleanReport);
    expect(tryDisplayQualityEarlyClosure(f.context, f.edges)).toBeNull();
    expect(f.repair).not.toHaveBeenCalled();
  });

  it('does not run residual closure while the skirt leaves a strict crossing', () => {
    const f = fixture();
    f.report.mockReturnValue(f.crossedReport);
    expect(tryDisplayQualityEarlyClosure(f.context, f.edges)).toBeNull();
    expect(f.close).not.toHaveBeenCalled();
  });

  it.each(['empty', 'identity', 'invalid-path', 'hard-defect', 'unsafe-stub', 'commercial-bends'] as const)(
    'rejects a %s candidate and leaves the original route available', failure => {
      const f = fixture();
      if (failure === 'empty') f.closed.length = 0;
      if (failure === 'identity') f.closed[0].id = 'different';
      if (failure === 'invalid-path') f.closed[0].data = { computedPath: [] };
      if (failure === 'unsafe-stub') {
        f.closed[0].data = { computedPath: [
          { x: 50, y: 60 }, { x: 50, y: 65 }, { x: 100, y: 65 }, { x: 100, y: 200 },
        ] };
        vi.spyOn(stubRepair, 'repairRenderSafeEndpointStubs').mockReturnValue(f.closed);
      }
      if (failure === 'commercial-bends') f.closed[0].data = { computedPath: [
        { x: 50, y: 60 }, { x: 50, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 140 },
        { x: 150, y: 140 }, { x: 150, y: 180 }, { x: 200, y: 180 }, { x: 200, y: 220 },
        { x: 250, y: 220 }, { x: 250, y: 260 },
      ] };
      if (failure === 'hard-defect') f.report.mockImplementation(candidate => (
        candidate === f.skirt ? f.cleanReport : f.crossedReport
      ));
      expect(tryDisplayQualityEarlyClosure(f.context, f.edges)).toBeNull();
      expect(f.context.onPhaseTrace).toHaveBeenCalledWith(expect.objectContaining({ resolution: 'fallback' }));
    },
  );

  it('propagates a failed closure without converting it into success', () => {
    const f = fixture();
    f.close.mockImplementation(() => { throw new Error('closure failed'); });
    expect(() => tryDisplayQualityEarlyClosure(f.context, f.edges)).toThrow('closure failed');
  });
});

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

  it('scales the final detached candidate budget with the route size', () => {
    expect(selectDisplayQualityFinalOverlapOptions(false, 14).maxQualityEvaluations).toBe(56);
    expect(selectDisplayQualityFinalOverlapOptions(false, 44))
      .toBe(DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS);
    expect(selectDisplayQualityFinalOverlapOptions(true, 14))
      .toBe(DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS);
  });

  it('does not duplicate the micro repair family after endpoint-first progress', () => {
    expect(shouldMaterializeDetachedMicroAlternative(false)).toBe(false);
    expect(shouldMaterializeDetachedMicroAlternative(true)).toBe(true);
  });

  it('materializes endpoint micro candidates only for an active defect family', () => {
    const cleanQuality = calculateEdgePathQualityScore([{
      id: 'clean',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }]);

    expect(shouldMaterializeQualityMicroAlternative(false, cleanQuality)).toBe(false);
    expect(shouldMaterializeQualityMicroAlternative(false, {
      ...cleanQuality,
      hairpins: 1,
    })).toBe(true);
    expect(shouldMaterializeQualityMicroAlternative(false, {
      ...cleanQuality,
      hairpins: 1,
      reverseOverlap: 1,
    })).toBe(false);
    expect(shouldMaterializeQualityMicroAlternative(true, {
      ...cleanQuality,
      hairpins: 1,
    })).toBe(false);
    expect(shouldMaterializePostEndpointLocalAlternative(false, cleanQuality)).toBe(true);
    expect(shouldMaterializePostEndpointLocalAlternative(false, {
      ...cleanQuality,
      reverseOverlap: 1,
    })).toBe(false);
    expect(shouldMaterializePostEndpointLocalAlternative(true, cleanQuality)).toBe(false);
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
