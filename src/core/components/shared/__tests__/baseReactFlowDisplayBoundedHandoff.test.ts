import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createBaseReactFlowFullRouteEdges,
  selectBaseReactFlowFullRouteSeedEdges,
} from '../baseReactFlowDisplayFullRoutePipeline';
import { prepareBaseReactFlowFullRouteSeed } from '../baseReactFlowDisplayFullRouteSeedPhase';
import { computeBaseReactFlowDisplayEdgeEpoch } from '../baseReactFlowDisplayEdgeCore';
import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { baseNodes } from './baseReactFlowDisplayEdges.testUtils';

const hardCleanReport: BaseDisplayBoundedCandidateReport = {
  candidate: 'polished',
  hardClean: true,
  obstacleHits: 0,
  terminalsAttached: true,
  terminalsAnchored: true,
  quality: {
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
    totalLength: 0,
  },
};

describe('bounded pre-display handoff', () => {
  it('preserves the supplied evaluation node identity through full-route preparation', () => {
    const edges: Edge[] = [{
      id: 'session-seed',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [{ x: 100, y: 230 }, { x: 300, y: 30 }],
      },
    }];
    const evaluationSession = createBaseReactFlowFinalEndpointEvaluation(baseNodes);
    const result = prepareBaseReactFlowFullRouteSeed({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      forceFullQuality: true,
      skipBoundedAttempt: true,
      skipFinalizedReuse: true,
      displayEdgeEpoch: 1,
      evaluationSession,
    });

    expect(result.kind).toBe('continue');
    if (result.kind !== 'continue') return;
    expect(result.context.repairNodes).toBe(evaluationSession.nodes);
    expect(result.context.evaluationSession).toBe(evaluationSession);
  });

  it('builds the topology plan before the full-quality candidate phases run', () => {
    const edges: Edge[] = [{
      id: 'topology-seed',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 100, y: 230 },
          { x: 200, y: 200 },
          { x: 200, y: 30 },
          { x: 300, y: 30 },
        ],
      },
    }];
    const result = prepareBaseReactFlowFullRouteSeed({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      forceFullQuality: true,
      skipBoundedAttempt: true,
      skipFinalizedReuse: true,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges }),
    });

    expect(result.kind).toBe('continue');
    if (result.kind !== 'continue') return;
    expect(result.context.topologyPlan).toMatchObject({
      nodeCount: baseNodes.length,
      edgeCount: edges.length,
    });
    expect(result.context.topologyPlan.candidateAxes.x).toEqual(
      expect.arrayContaining([100, 200, 300]),
    );
  });

  it('keeps the prepared seed reference without mutating either phase input', () => {
    const rawEdges = [{ id: 'raw', source: 'a', target: 'b' }] as Edge[];
    const preparedEdges = [{
      ...rawEdges[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: 0, y: 100 }] },
    }] as Edge[];
    const rawSnapshot = structuredClone(rawEdges);
    const preparedSnapshot = structuredClone(preparedEdges);

    expect(selectBaseReactFlowFullRouteSeedEdges(rawEdges, preparedEdges)).toBe(preparedEdges);
    expect(selectBaseReactFlowFullRouteSeedEdges(rawEdges, null)).toBe(rawEdges);
    expect(rawEdges).toEqual(rawSnapshot);
    expect(preparedEdges).toEqual(preparedSnapshot);
  });

  it('reuses only a source-matched interactive candidate as the full-route seed', () => {
    const rawEdges: Edge[] = [{
      id: 'interactive-seed',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [{ x: 100, y: 230 }, { x: 300, y: 30 }],
      },
    }];
    const preparedInteractiveEdges: Edge[] = [{
      ...rawEdges[0],
      data: {
        computedPath: [
          { x: 100, y: 230 },
          { x: 180, y: 230 },
          { x: 181, y: 30 },
          { x: 300, y: 30 },
        ],
      },
    }];
    const prepare = (candidate: Edge[]) => prepareBaseReactFlowFullRouteSeed({
      edges: rawEdges,
      preparedInteractiveEdges: candidate,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      forceFullQuality: true,
      skipBoundedAttempt: true,
      skipFinalizedReuse: true,
      displayEdgeEpoch: 1,
    });

    const matched = prepare(preparedInteractiveEdges);
    expect(matched.kind).toBe('continue');
    if (matched.kind !== 'continue') return;
    expect(matched.context.routeSeedEdges).toBe(preparedInteractiveEdges);
    expect(matched.context.canReusePreparedGlobalRouting).toBe(true);
    expect(matched.context.reusePreparedGlobalRouting).toBe(false);

    const mismatched = prepare([{ ...preparedInteractiveEdges[0], id: 'stale-edge' }]);
    expect(mismatched.kind).toBe('continue');
    if (mismatched.kind !== 'continue') return;
    expect(mismatched.context.routeSeedEdges).toBe(rawEdges);
  });

  it('requests a prepared seed instead of allowing a recursive full-route fallback', () => {
    const edges: Edge[] = Array.from({ length: 25 }, (_, index) => ({
      id: `edge-${index}`,
      source: `source-${index}`,
      target: `target-${index}`,
    }));
    let skipFullRouteFallback: boolean | undefined;
    let calls = 0;
    const phaseNames: string[] = [];

    const result = createBaseReactFlowFullRouteEdges({
      edges,
      nodes: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      createPreDisplayFinalEdges: (args) => {
        calls += 1;
        skipFullRouteFallback = args.skipFullRouteFallback;
        args.onPhaseTrace?.({
          phase: 'seed-hard-safety',
          durationMs: 1,
          candidateCount: edges.length,
          changedEdgeCount: 0,
          resolution: 'skip',
        });
        args.onBoundedCandidate?.(hardCleanReport);
        return [];
      },
      onPhaseTrace: (trace) => phaseNames.push(trace.phase),
    });

    expect(calls).toBe(1);
    expect(skipFullRouteFallback).toBe(true);
    expect(phaseNames).toEqual(['seed', 'seed-hard-safety']);
    expect(result).toEqual([]);
  });

  it('does not finalize or reuse a hard-clean bounded seed with commercial defects', () => {
    const edges: Edge[] = Array.from({ length: 25 }, (_, index) => ({
      id: `commercial-source-${index}`,
      source: `source-${index}`,
      target: `target-${index}`,
    }));
    const commerciallyDirty = edges.map((edge, index) => ({
      ...edge,
      data: {
        computedPath: Array.from({ length: 9 }, (_, pointIndex) => ({
          x: pointIndex * 20,
          y: pointIndex % 2 === 0 ? index * 40 : index * 40 + 20,
        })),
      },
    }));

    const result = prepareBaseReactFlowFullRouteSeed({
      edges,
      nodes: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      skipFinalizedReuse: true,
      createPreDisplayFinalEdges: (args) => {
        args.onBoundedCandidate?.(hardCleanReport);
        return commerciallyDirty;
      },
    });

    expect(result.kind).toBe('continue');
    if (result.kind !== 'continue') return;
    expect(result.context.routeSeedEdges).toBe(edges);
    expect(result.context.canReusePreparedGlobalRouting).toBe(false);
  });

  it('uses the bounded seed for an explicit full-quality large-graph request', () => {
    const edges: Edge[] = Array.from({ length: 25 }, (_, index) => ({
      id: `edge-${index}`,
      source: `source-${index}`,
      target: `target-${index}`,
    }));
    let calls = 0;

    const result = createBaseReactFlowFullRouteEdges({
      edges,
      nodes: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: true,
      forceFullQuality: true,
      displayEdgeEpoch: 1,
      createPreDisplayFinalEdges: (args) => {
        calls += 1;
        args.onBoundedCandidate?.(hardCleanReport);
        return [];
      },
    });

    expect(calls).toBe(1);
    expect(result).toEqual([]);
  });

  it('returns an already-finalized phase input by reference', () => {
    const edges: Edge[] = [
      {
        id: 'edge',
        source: 'source',
        target: 'target',
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'advanced-smart-step',
        data: {
          computedPath: [
            { x: 100, y: 230 },
            { x: 200, y: 230 },
            { x: 200, y: 30 },
            { x: 300, y: 30 },
          ],
          layoutPathLocked: true,
          layoutDirection: 'TB',
        },
      },
    ];
    const first = createBaseReactFlowFullRouteEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges }),
    });
    const second = createBaseReactFlowFullRouteEdges({
      edges: first,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges: first }),
    });

    expect(second).toBe(first);
  });

  it('reports only the edges changed by the full-quality phase', () => {
    const edges: Edge[] = [
      {
        id: 'quality-repair',
        source: 'source-a',
        target: 'target-a',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          computedPath: [
            { x: 50, y: 60 },
            { x: 80, y: 120 },
            { x: 50, y: 240 },
          ],
          layoutPathLocked: true,
          layoutDirection: 'TB',
        },
      },
      {
        id: 'quality-stable',
        source: 'source-b',
        target: 'target-b',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          computedPath: [
            { x: 550, y: 60 },
            { x: 550, y: 240 },
          ],
          layoutPathLocked: true,
          layoutDirection: 'TB',
        },
      },
    ];
    const nodes = [
      { id: 'source-a', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target-a', position: { x: 0, y: 240 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'source-b', position: { x: 500, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target-b', position: { x: 500, y: 240 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const traces: Array<{
      phase: string;
      changedEdgeCount?: number;
      resolution: string;
    }> = [];

    createBaseReactFlowFullRouteEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      forceFullQuality: true,
      skipBoundedAttempt: true,
      skipFinalizedReuse: true,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes, edges }),
      onPhaseTrace: trace => traces.push(trace),
    });

    expect(traces.find(trace => trace.phase === 'quality'), JSON.stringify(traces)).toMatchObject({
      changedEdgeCount: 1,
      resolution: 'accepted',
    });
  });
});
