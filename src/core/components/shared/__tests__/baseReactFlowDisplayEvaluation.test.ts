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
} from '../baseReactFlowDisplayEvaluation';
import { findDisplayStrictCrossingHits } from '../baseReactFlowDisplayGeometry';
import {
  edgeRoutingQualityIntentToken,
  parseEdgeRoutingQualityIntent,
} from '../../../strategies/shared/edgeRoutingQualityIntent';
import {
  canSkipLargeDetachedOverlapRepair,
  hasSharedTargetEntryStrictCrossing,
  repairSharedTargetEntryStrictCrossingsIfNeeded,
  separateLargeDetachedParallelOverlapsIfNeeded,
} from '../baseReactFlowDisplayFullRouteQualityPhase';

const edge = (path: Array<{ x: number; y: number }>): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  data: { computedPath: path },
});

describe('baseReactFlowDisplayEvaluation', () => {
  it('parses only explicit routing-quality intent flags', () => {
    const intentEdge = edge([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(parseEdgeRoutingQualityIntent(intentEdge)).toEqual({
      sharedTrunkSynthesized: false,
      sharedTrunkAware: false,
      isTreeBus: false,
      hasTreeRouting: false,
    });
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
    expect(separateLargeDetachedParallelOverlapsIfNeeded(
      cleanEdges,
      [],
      16,
      {},
      detachedRepair,
    )).toBe(cleanEdges);
    expect(detachedRepair).not.toHaveBeenCalled();

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
