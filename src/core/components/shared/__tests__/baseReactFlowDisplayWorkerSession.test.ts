// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it } from 'vitest';

import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import {
  DISPLAY_ROUTING_PHASE_TRACE_LIMIT,
  type DisplayRoutingPhaseTrace,
} from '../baseReactFlowDisplayRoutingTrace';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayWorkerClient';
import { parseDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';
import { completeDisplayWorkerResponse } from '../baseReactFlowDisplayWorkerSessionResponse';
import {
  clearDisplayRoutingWorkerSessions,
  writeDisplayRoutingWorkerSession,
} from '../baseReactFlowDisplayWorkerSession';

const nodes: Node[] = [{
  id: 'source',
  position: { x: 0, y: 0 },
  measured: { width: 100, height: 60 },
  data: { layoutDirection: 'LR' },
}, {
  id: 'target',
  position: { x: 300, y: 0 },
  measured: { width: 100, height: 60 },
  data: {},
}];

const edges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'stablePath',
  data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }] },
}];

afterEach(clearDisplayRoutingWorkerSessions);

describe('display routing Worker-private session', () => {
  it('keeps a full phase trace within the response protocol budget during session commit', () => {
    const identity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const phaseTrace: DisplayRoutingPhaseTrace[] = Array.from(
      { length: DISPLAY_ROUTING_PHASE_TRACE_LIMIT },
      () => ({
        phase: 'quality-polish-local',
        parentPhase: 'quality-polish-candidates',
        durationMs: 1,
        candidateCount: 1,
        changedEdgeCount: 0,
        resolution: 'skip',
      }),
    );
    const response = completeDisplayWorkerResponse({
      request: {
        operation: 'route',
        requestId: 'bounded-session-trace',
        edges,
        nodes,
        enableSmartEdges: true,
        smartEdgePadding: 20,
        isLargeGraph: false,
        displayEdgeEpoch: 1,
        qualityMode: 'full',
        inputIdentity: createDisplayRoutingIdentity(
          identity.cacheSignature,
          identity.geometryDigest,
        ),
      },
      response: {
        requestId: 'bounded-session-trace',
        edges,
        hardClean: true,
        routeResolution: 'full-route',
        phaseTrace,
      },
      phaseTrace,
    });

    expect(response.phaseTrace).toHaveLength(DISPLAY_ROUTING_PHASE_TRACE_LIMIT);
    expect(parseDisplayEdgesWorkerResponse(
      response,
      'bounded-session-trace',
    )).not.toBeNull();
  });

  it('routes from an exact private session without retransmitting its baseline', () => {
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(edges, edges);
    const baselineOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
    const baselineIdentityBundle = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid private session baseline');
    }
    const baselineSessionRef = writeDisplayRoutingWorkerSession({
      identity: createDisplayRoutingIdentity(
        baselineIdentityBundle.cacheSignature,
        baselineIdentityBundle.geometryDigest,
      ),
      outputRouteSignature: baselineOutputRouteSignature,
      nodes,
      sourceEdges: edges,
      displayPatches: baselinePatches,
      finalEdges: edges,
    });
    const nextNodes: Node[] = [nodes[0], { ...nodes[1], position: { x: 320, y: 0 } }];
    const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: nextNodes,
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: nodes,
      previousEdges: edges,
      nextNodes,
      nextEdges: edges,
      reasonHint: 'node-drag',
    });
    const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: nodes,
      nextNodes,
      baselineEdges: edges,
      nextEdges: edges,
    });

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'incremental-private-session',
      edges,
      nodes: nextNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
      inputIdentity: createDisplayRoutingIdentity(
        nextIdentity.cacheSignature,
        nextIdentity.geometryDigest,
      ),
      baselineSessionRef,
      baselineInputSignature: baselineIdentityBundle.cacheSignature,
      baselineInputGeometryDigest: baselineIdentityBundle.geometryDigest,
      baselineOutputRouteSignature,
      nextInputSignature: nextIdentity.cacheSignature,
      nextInputGeometryDigest: nextIdentity.geometryDigest,
      changeSet,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
      contextEdgeIds: affectedClosure.contextEdgeIds,
    });

    expect(response).toMatchObject({
      hardClean: true,
      routeResolution: 'incremental-route',
      fallbackLevel: 'none',
      nextIdentity: {
        inputSignature: nextIdentity.cacheSignature,
        inputGeometryDigest: nextIdentity.geometryDigest,
      },
      outputRouteSignature: expect.stringMatching(/^route-v2:/),
      sessionRef: { sessionId: expect.stringMatching(/^display-session-v1:/) },
    });
  });

  it('falls back safely when a private session is stale and no bootstrap is present', () => {
    const identity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
    if (!outputRouteSignature) throw new Error('expected route signature');
    const staleRef = {
      sessionId: 'display-session-v1:999',
      identity: createDisplayRoutingIdentity(identity.cacheSignature, identity.geometryDigest),
      outputRouteSignature,
    } as const;
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'stale-private-session',
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 2,
      qualityMode: 'full',
      baselineSessionRef: staleRef,
      baselineInputSignature: identity.cacheSignature,
      baselineInputGeometryDigest: identity.geometryDigest,
      baselineOutputRouteSignature: outputRouteSignature,
      nextInputSignature: identity.cacheSignature,
      nextInputGeometryDigest: identity.geometryDigest,
      changeSet: {
        reason: 'node-drag',
        changedNodeIds: ['source'],
        changedEdgeIds: [],
        topologyChanged: false,
        geometryChanged: true,
      },
      mutableEdgeIds: ['edge'],
      contextEdgeIds: [],
    });
    expect(response).toMatchObject({ hardClean: true, fallbackLevel: 'full' });
    expect(response.routeResolution).toMatch(/^full-route/);
  });
});
