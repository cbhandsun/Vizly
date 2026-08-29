import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  chooseDistinctQualitySeedCandidate,
  createBaseReactFlowInteractiveDisplayEdges,
  getInteractiveGlobalCandidateEdgeBudget,
} from '../baseReactFlowDisplayQualitySeedPipeline';
import { createBaseReactFlowPreDisplayFinalEdges } from '../baseReactFlowDisplayPreDisplayPipeline';
import { repairBoundedReverseParallelOverlaps } from '../baseReactFlowDisplayReverseParallelOverlapClosure';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import {
  edgeNodeObstacleHits,
  edgeOverlapProblems,
  lockedEdge,
  node,
  renderedSystemsInteractionDisplayEdges,
  shortEndpointSegments,
  strictPathCrossings,
  tinyInteriorSegments,
} from './baseReactFlowDisplayEdges.testUtils';

describe('baseReactFlowDisplayEdges local repairs', () => {
  it('scores equivalent quality seed paths once and keeps the first candidate reference', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ];
    const first: Edge[] = [lockedEdge('first', 'source', 'target', path)];
    const equivalent: Edge[] = [lockedEdge(
      'equivalent-copy',
      'source',
      'target',
      path.map(point => ({ ...point })),
    )];
    const score = vi.fn((_candidate: Edge[]) => 0);
    const choose = (...candidates: Edge[][]): Edge[] => {
      candidates.forEach(candidate => score(candidate));
      return candidates[0];
    };

    const result = chooseDistinctQualitySeedCandidate([first, equivalent], choose);

    expect(score).toHaveBeenCalledTimes(1);
    expect(score).toHaveBeenCalledWith(first);
    expect(result).toBe(first);
  });

  it('does not merge equal paths whose complete quality inputs differ', () => {
    const first: Edge[] = [{
      ...lockedEdge('first', 'source', 'target', [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ]),
      sourceHandle: 'right-source',
    }];
    const distinct: Edge[] = [{
      ...first[0],
      id: 'distinct-handle',
      sourceHandle: 'left-source',
    }];
    const scoredCandidates: Edge[][] = [];

    chooseDistinctQualitySeedCandidate([first, distinct], (...candidates) => {
      scoredCandidates.push(...candidates);
      return candidates[0];
    });

    expect(scoredCandidates).toEqual([first, distinct]);
  });

  it('bounds deferred global seed work without reducing direct interactive quality', () => {
    expect(getInteractiveGlobalCandidateEdgeBudget(24, true)).toBeUndefined();
    expect(getInteractiveGlobalCandidateEdgeBudget(25, true)).toBe(12);
    expect(getInteractiveGlobalCandidateEdgeBudget(10_000, true)).toBe(12);
    expect(getInteractiveGlobalCandidateEdgeBudget(25, false)).toBeUndefined();
  });

  it('keeps interactive systems-interaction display paths on readable outer lanes', () => {
    const nodes: Node[] = [
      node('sales-channels', 148.725, 80, 335.998, 118.993),
      node('master-data', 100, 587, 420, 157.995),
      node('oms-order', 132.2, 977, 363.993, 157.995),
      node('oms-atc', 140.7, 1295, 346.997, 157.995),
      node('oms-fulfill', 148.2, 1613, 331.997, 157.995),
      node('wms-inventory', 142.161, 2171, 335.998, 157.995),
      node('wms-outbound', 115.161, 2489, 390, 157.995),
      node('tms-planning', 141.161, 2807, 337.995, 157.995),
      node('tms-execution', 100.661, 3125, 418.993, 157.995),
      node('carrier-partner', 213.266, 3683, 222.995, 67.995),
      node('customer', 234.266, 3911, 180.998, 67.995),
    ];
    const edges = renderedSystemsInteractionDisplayEdges();
    const phaseTrace: DisplayRoutingPhaseTrace[] = [];

    const result = createBaseReactFlowInteractiveDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 801,
      deferOuterObstacleRepair: true,
      onPhaseTrace: trace => phaseTrace.push(trace),
    });
    const paths = result.map((edge) => ({
      id: edge.id,
      path: (edge.data as { computedPath: Array<{ x: number; y: number }> }).computedPath,
    }));
    const returnPath = paths.find(path => path.id === 'edge-tms-execution-oms-order')?.path ?? [];

    expect(strictPathCrossings(paths), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(edgeNodeObstacleHits(result, nodes), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(tinyInteriorSegments(returnPath)).toEqual([]);
    expect(shortEndpointSegments(returnPath)).toEqual([]);
    expect(Math.min(...returnPath.map(point => point.x))).toBeLessThanOrEqual(120);
    expect(phaseTrace.map(trace => trace.phase)).toEqual([
      'seed-interactive-normalize',
      'seed-interactive-endpoint-seed',
      'seed-interactive-trunk-seed',
      'seed-interactive-local-seed',
      'seed-interactive-crossing-repair',
      'seed-interactive-lane-repair',
      'seed-interactive-global-route',
      'seed-interactive-local-polish',
      'seed-interactive-detached-repair',
      'seed-interactive-endpoint-final',
      'seed-interactive-finish-projection',
      'seed-interactive-finish-hard-gate',
      'seed-interactive-finish-micro',
      'seed-interactive-finish-local',
      'seed-interactive-finish-obstacle',
      'seed-interactive-finish-commit',
      'seed-interactive-finish',
    ]);
    const endpointLaneTrace = phaseTrace.find(
      trace => trace.phase === 'seed-interactive-lane-repair',
    );
    expect(endpointLaneTrace).toMatchObject({
      evaluationCount: expect.any(Number),
      scannedSegmentCount: expect.any(Number),
    });
    expect(endpointLaneTrace?.candidateCount).toBeGreaterThan(0);
    expect(phaseTrace.filter(trace => trace !== endpointLaneTrace).every(
      trace => trace.candidateCount === edges.length,
    )).toBe(true);
    expect(phaseTrace.every(trace => trace.changedEdgeCount <= edges.length)).toBe(true);
    expect(phaseTrace.filter(trace => trace.phase.startsWith('seed-interactive-finish-')).every(
      trace => trace.parentPhase === 'seed-interactive-finish',
    )).toBe(true);
  }, 45_000);

  it('separates unrelated BMS and YMS middle lanes in the pre-display final path', () => {
    const nodes: Node[] = [
      node('tms', 132, 278, 371, 194),
      node('wms', 132, 628, 371, 208),
      node('bms', 805, 137, 334, 174),
      node('yms', 800, 479, 344, 178),
    ];
    const edges: Edge[] = [
      lockedEdge('wms-bms', 'wms', 'bms', [
        { x: 318, y: 628 }, { x: 318, y: 580 }, { x: 645, y: 580 },
        { x: 645, y: 359 }, { x: 972, y: 359 }, { x: 972, y: 311 },
      ]),
      lockedEdge('tms-yms', 'tms', 'yms', [
        { x: 318, y: 472 }, { x: 318, y: 520 }, { x: 645, y: 520 },
        { x: 645, y: 568 }, { x: 800, y: 568 },
      ]),
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    expect(baseline.reverseOverlap).toBeGreaterThan(0);
    expect(baseline.unrelatedOverlap).toBeGreaterThan(0);

    const result = createBaseReactFlowPreDisplayFinalEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 802,
    });
    const quality = calculateEdgePathQualityScore(result);
    expect({
      nonOrthogonalSegments: quality.nonOrthogonalSegments,
      strictCrossings: quality.strictCrossings,
      reverseOverlap: quality.reverseOverlap,
      unrelatedOverlap: quality.unrelatedOverlap,
      unexplainedRelatedOverlap: quality.unexplainedRelatedOverlap,
    }).toEqual({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
    });
    expect(edgeNodeObstacleHits(result, nodes)).toEqual([]);
  }, 45_000);

  it('repairs bounded opposite-direction WMS overlaps without adding strict crossings', () => {
    const edges: Edge[] = [
      lockedEdge('reservation', 'allocation', 'reservation-node', [
        { x: 1114, y: 1418 }, { x: 1114, y: 1466 }, { x: 1385, y: 1466 },
        { x: 1385, y: 1233 }, { x: 1444, y: 1233 },
      ]),
      lockedEdge('feedback', 'labor', 'allocation', [
        { x: 1257, y: 60 }, { x: 1257, y: 1306 }, { x: 1209, y: 1306 },
        { x: 1209, y: 1466 }, { x: 1115, y: 1466 },
      ]),
      lockedEdge('replenish', 'task', 'replenish-node', [
        { x: 1960, y: 1198 }, { x: 2032, y: 1198 }, { x: 2032, y: 1225 },
        { x: 2232, y: 1225 }, { x: 2232, y: 1020 }, { x: 2287, y: 1020 },
      ]),
      lockedEdge('taskgroup', 'task', 'taskgroup-node', [
        { x: 1961, y: 1246 }, { x: 2032, y: 1246 }, { x: 2032, y: 972 },
        { x: 2578, y: 972 }, { x: 2578, y: 1253 }, { x: 2650, y: 1253 },
      ]),
    ];
    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairBoundedReverseParallelOverlaps(edges, [], 8);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.reverseOverlap).toBe(121);
    expect(quality.reverseOverlap, JSON.stringify(edgeOverlapProblems(repaired), null, 2)).toBe(0);
    expect(quality.strictCrossings).toBe(0);
  });
});
