import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { clearDisplayRoutingWorkerSessions } from '../baseReactFlowDisplayWorkerSession';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 100 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'blocker', position: { x: 180, y: 70 }, measured: { width: 100, height: 120 }, data: {} },
  { id: 'target', position: { x: 380, y: 100 }, measured: { width: 100, height: 60 }, data: {} },
];
const identity = createDisplayRoutingIdentity('1234', `geometry-v1:${'a'.repeat(32)}`);
const sourceEdges: Edge[] = Array.from({ length: 3 }, (_, index) => ({
  id: `edge-${index}`,
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {},
}));
const withPath = (path: Array<{ x: number; y: number }>): Edge[] => sourceEdges.map(edge => ({
  ...edge,
  type: 'stablePath',
  data: { computedPath: path.map(point => ({ ...point })) },
}));
const cleanCandidate = withPath([
  { x: 100, y: 130 }, { x: 140, y: 130 },
  { x: 140, y: 30 }, { x: 340, y: 30 },
  { x: 340, y: 130 }, { x: 380, y: 130 },
]);
const dirtyCandidate = withPath([{ x: 100, y: 130 }, { x: 380, y: 130 }]);
const fallbackCandidate = withPath([
  { x: 100, y: 130 }, { x: 140, y: 130 },
  { x: 140, y: 230 }, { x: 340, y: 230 },
  { x: 340, y: 130 }, { x: 380, y: 130 },
]);

const routeFields = {
  nodes,
  enableSmartEdges: true,
  smartEdgePadding: 20,
  isLargeGraph: false,
  displayEdgeEpoch: 0,
  qualityMode: 'full' as const,
  inputIdentity: identity,
};

const runLegacy = (candidate: Edge[], stopAfterObstacleFailure = false) => {
  const repaired = computeBaseReactFlowDisplayEdgesWorkerResponse({
    operation: 'repair',
    requestId: 'layout',
    edges: candidate,
    nodes,
    inputIdentity: identity,
    repairMode: 'bounded',
    stopAfterObstacleFailure,
  });
  if (
    stopAfterObstacleFailure
    && repaired.hardClean === false
    && (repaired.hardReport?.obstacleHits ?? 0) > 0
  ) return repaired;
  return computeBaseReactFlowDisplayEdgesWorkerResponse({
    ...routeFields,
    operation: 'validate-or-route',
    requestId: 'layout',
    edges: sourceEdges,
    candidateEdges: repaired.hardClean && repaired.edges ? repaired.edges : fallbackCandidate,
    candidateSource: 'persistent',
  });
};

const runFused = (candidate: Edge[], stopAfterObstacleFailure = false) => (
  computeBaseReactFlowDisplayEdgesWorkerResponse({
    ...routeFields,
    operation: 'repair-validate-or-route',
    requestId: 'layout',
    edges: sourceEdges,
    candidateEdges: candidate,
    fallbackCandidateEdges: fallbackCandidate,
    candidateSource: 'persistent',
    stopAfterObstacleFailure,
  })
);

const expectEquivalentFinalContract = (
  legacy: ReturnType<typeof runLegacy>,
  fused: ReturnType<typeof runFused>,
) => {
  expect(fused.edges).toEqual(legacy.edges);
  expect(fused.hardReport).toEqual(legacy.hardReport);
  expect(fused.commitReceipt).toEqual(legacy.commitReceipt);
  expect(computeBaseReactFlowDisplayOutputRouteSignature(fused.edges ?? [])).toBe(
    computeBaseReactFlowDisplayOutputRouteSignature(legacy.edges ?? []),
  );
};

describe('display Worker fused layout repair transaction', () => {
  beforeEach(() => clearDisplayRoutingWorkerSessions());

  it('is differential-equivalent when measured repair is hard-clean', () => {
    const legacy = runLegacy(cleanCandidate);
    clearDisplayRoutingWorkerSessions();
    const fused = runFused(cleanCandidate);
    expectEquivalentFinalContract(legacy, fused);
  });

  it('is differential-equivalent when dirty repair selects the canonical fallback', () => {
    const legacy = runLegacy(dirtyCandidate);
    clearDisplayRoutingWorkerSessions();
    const fused = runFused(dirtyCandidate);
    expectEquivalentFinalContract(legacy, fused);
  });

  it('preserves stop-after-obstacle-failure without entering canonical routing', () => {
    const legacy = runLegacy(dirtyCandidate, true);
    clearDisplayRoutingWorkerSessions();
    const fused = runFused(dirtyCandidate, true);
    expect(fused.routeResolution).toBe('repair');
    expect(fused.edges).toEqual(legacy.edges);
    expect(fused.hardReport).toEqual(legacy.hardReport);
    expect(fused.commitReceipt).toEqual(legacy.commitReceipt);
  });

  it('rejects ambiguous, malformed, and non-persistent fused requests', () => {
    const valid = {
      ...routeFields,
      operation: 'repair-validate-or-route',
      requestId: 'layout',
      edges: sourceEdges,
      candidateEdges: cleanCandidate,
      fallbackCandidateEdges: fallbackCandidate,
      candidateSource: 'persistent',
    };
    expect(parseDisplayEdgesWorkerRequest(valid)?.operation).toBe('repair-validate-or-route');
    expect(parseDisplayEdgesWorkerRequest({ ...valid, candidatePatches: cleanCandidate })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({ ...valid, candidateSource: 'precompiled' })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...valid,
      candidateEdges: [{
        ...cleanCandidate[0],
        data: { computedPath: [{ x: Number.NaN, y: 0 }] },
      }],
    })).toBeNull();
  });
});
