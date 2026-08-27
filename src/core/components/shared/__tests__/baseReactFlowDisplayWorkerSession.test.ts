// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it } from 'vitest';

import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';
import {
  DISPLAY_ROUTING_PHASE_TRACE_LIMIT,
  type DisplayRoutingPhaseTrace,
} from '../baseReactFlowDisplayRoutingTrace';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import {
  createDisplayRoutingIdentity,
  displayRoutingIdentitiesMatch,
  isDisplayRoutingIdentity,
} from '../baseReactFlowDisplayRoutingSession';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayWorkerClient';
import {
  parseDisplayEdgesWorkerRequest,
  parseDisplayEdgesWorkerResponse,
} from '../baseReactFlowDisplayWorkerProtocol';
import { completeDisplayWorkerResponse } from '../baseReactFlowDisplayWorkerSessionResponse';
import {
  clearDisplayRoutingWorkerSessions,
  readDisplayRoutingWorkerSession,
  readDisplayRoutingWorkerSessionByIdentity,
  writeDisplayRoutingWorkerSession,
} from '../baseReactFlowDisplayWorkerSession';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

const cleanHardReport = createTestDisplayHardReport(true, 200);

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
  it('normalizes absent and explicit expanded container flags to one identity', () => {
    const containerNodes: Node[] = [{
      id: 'container',
      type: 'titleGroup',
      position: { x: 0, y: 0 },
      measured: { width: 400, height: 240 },
      data: {},
    }];
    const implicit = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: containerNodes,
      edges: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const explicit = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: containerNodes.map(node => ({
        ...node,
        data: { ...node.data, collapsed: false },
      })),
      edges: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });

    expect(explicit).toEqual(implicit);
  });

  it('preserves collapsed topology fields in the Worker routing identity', () => {
    const input = {
      edges: [{ id: 'edge', source: 'container', target: 'target' }],
      nodes: [
        {
          id: 'container',
          type: 'group',
          position: { x: 10, y: 20 },
          positionAbsolute: { x: 10, y: 20 },
          measured: { width: 240, height: 180 },
          data: { layoutDirection: 'LR', collapsed: true },
        },
        {
          id: 'target',
          hidden: true,
          position: { x: 400, y: 40 },
          positionAbsolute: { x: 400, y: 40 },
          measured: { width: 120, height: 60 },
          data: {},
        },
      ],
    };
    const projected = projectBaseReactFlowDisplayWorkerInput(input);
    const policy = {
      enableSmartEdges: true,
      smartEdgePadding: 16,
      isLargeGraph: false,
    };

    expect(computeBaseReactFlowDisplayInputIdentityBundle({ ...input, ...policy }))
      .toEqual(computeBaseReactFlowDisplayInputIdentityBundle({ ...projected, ...policy }));
    const request = {
      operation: 'repair' as const,
      requestId: 'collapsed-projection',
      repairMode: 'bounded' as const,
      inputIdentity: createDisplayRoutingIdentity(
        '123',
        `geometry-v1:${'a'.repeat(32)}`,
      ),
      ...projected,
    };
    expect(parseDisplayEdgesWorkerRequest(request)).not.toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...request,
      nodes: projected.nodes.map(node => ({ ...node, hidden: 'true' })),
    })).toBeNull();
  });

  it('binds session authority to both routing and visual contract versions', () => {
    const identity = createDisplayRoutingIdentity(
      '123',
      `geometry-v1:${'a'.repeat(32)}`,
    );

    expect(isDisplayRoutingIdentity(identity)).toBe(true);
    expect(isDisplayRoutingIdentity({
      ...identity,
      visualVersion: 'commercial-hard-gate-v0',
    })).toBe(false);
    expect(isDisplayRoutingIdentity({
      routingVersion: identity.routingVersion,
      inputSignature: identity.inputSignature,
      inputGeometryDigest: identity.inputGeometryDigest,
    })).toBe(false);
    expect(displayRoutingIdentitiesMatch(identity, {
      ...identity,
      visualVersion: 'commercial-hard-gate-v0',
    })).toBe(false);
  });

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
        hardReport: cleanHardReport,
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
    const privateSession = readDisplayRoutingWorkerSession({
      ref: baselineSessionRef,
      expectedIdentity: baselineSessionRef.identity,
      expectedOutputRouteSignature: baselineOutputRouteSignature,
    });
    expect(privateSession?.spatialSnapshot).toMatchObject({
      outputRouteSignature: baselineOutputRouteSignature,
      segmentIndex: { edgeCount: edges.length },
    });
    expect(readDisplayRoutingWorkerSessionByIdentity({
      expectedIdentity: baselineSessionRef.identity,
    })?.ref).toEqual(baselineSessionRef);
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

    const request = {
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
    } as const;
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse(request);

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
    expect(response.phaseTrace?.find(trace => trace.phase === 'incremental-closure'))
      .toMatchObject({ cacheHitCount: 1 });
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
        classification: 'geometry',
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
