// @vitest-environment node

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { createNodeClearanceEvaluationContext } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import {
  baseReactFlowIncrementalEdgesHaveNodeClearance,
  lockBaseReactFlowIncrementalComputedPaths,
  preservesBaseReactFlowIncrementalBoundary,
} from '../baseReactFlowDisplayIncrementalContracts';
import { pushBoundedReconnectRankedCandidate } from '../baseReactFlowDisplayLocalReconnect';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { finalizeDisplayWorkerIncrementalCandidate } from '../baseReactFlowDisplayIncrementalWorkerFinalizer';
import type { DisplayEdgesWorkerIncrementalRouteRequest } from '../baseReactFlowDisplayWorkerProtocol';

const edge: Edge = {
  id: 'source-target',
  source: 'source',
  target: 'target',
  type: 'stablePath',
  data: {
    computedPath: [{ x: 100, y: 30 }, { x: 400, y: 30 }],
    layoutPathLocked: true,
    _layoutPathLocked: true,
  },
};

const createNodes = (blockerY: number): Node[] => [
  { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'target', position: { x: 400, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'blocker', position: { x: 200, y: blockerY }, measured: { width: 100, height: 60 }, data: {} },
];

describe('base React Flow incremental route contracts', () => {
  it.each([true, false])('requires the finalized geometry increment to remain hard-clean: %s', hardClean => {
    const request: DisplayEdgesWorkerIncrementalRouteRequest = {
      operation: 'incremental-route', requestId: 'incremental-finalizer',
      edges: [edge], nodes: createNodes(100), enableSmartEdges: true,
      smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 1, qualityMode: 'full',
      baselineInputSignature: 'baseline', baselineInputGeometryDigest: 'baseline-geometry',
      baselineOutputRouteSignature: 'baseline-route', nextInputSignature: 'next',
      nextInputGeometryDigest: 'next-geometry', mutableEdgeIds: [], contextEdgeIds: [edge.id],
      changeSet: { reason: 'node-drag', classification: 'geometry', changedNodeIds: ['source'],
        changedEdgeIds: [], topologyChanged: false, geometryChanged: true },
    };
    const onPhaseTrace = vi.fn();
    const response = finalizeDisplayWorkerIncrementalCandidate({
      request,
      incremental: { edges: [edge], affectedEdgeCount: 1, eligibleEdgeIds: [edge.id] },
      onPhaseTrace,
      finalizeResponse: candidate => ({ ...candidate, hardClean }),
    });

    // The outcome promotes a context edge without changing its path. Neither the
    // initial mutable request nor a path diff can reconstruct this final scope.
    if (hardClean) expect(response).toMatchObject({ hardClean: true,
      routeResolution: 'incremental-route', eligibleEdgeIds: [edge.id] });
    else expect(response).toBeNull();
    expect(onPhaseTrace).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'finalizer', resolution: hardClean ? 'accepted' : 'fallback',
    }));
  });

  it('retains only the stable best reconnect ranks while candidates stream in', () => {
    const ranked: Array<{ id: string; hardDefects: number; score: number; clearanceRisk: number }> = [];
    for (const candidate of [
      { id: 'late', hardDefects: 2, score: 4, clearanceRisk: 0 },
      { id: 'first-tie', hardDefects: 0, score: 2, clearanceRisk: 0 },
      { id: 'best', hardDefects: 0, score: 1, clearanceRisk: 0 },
      { id: 'second-tie', hardDefects: 0, score: 2, clearanceRisk: 0 },
    ]) pushBoundedReconnectRankedCandidate(ranked, candidate, 2);

    expect(ranked.map(candidate => candidate.id)).toEqual(['best', 'first-tie']);
    pushBoundedReconnectRankedCandidate(ranked, {
      id: 'ignored', hardDefects: 0, score: 0, clearanceRisk: 0,
    }, 0);
    expect(ranked.map(candidate => candidate.id)).toEqual(['best', 'first-tie']);

    const candidates = Array.from({ length: 200 }, (_, index) => ({
      id: `candidate-${index}`,
      hardDefects: (index * 7) % 5,
      score: (index * 11) % 13,
      clearanceRisk: 0,
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

  it('keeps a commercially clear reconnect ahead of a shorter narrow route', () => {
    const candidates = [
      { id: 'short-narrow', hardDefects: 0, clearanceRisk: 22, score: 300 },
      { id: 'long-clear', hardDefects: 0, clearanceRisk: 0, score: 470 },
      { id: 'crossing-clear', hardDefects: 1, clearanceRisk: 0, score: 10 },
    ];
    const ranked: typeof candidates = [];
    for (const candidate of candidates) pushBoundedReconnectRankedCandidate(ranked, candidate, 1);
    expect(ranked.map(candidate => candidate.id)).toEqual(['long-clear']);
  });


  it('locks mutable paths without materializing frozen precompiled runtime flags', () => {
    const mutable: Edge = { ...edge, type: 'advanced-smart-step' };
    const frozen: Edge = {
      ...edge, id: 'frozen', data: { computedPath: edge.data?.computedPath },
    };
    const baseline = [mutable, frozen];
    const mutableIds = new Set([mutable.id]);
    const result = lockBaseReactFlowIncrementalComputedPaths(baseline, createNodes(100), mutableIds);

    expect(result[0]).not.toBe(mutable);
    expect(result[0]).toMatchObject({
      type: 'stablePath', data: { layoutPathLocked: true, _layoutPathLocked: true },
    });
    expect(result[1]).toBe(frozen);
    expect(result[1].data).toBe(frozen.data);
    expect(preservesBaseReactFlowIncrementalBoundary(baseline, result, mutableIds)).toBe(true);
  });

  it('does not conceal a prior change outside the mutable boundary', () => {
    const baseline = [edge];
    const changed = { ...edge, sourceHandle: 'bottom' };
    const candidate = [changed];
    const mutableIds = new Set<string>();
    const result = lockBaseReactFlowIncrementalComputedPaths(candidate, [], mutableIds);

    expect(result).toBe(candidate);
    expect(result[0]).toBe(changed);
    expect(preservesBaseReactFlowIncrementalBoundary(baseline, result, mutableIds)).toBe(false);
  });

  it.each([undefined, [], [{ x: Number.NaN, y: 0 }, { x: 1, y: 1 }]])(
    'preserves an unrenderable mutable path for the hard gate to reject: %j',
    computedPath => {
      const invalid: Edge = { ...edge, data: { computedPath } };
      const result = lockBaseReactFlowIncrementalComputedPaths(
        [invalid], [], new Set([invalid.id]),
      );
      expect(result[0]).toBe(invalid);
    },
  );

  it('uses the shared half-pixel tolerance at the commercial clearance boundary', () => {
    const boundaryNodes = createNodes(77.5);
    const violatingNodes = createNodes(77);
    const boundaryRisk = createNodeClearanceEvaluationContext(boundaryNodes, edge).score(
      getDisplayComputedPath(edge),
      48,
    );
    const violatingRisk = createNodeClearanceEvaluationContext(violatingNodes, edge).score(
      getDisplayComputedPath(edge),
      48,
    );

    expect(boundaryRisk).toBe(0.5);
    expect(baseReactFlowIncrementalEdgesHaveNodeClearance(
      [edge],
      boundaryNodes,
      new Set([edge.id]),
    )).toBe(true);
    expect(violatingRisk).toBe(1);
    expect(baseReactFlowIncrementalEdgesHaveNodeClearance(
      [edge],
      violatingNodes,
      new Set([edge.id]),
    )).toBe(false);
  });
});
