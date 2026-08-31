import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateEdgePathQualityScore,
  countStrictEdgeCrossings,
} from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  chooseDisplayStrictPolishCandidate,
  chooseFinalObstacleAwarePolishCandidate,
  chooseFinalTerminalTransactionCandidate,
  chooseFinalVisualPolishCandidate,
  countDisplayObstacleHits,
  countDisplayStrictCrossings,
  createDisplayObstacleEvaluationContext,
  evaluateDisplayObstacleCandidate,
  getDisplayHardQualityGateReport,
  uniqueDisplayRoutingCandidates,
} from '../baseReactFlowDisplayEvaluation';
import { findDisplayStrictCrossingHits } from '../baseReactFlowDisplayGeometry';
import {
  edgeRoutingQualityIntentToken,
} from '../../../strategies/shared/edgeRoutingQualityIntent';
import {
  boundedQualityPolishNeedsMicroRepair,
  canSkipLargeDetachedOverlapRepair,
  hasSharedTargetEntryStrictCrossing,
  repairSharedTargetEntryStrictCrossingsIfNeeded,
  separateLargeDetachedParallelOverlapsIfNeeded,
  shouldUseBoundedQualityResidualRepair,
} from '../baseReactFlowDisplayFullRouteQualityPhase';
import {
  shouldUseBoundedPostRenderResidualRepair,
} from '../baseReactFlowDisplayFullRoutePostRenderPhase';
import {
  createDisplayRoutingDefectPlan,
  createDisplayRoutingDefectStagePlan,
  displayRoutingDefectPlanNeedsStrictPrimaryCrossing,
  displayRoutingDefectStageIsScheduled,
  displayRoutingQualityNeedsMicroRepair,
  displayRoutingQualityNeedsTerminalRepair,
} from '../baseReactFlowDisplayRoutingDefectPlan';
import {
  createDisplayRoutingTopologyPlan,
  createDisplayRoutingTopologyWaypointAxes,
} from '../baseReactFlowDisplayRoutingTopologyPlan';
import {
  createBaseReactFlowMovedNodeReconnectCandidates,
  pushBoundedReconnectRankedCandidate,
  resolveReconnectCandidateBudgetPerEdge,
} from '../baseReactFlowDisplayLocalReconnect';
import { chooseExactThresholdResidualCandidate } from '../baseReactFlowDisplayOverlapEvaluation';

const edge = (path: Array<{ x: number; y: number }>): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  data: { computedPath: path },
});

describe('baseReactFlowDisplayEvaluation', () => {
  it('builds bounded O2M/M2O groups, candidate axes, and usable corridors', () => {
    const topologyNodes: Node[] = [
      { id: 's', position: { x: 0, y: 100 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'm', position: { x: 300, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 't', position: { x: 600, y: 100 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const topologyEdges: Edge[] = [
      {
        id: 's-m-a', source: 's', target: 'm', sourceHandle: 'right', targetHandle: 'left',
        data: { flowRole: 'main', computedPath: [{ x: 100, y: 130 }, { x: 300, y: 30 }] },
      },
      {
        id: 's-m-b', source: 's', target: 'm', sourceHandle: 'right', targetHandle: 'left',
        data: { flowRole: 'main', computedPath: [{ x: 100, y: 130 }, { x: 300, y: 30 }] },
      },
      {
        id: 'm-t-a', source: 'm', target: 't', sourceHandle: 'right', targetHandle: 'left',
        data: { flowRole: 'main', computedPath: [{ x: 400, y: 30 }, { x: 600, y: 130 }] },
      },
      {
        id: 'm-t-b', source: 'm', target: 't', sourceHandle: 'right', targetHandle: 'left',
        data: { flowRole: 'main', computedPath: [{ x: 400, y: 30 }, { x: 600, y: 130 }] },
      },
    ];
    const plan = createDisplayRoutingTopologyPlan(topologyNodes, topologyEdges);
    expect(plan).toMatchObject({ nodeCount: 3, edgeCount: 4 });
    expect(plan.groups.some(group => group.kind === 'source' && group.memberEdgeIndexes.length === 2))
      .toBe(true);
    expect(plan.groups.some(group => group.kind === 'target' && group.memberEdgeIndexes.length === 2))
      .toBe(true);
    expect(plan.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ topologyPattern: 'o2m', trunkMode: 'dual', laneDemand: 2 }),
      expect.objectContaining({ topologyPattern: 'm2o', trunkMode: 'dual', laneDemand: 2 }),
    ]));
    expect(plan.candidateAxes.x).toEqual(expect.arrayContaining([0, 100, 300, 400, 600, 700]));
    expect(plan.corridors.some(corridor => corridor.axis === 'vertical' && corridor.capacity > 0))
      .toBe(true);
    expect(plan.corridors.every(corridor => (
      corridor.laneCenters.length === corridor.capacity
      && corridor.laneCenters.every(lane => lane > corridor.start && lane < corridor.end)
    ))).toBe(true);
    expect(createDisplayRoutingTopologyWaypointAxes(plan, false)).toEqual({
      x: plan.corridors
        .filter(corridor => corridor.axis === 'vertical')
        .map(corridor => corridor.center),
      y: plan.corridors
        .filter(corridor => corridor.axis === 'horizontal')
        .map(corridor => corridor.center),
    });
    expect(createDisplayRoutingTopologyWaypointAxes(plan, true)).toBeUndefined();
  });

  it('keeps empty and non-finite topology inputs bounded', () => {
    expect(createDisplayRoutingTopologyPlan([], [])).toEqual({
      nodeCount: 0,
      edgeCount: 0,
      groups: [],
      candidateAxes: { x: [], y: [] },
      corridors: [],
      corridorReservations: { reservations: [], exhaustedGroupIndexes: [] },
    });
    const plan = createDisplayRoutingTopologyPlan([{
      id: 'bad', position: { x: Number.POSITIVE_INFINITY, y: Number.NaN },
      measured: { width: 100, height: 60 }, data: {},
    }], []);
    expect(plan.candidateAxes).toEqual({ x: [], y: [] });
    expect(plan.corridors).toEqual([]);
    expect(createDisplayRoutingTopologyWaypointAxes(plan, false)).toBeUndefined();

    const extremePlan = createDisplayRoutingTopologyPlan([
      {
        id: 'left', position: { x: -1_000_000_000, y: 0 },
        measured: { width: 100, height: 60 }, data: {},
      },
      {
        id: 'right', position: { x: 999_999_900, y: 0 },
        measured: { width: 100, height: 60 }, data: {},
      },
    ], []);
    expect(Math.max(0, ...extremePlan.corridors.map(corridor => corridor.capacity)))
      .toBeLessThanOrEqual(256);
  });

  it('builds a defect-directed stage plan without allowing metric compensation', () => {
    const quality = {
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      relatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      backtrackPenalty: 0,
      detourPenalty: 0,
      bends: 0,
      totalLength: 100,
    };
    expect(createDisplayRoutingDefectPlan({
      candidate: 'polished',
      hardClean: false,
      terminalsAttached: true,
      terminalsAnchored: false,
      obstacleHits: 0,
      quality,
    })).toMatchObject({
      onlyTerminalAxisDefects: true,
      needsTerminalRepair: true,
      needsStrictCrossingRepair: false,
      needsOverlapRepair: false,
      terminalClosureEligible: true,
    });
    expect(createDisplayRoutingDefectPlan({
      candidate: 'polished',
      hardClean: false,
      terminalsAttached: true,
      terminalsAnchored: true,
      obstacleHits: 1,
      quality: { ...quality, strictCrossings: 1, reverseOverlap: 1, hairpins: 1 },
    })).toMatchObject({
      needsObstacleRepair: true,
      needsStrictCrossingRepair: true,
      needsOverlapRepair: true,
      needsMicroRepair: true,
      onlyTerminalAxisDefects: false,
      terminalClosureEligible: false,
    });
    expect(createDisplayRoutingDefectPlan({
      candidate: 'polished',
      hardClean: false,
      terminalsAttached: true,
      terminalsAnchored: true,
      obstacleHits: 2,
      quality: { ...quality, tinyInteriorDoglegs: 2, hairpins: 1 },
    })).toMatchObject({
      needsObstacleRepair: true,
      needsMicroRepair: true,
      terminalClosureEligible: false,
      onlyTerminalAxisDefects: false,
    });
    expect(displayRoutingQualityNeedsMicroRepair(quality)).toBe(false);
    expect(displayRoutingQualityNeedsMicroRepair({ ...quality, hairpins: 1 })).toBe(true);
    expect(displayRoutingQualityNeedsTerminalRepair(quality)).toBe(false);
    expect(displayRoutingQualityNeedsTerminalRepair({
      ...quality,
      shortEndpointStubs: 1,
    })).toBe(true);

    const cleanOverlapPlan = createDisplayRoutingDefectPlan({
      candidate: 'polished',
      hardClean: false,
      terminalsAttached: true,
      terminalsAnchored: true,
      obstacleHits: 1,
      quality: { ...quality, strictCrossings: 1, hairpins: 1 },
    });
    expect(cleanOverlapPlan.orderedStages.map(stage => stage.stage)).toEqual([
      'post-render-residual',
      'strict-primary-overlap',
    ]);
    expect(displayRoutingDefectStageIsScheduled(
      cleanOverlapPlan.orderedStages,
      'strict-primary-overlap',
    )).toBe(false);
    expect(displayRoutingDefectPlanNeedsStrictPrimaryCrossing(cleanOverlapPlan)).toBe(true);
    expect(displayRoutingDefectStageIsScheduled(
      createDisplayRoutingDefectStagePlan(quality),
      'post-render-residual',
    )).toBe(false);
    for (const overlapQuality of [
      { reverseOverlap: 1 },
      { unrelatedOverlap: 1 },
      { unexplainedRelatedOverlap: 1 },
    ]) {
      const overlapPlan = createDisplayRoutingDefectPlan({
        candidate: 'polished',
        hardClean: false,
        terminalsAttached: true,
        terminalsAnchored: true,
        obstacleHits: 0,
        quality: { ...quality, ...overlapQuality },
      });
      expect(displayRoutingDefectStageIsScheduled(
        overlapPlan.orderedStages,
        'strict-primary-overlap',
      )).toBe(true);
      expect(displayRoutingDefectStageIsScheduled(
        overlapPlan.orderedStages,
        'post-render-residual',
      )).toBe(true);
      expect(displayRoutingDefectPlanNeedsStrictPrimaryCrossing(overlapPlan)).toBe(true);
    }
    expect(displayRoutingDefectPlanNeedsStrictPrimaryCrossing(
      createDisplayRoutingDefectPlan({
        candidate: 'polished',
        hardClean: false,
        terminalsAttached: true,
        terminalsAnchored: false,
        obstacleHits: 0,
        quality,
      }),
    )).toBe(false);
  });
  it('bounds post-render residual repair for large routes or hard-overlap handoff', () => {
    expect(shouldUseBoundedPostRenderResidualRepair(false, false)).toBe(false);
    expect(shouldUseBoundedPostRenderResidualRepair(true, false)).toBe(true);
    expect(shouldUseBoundedPostRenderResidualRepair(false, true)).toBe(true);
    expect(shouldUseBoundedPostRenderResidualRepair(true, true)).toBe(true);
  });

  it('bounds residual candidate materialization for medium and large routes', () => {
    expect(shouldUseBoundedQualityResidualRepair(false, 11)).toBe(false);
    expect(shouldUseBoundedQualityResidualRepair(false, 12)).toBe(true);
    expect(shouldUseBoundedQualityResidualRepair(true, 1)).toBe(true);
  });

  it('bounds reconnect candidates before materializing multi-edge transactions', () => {
    expect(resolveReconnectCandidateBudgetPerEdge(1)).toBe(256);
    expect(resolveReconnectCandidateBudgetPerEdge(2)).toBe(256);
    expect(resolveReconnectCandidateBudgetPerEdge(4)).toBe(64);
    expect(resolveReconnectCandidateBudgetPerEdge(5)).toBe(128);
    expect(resolveReconnectCandidateBudgetPerEdge(100)).toBe(256);
    expect(resolveReconnectCandidateBudgetPerEdge(0)).toBe(0);
    expect(resolveReconnectCandidateBudgetPerEdge(Number.NaN)).toBe(0);
  });

  it('retains only the stable best reconnect ranks while candidates stream in', () => {
    const ranked: Array<{ id: string; hardDefects: number; score: number }> = [];
    for (const candidate of [
      { id: 'late', hardDefects: 2, score: 4 },
      { id: 'first-tie', hardDefects: 0, score: 2 },
      { id: 'best', hardDefects: 0, score: 1 },
      { id: 'second-tie', hardDefects: 0, score: 2 },
    ]) pushBoundedReconnectRankedCandidate(ranked, candidate, 2);

    expect(ranked.map(candidate => candidate.id)).toEqual(['best', 'first-tie']);
    pushBoundedReconnectRankedCandidate(ranked, { id: 'ignored', hardDefects: 0, score: 0 }, 0);
    expect(ranked.map(candidate => candidate.id)).toEqual(['best', 'first-tie']);

    const candidates = Array.from({ length: 200 }, (_, index) => ({
      id: `candidate-${index}`,
      hardDefects: (index * 7) % 5,
      score: (index * 11) % 13,
    }));
    for (let limit = 1; limit <= 8; limit += 1) {
      const bounded: typeof candidates = [];
      for (const candidate of candidates) {
        pushBoundedReconnectRankedCandidate(bounded, candidate, limit);
      }
      const legacy = candidates.toSorted((first, second) => (
        first.hardDefects - second.hardDefects || first.score - second.score
      )).slice(0, limit);
      expect(bounded.map(candidate => candidate.id)).toEqual(
        legacy.map(candidate => candidate.id),
      );
    }
  });

  it('reports bounded reconnect generation and ranking subphases without graph content', () => {
    const nodes: Node[] = [
      {
        id: 'private-source',
        position: { x: 0, y: 0 },
        measured: { width: 100, height: 60 },
        data: {},
      },
      {
        id: 'private-target',
        position: { x: 320, y: 0 },
        measured: { width: 100, height: 60 },
        data: {},
      },
    ];
    const baselineEdges: Edge[] = [{
      id: 'private-edge',
      source: 'private-source',
      target: 'private-target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
      },
    }];
    const traces: Array<Record<string, unknown>> = [];
    const diagnostics: Array<Record<string, unknown>> = [];

    const candidates = createBaseReactFlowMovedNodeReconnectCandidates({
      baselineEdges,
      nodes,
      changedNodeIds: ['private-target'],
      mutableEdgeIds: ['private-edge'],
      beamWidth: 1,
      onDiagnostics: value => diagnostics.push(value),
      onPhaseTrace: value => traces.push(value),
    });

    expect(candidates).toHaveLength(1);
    expect(diagnostics).toEqual([expect.objectContaining({
      generatedPathCount: expect.any(Number),
      evaluatedPathCount: expect.any(Number),
    })]);
    expect(traces.map(trace => trace.phase)).toEqual(expect.arrayContaining([
      'local-reconnect-setup',
      'local-reconnect-path-generation',
      'local-reconnect-ranking',
      'local-reconnect-strict-scan',
    ]));
    const generation = traces.find(trace => trace.phase === 'local-reconnect-path-generation');
    expect(generation).toMatchObject({
      parentPhase: 'local-reconnect-seed',
      candidateCount: expect.any(Number),
      evaluationCount: 256,
      workItemCount: 1,
      budgetCount: 256,
      underBudgetCount: expect.any(Number),
      minimumCandidateCount: expect.any(Number),
      maximumCandidateCount: expect.any(Number),
    });
    expect(JSON.stringify({ traces, diagnostics })).not.toContain('private-');

    const retained = createBaseReactFlowMovedNodeReconnectCandidates({
      baselineEdges,
      nodes,
      changedNodeIds: ['private-target'],
      mutableEdgeIds: ['private-edge'],
      beamWidth: 2,
    });
    expect(retained).toHaveLength(2);
    expect(retained[0]).not.toBe(retained[1]);
    expect(retained[0][0]).not.toBe(retained[1][0]);
    expect(retained[0][0].data?.computedPath).not.toEqual(
      retained[1][0].data?.computedPath,
    );
  });

  it('tokenizes only explicit routing-quality intent flags', () => {
    const intentEdge = edge([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(edgeRoutingQualityIntentToken(intentEdge)).toBe('0000');
    expect(edgeRoutingQualityIntentToken({
      ...intentEdge,
      data: {
        sharedTrunkSynthesized: true,
        sharedTrunkAware: true,
        isTreeBus: true,
        treeRouting: {},
        unrelatedBusinessPayload: 'x'.repeat(100_000),
      },
    })).toBe('1111');
    expect(edgeRoutingQualityIntentToken({
      ...intentEdge,
      data: {
        sharedTrunkSynthesized: 'true',
        sharedTrunkAware: 1,
        isTreeBus: false,
        treeRouting: null,
      } as any,
    })).toBe('0000');
    expect(edgeRoutingQualityIntentToken({ ...intentEdge, data: [] as any })).toBe('0000');
  });

  it('returns immediately when candidate pools only repeat the baseline reference', () => {
    const inaccessibleEdge = new Proxy({} as Edge, {
      get() {
        throw new Error('the baseline should not be evaluated');
      },
    });
    const baseline = [inaccessibleEdge];

    expect(chooseFinalVisualPolishCandidate(baseline, baseline, baseline)).toBe(baseline);
    expect(chooseFinalObstacleAwarePolishCandidate([], baseline, baseline, baseline)).toBe(baseline);
    expect(chooseFinalTerminalTransactionCandidate([], baseline, baseline, baseline)).toBe(baseline);
    expect(chooseDisplayStrictPolishCandidate([], baseline, baseline, baseline)).toBe(baseline);
  });

  it('deduplicates candidate arrays by routing signature while preserving the first route', () => {
    const baseline = [edge([{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    const styleOnlyClone = [{ ...baseline[0], style: { strokeWidth: 4 } }];
    const changed = [edge([{ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 120, y: 20 }])];
    const changedClone = changed.map(candidate => ({ ...candidate }));

    expect(uniqueDisplayRoutingCandidates(
      baseline,
      [styleOnlyClone, changed, changedClone],
    )).toEqual([changed]);
    expect(chooseExactThresholdResidualCandidate([], baseline, styleOnlyClone)).toBe(baseline);
  });

  it('short-circuits only exact no-op full-route quality repair families', () => {
    const cleanEdges: Edge[] = Array.from({ length: 25 }, (_, index) => ({
      ...edge([
        { x: 0, y: index * 40 },
        { x: 100, y: index * 40 },
      ]),
      id: `clean-${index}`,
      source: `source-${index}`,
      target: `target-${index}`,
    }));
    const cleanQuality = calculateEdgePathQualityScore(cleanEdges);
    const detachedRepair = vi.fn(() => [...cleanEdges]);

    expect(cleanQuality.strictCrossings).toBe(0);
    const targetRepair = vi.fn(() => [...cleanEdges]);
    expect(hasSharedTargetEntryStrictCrossing(cleanEdges)).toBe(false);
    expect(repairSharedTargetEntryStrictCrossingsIfNeeded(cleanEdges, targetRepair)).toBe(cleanEdges);
    expect(targetRepair).not.toHaveBeenCalled();
    expect(canSkipLargeDetachedOverlapRepair(24, cleanQuality)).toBe(false);
    expect(canSkipLargeDetachedOverlapRepair(25, cleanQuality)).toBe(true);
    expect(boundedQualityPolishNeedsMicroRepair(cleanQuality)).toBe(false);
    expect(separateLargeDetachedParallelOverlapsIfNeeded(
      cleanEdges,
      [],
      16,
      {},
      detachedRepair,
      vi.fn(() => cleanQuality),
    )).toBe(cleanEdges);
    expect(detachedRepair).not.toHaveBeenCalled();

    const smallRepair = vi.fn((candidate: Edge[]) => candidate);
    const unusedSmallQualityEvaluation = vi.fn(() => cleanQuality);
    const smallEdges = cleanEdges.slice(0, 14);
    expect(separateLargeDetachedParallelOverlapsIfNeeded(
      smallEdges,
      [],
      16,
      {},
      smallRepair,
      unusedSmallQualityEvaluation,
    )).toBe(smallEdges);
    expect(unusedSmallQualityEvaluation).not.toHaveBeenCalled();
    expect(smallRepair).toHaveBeenCalledOnce();

    const tinyDoglegQuality = calculateEdgePathQualityScore([
      edge([
        { x: 0, y: 0 },
        { x: 0, y: 80 },
        { x: 8, y: 80 },
        { x: 8, y: 160 },
      ]),
    ]);
    expect(boundedQualityPolishNeedsMicroRepair(tinyDoglegQuality)).toBe(true);

    const unrelatedStrictEdges: Edge[] = [
      {
        ...edge([{ x: 50, y: 0 }, { x: 50, y: 100 }]),
        id: 'vertical',
        source: 'vertical-source',
        target: 'vertical-target',
      },
      {
        ...edge([{ x: 0, y: 50 }, { x: 100, y: 50 }]),
        id: 'horizontal',
        source: 'horizontal-source',
        target: 'horizontal-target',
      },
    ];
    expect(hasSharedTargetEntryStrictCrossing(unrelatedStrictEdges)).toBe(false);
    expect(repairSharedTargetEntryStrictCrossingsIfNeeded(
      unrelatedStrictEdges,
      targetRepair,
    )).toBe(unrelatedStrictEdges);
    expect(targetRepair).not.toHaveBeenCalled();

    const strictEdges: Edge[] = [
      {
        ...edge([
          { x: 50, y: 0 },
          { x: 50, y: 100 },
          { x: 80, y: 100 },
          { x: 80, y: 150 },
        ]),
        id: 'shared-vertical',
        source: 'vertical-source',
        target: 'shared-target',
      },
      {
        ...edge([
          { x: 0, y: 0.75 },
          { x: 100, y: 0.75 },
          { x: 100, y: 160 },
          { x: 80, y: 160 },
        ]),
        id: 'shared-horizontal',
        source: 'horizontal-source',
        target: 'shared-target',
      },
    ];
    expect(calculateEdgePathQualityScore(strictEdges).strictCrossings).toBe(1);
    expect(hasSharedTargetEntryStrictCrossing(strictEdges)).toBe(true);
    const delegatedTarget = [...strictEdges];
    targetRepair.mockReturnValue(delegatedTarget);
    expect(repairSharedTargetEntryStrictCrossingsIfNeeded(strictEdges, targetRepair)).toBe(
      delegatedTarget,
    );
    expect(targetRepair).toHaveBeenCalledOnce();

    const hardOverlapEdges: Edge[] = [
      {
        ...edge([{ x: 0, y: 0 }, { x: 100, y: 0 }]),
        id: 'forward',
        source: 'forward-source',
        target: 'forward-target',
      },
      {
        ...edge([{ x: 100, y: 0 }, { x: 0, y: 0 }]),
        id: 'reverse',
        source: 'reverse-source',
        target: 'reverse-target',
      },
      ...cleanEdges.slice(2),
    ];
    const hardOverlapQuality = calculateEdgePathQualityScore(hardOverlapEdges);
    expect(hardOverlapQuality.reverseOverlap).toBeGreaterThan(0);
    expect(canSkipLargeDetachedOverlapRepair(25, hardOverlapQuality)).toBe(false);
    const delegatedDetached = [...hardOverlapEdges];
    detachedRepair.mockReturnValue(delegatedDetached);
    expect(separateLargeDetachedParallelOverlapsIfNeeded(
      hardOverlapEdges,
      [],
      16,
      {},
      detachedRepair,
    )).toBe(delegatedDetached);
    expect(detachedRepair).toHaveBeenCalledOnce();
  });

  it('reuses a proven detached no-op for routing-equivalent immutable inputs', () => {
    const baseline: Edge[] = [
      {
        ...edge([{ x: 0, y: 0 }, { x: 100, y: 0 }]),
        id: 'detached-noop-forward',
        source: 'detached-noop-source-a',
        target: 'detached-noop-target-a',
      },
      {
        ...edge([{ x: 100, y: 0 }, { x: 0, y: 0 }]),
        id: 'detached-noop-reverse',
        source: 'detached-noop-source-b',
        target: 'detached-noop-target-b',
      },
    ];
    const repair = vi.fn((candidate: Edge[]) => candidate);
    const options = { maxQualityEvaluations: 1 };

    expect(separateLargeDetachedParallelOverlapsIfNeeded(
      baseline,
      [],
      16,
      options,
      repair,
    )).toBe(baseline);
    const equivalent = baseline.map(candidate => ({
      ...candidate,
      style: { strokeWidth: 4 },
      data: { ...candidate.data },
    }));
    expect(separateLargeDetachedParallelOverlapsIfNeeded(
      equivalent,
      [],
      16,
      options,
      repair,
    )).toBe(equivalent);
    expect(repair).toHaveBeenCalledOnce();
  });

  it('reuses baseline obstacle hits while preserving in-place mutation invalidation', () => {
    const baseline = [edge([{ x: 0, y: 60 }, { x: 100, y: 60 }])];
    const nodes: Node[] = [{
      id: 'obstacle',
      position: { x: 40, y: -10 },
      data: {},
      width: 20,
      height: 20,
      measured: { width: 20, height: 20 },
    }];
    const context = createDisplayObstacleEvaluationContext(baseline, nodes);
    expect(createDisplayObstacleEvaluationContext(baseline, nodes)).toBe(context);

    expect(context.evaluate(baseline)).toBe(countDisplayObstacleHits(baseline, nodes));
    expect(context.evaluateChanged(baseline, [])).toBe(countDisplayObstacleHits(baseline, nodes));

    (baseline[0].data as { computedPath: Array<{ x: number; y: number }> }).computedPath = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const expected = countDisplayObstacleHits(baseline, nodes);
    expect(context.evaluate(baseline)).toBe(expected);
    expect(context.evaluateChanged(baseline, [])).toBe(expected);
    expect(evaluateDisplayObstacleCandidate(context, baseline, baseline)).toBe(expected);
    const pathMutatedContext = createDisplayObstacleEvaluationContext(baseline, nodes);
    expect(pathMutatedContext).not.toBe(context);
    expect(pathMutatedContext.evaluate(baseline)).toBe(expected);

    nodes[0].position = { x: 40, y: 100 };
    const nodeMutatedContext = createDisplayObstacleEvaluationContext(baseline, nodes);
    expect(nodeMutatedContext).not.toBe(pathMutatedContext);
    expect(nodeMutatedContext.evaluate(baseline)).toBe(0);
    expect(pathMutatedContext.evaluate(baseline)).toBe(0);
  });

  it('does not reuse obstacle contexts across different input array identities', () => {
    const baseline = [edge([{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    const nodes: Node[] = [{
      id: 'obstacle',
      position: { x: 40, y: -10 },
      data: {},
      width: 20,
      height: 20,
      measured: { width: 20, height: 20 },
    }];
    const context = createDisplayObstacleEvaluationContext(baseline, nodes);

    expect(createDisplayObstacleEvaluationContext([...baseline], nodes)).not.toBe(context);
    expect(createDisplayObstacleEvaluationContext(baseline, [...nodes])).not.toBe(context);
  });

  it('invalidates per-edge obstacle reports for path, endpoint, and node geometry mutations', () => {
    const nodes: Node[] = [{
      id: 'obstacle',
      position: { x: 40, y: 20 },
      data: {},
      width: 20,
      height: 20,
      measured: { width: 20, height: 20 },
    }];
    const unrelated = [edge([{ x: 0, y: 15 }, { x: 100, y: 15 }])];

    expect(countDisplayObstacleHits(unrelated, nodes)).toBe(1);
    expect(countDisplayObstacleHits([...unrelated], nodes)).toBe(1);

    const endpoint = [{ ...unrelated[0], source: 'obstacle' }];
    expect(countDisplayObstacleHits(endpoint, nodes)).toBe(0);
    (endpoint[0].data as any).computedPath = [
      { x: 0, y: 30 }, { x: 100, y: 30 },
    ];
    expect(countDisplayObstacleHits(endpoint, nodes)).toBe(1);

    nodes[0].position = { x: 40, y: 100 };
    expect(countDisplayObstacleHits(endpoint, nodes)).toBe(0);
  });

  it('keeps trusted single- and multi-edge obstacle deltas identical to a full evaluation', () => {
    const baseline: Edge[] = [
      { ...edge([{ x: 0, y: 0 }, { x: 100, y: 0 }]), id: 'first' },
      { ...edge([{ x: 0, y: 30 }, { x: 100, y: 30 }]), id: 'second' },
      { ...edge([{ x: 0, y: 60 }, { x: 100, y: 60 }]), id: 'third' },
    ];
    const nodes: Node[] = [{
      id: 'obstacle',
      position: { x: 40, y: 20 },
      data: {},
      width: 20,
      height: 20,
      measured: { width: 20, height: 20 },
    }];
    const context = createDisplayObstacleEvaluationContext(baseline, nodes);
    const oneChanged = baseline.map((item, index) => index === 0
      ? { ...item, data: { computedPath: [{ x: 0, y: 30 }, { x: 100, y: 30 }] } }
      : item);
    const twoChanged = oneChanged.map((item, index) => index === 2
      ? { ...item, data: { computedPath: [{ x: 0, y: 90 }, { x: 100, y: 90 }] } }
      : item);

    expect(context.evaluateKnownChanges(oneChanged, [0])).toBe(countDisplayObstacleHits(oneChanged, nodes));
    expect(context.evaluateKnownChanges(twoChanged, [0, 2])).toBe(countDisplayObstacleHits(twoChanged, nodes));
  });

  it('keeps the validated delta API exact when a caller omits or corrupts changed indexes', () => {
    const baseline = [edge([{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    const nodes: Node[] = [{
      id: 'obstacle',
      position: { x: 40, y: 20 },
      data: {},
      width: 20,
      height: 20,
      measured: { width: 20, height: 20 },
    }];
    const candidate = [{
      ...baseline[0],
      data: { computedPath: [{ x: 0, y: 30 }, { x: 100, y: 30 }] },
    }];
    const expected = countDisplayObstacleHits(candidate, nodes);
    const context = createDisplayObstacleEvaluationContext(baseline, nodes);

    expect(context.evaluateChanged(candidate, [])).toBe(expected);
    expect(context.evaluateKnownChanges(candidate, [-1])).toBe(expected);
    expect(context.evaluateKnownChanges([...candidate, candidate[0]], [0])).toBe(
      countDisplayObstacleHits([...candidate, candidate[0]], nodes),
    );
  });

  it('keeps strict-crossing metrics equivalent for edges that share a terminal node', () => {
    const edges: Edge[] = [
      {
        ...edge([{ x: 255, y: 453 }, { x: 255, y: 613 }]),
        id: 'order-to-atc',
        source: 'order',
        target: 'atc',
      },
      {
        ...edge([
          { x: 516, y: 2123 },
          { x: 516, y: 2195 },
          { x: 111, y: 2195 },
          { x: 111, y: 525 },
          { x: 267, y: 525 },
          { x: 267, y: 453 },
        ]),
        id: 'execution-to-order',
        source: 'execution',
        target: 'order',
      },
    ];

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    expect(countStrictEdgeCrossings(edges)).toBe(1);
    expect(findDisplayStrictCrossingHits(edges)).toHaveLength(1);
    expect(countDisplayStrictCrossings(edges)).toBe(1);
    expect(getDisplayHardQualityGateReport(
      edges,
      [],
      'polished',
      () => ({ terminalsAttached: true, terminalsAnchored: true }),
    ).hardClean).toBe(false);
  });

  it('rejects crossings hidden behind redundant collinear render waypoints', () => {
    const edges: Edge[] = [
      {
        ...edge([
          { x: 40, y: 0 },
          { x: 40, y: 60 },
          { x: 40, y: 100 },
        ]),
        id: 'split-vertical',
        source: 'shared',
        target: 'vertical-target',
      },
      {
        ...edge([{ x: 0, y: 60 }, { x: 80, y: 60 }]),
        id: 'horizontal',
        source: 'shared',
        target: 'horizontal-target',
      },
    ];

    expect(countStrictEdgeCrossings(edges)).toBe(0);
    expect(countDisplayStrictCrossings(edges)).toBe(1);
    const report = getDisplayHardQualityGateReport(
      edges,
      [],
      'polished',
      () => ({ terminalsAttached: true, terminalsAnchored: true }),
    );
    expect(report.quality.strictCrossings).toBe(1);
    expect(report.hardClean).toBe(false);
  });

  it('re-evaluates terminal semantics for each hard-gate evaluator', () => {
    const edges = [edge([
      { x: 0, y: 0 },
      { x: 0, y: 48 },
      { x: 100, y: 48 },
      { x: 100, y: 96 },
    ])];
    const nodes: Node[] = [];

    const permissive = getDisplayHardQualityGateReport(
      edges,
      nodes,
      'polished',
      () => ({ terminalsAttached: true, terminalsAnchored: true }),
    );
    const strict = getDisplayHardQualityGateReport(
      edges,
      nodes,
      'polished',
      () => ({ terminalsAttached: true, terminalsAnchored: false }),
    );

    expect(permissive.hardClean).toBe(true);
    expect(strict.terminalsAnchored).toBe(false);
    expect(strict.hardClean).toBe(false);
    expect(strict.quality).toBe(permissive.quality);
  });

  it('reports unrelated business-node clearance below 16px without misclassifying it as a hard error', () => {
    const nodes: Node[] = [
      {
        id: 'source',
        position: { x: 0, y: 0 },
        data: {},
        measured: { width: 20, height: 20 },
      },
      {
        id: 'target',
        position: { x: 120, y: 0 },
        data: {},
        measured: { width: 20, height: 20 },
      },
      {
        id: 'unrelated',
        position: { x: 50, y: 30 },
        data: {},
        measured: { width: 20, height: 20 },
      },
    ];
    const terminalsAreClean = () => ({ terminalsAttached: true, terminalsAnchored: true });
    const tooClose = [edge([{ x: 20, y: 20 }, { x: 120, y: 20 }])];
    const atBoundary = [edge([{ x: 20, y: 14 }, { x: 120, y: 14 }])];

    const rejected = getDisplayHardQualityGateReport(
      tooClose,
      nodes,
      'polished',
      terminalsAreClean,
    );
    const accepted = getDisplayHardQualityGateReport(
      atBoundary,
      nodes,
      'polished',
      terminalsAreClean,
    );

    expect(rejected.obstacleHits).toBe(0);
    expect(rejected.minimumClearanceViolations).toBe(1);
    expect(rejected.minimumClearanceViolationEdgeIds).toEqual(['edge']);
    expect(rejected.hardClean).toBe(true);
    expect(accepted.minimumClearanceViolations).toBe(0);
    expect(accepted.hardClean).toBe(true);
  });

  it('invalidates a same-array hard report when shared-trunk intent mutates', () => {
    const sharedOverlap: Edge[] = [
      {
        id: 'first',
        source: 'shared-source',
        target: 'first-target',
        data: {
          computedPath: [
            { x: 0, y: 0 }, { x: 0, y: 48 }, { x: 48, y: 48 },
            { x: 48, y: 96 }, { x: 160, y: 96 }, { x: 160, y: 160 },
          ],
        },
      },
      {
        id: 'second',
        source: 'shared-source',
        target: 'second-target',
        data: {
          computedPath: [
            { x: 20, y: 0 }, { x: 20, y: 48 }, { x: 68, y: 48 },
            { x: 68, y: 96 }, { x: 120, y: 96 }, { x: 120, y: 160 },
          ],
        },
      },
    ];
    const terminalsAreClean = () => ({ terminalsAttached: true, terminalsAnchored: true });
    const before = getDisplayHardQualityGateReport(
      sharedOverlap,
      [],
      'polished',
      terminalsAreClean,
    );
    expect(before.quality.unexplainedRelatedOverlap).toBeGreaterThan(0);

    sharedOverlap.forEach((item) => {
      item.data = { ...(item.data || {}), sharedTrunkAware: true };
    });
    const after = getDisplayHardQualityGateReport(
      sharedOverlap,
      [],
      'polished',
      terminalsAreClean,
    );

    expect(after.quality.unexplainedRelatedOverlap).toBe(
      before.quality.unexplainedRelatedOverlap,
    );
    expect(after.quality).not.toBe(before.quality);
  });
});
