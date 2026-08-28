// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { baseReactFlowDisplayCommercialQualityIsClean } from '../baseReactFlowDisplayCommercialQuality';
import { withDisplayAbsolutePositions } from '../baseReactFlowDisplayEdgeCore';
import * as finalEndpointOrder from '../baseReactFlowDisplayFinalEndpointOrder';
import * as fullRoutePipeline from '../baseReactFlowDisplayFullRoutePipeline';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: { layoutDirection: 'LR' },
  },
  {
    id: 'target',
    position: { x: 500, y: 300 },
    measured: { width: 100, height: 60 },
    data: {},
  },
];

const sourceEdges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'stablePath',
  data: {
    autoSource: false,
    autoTarget: false,
    computedPath: [
      { x: 100, y: 30 },
      { x: 450, y: 30 },
      { x: 450, y: 330 },
      { x: 500, y: 330 },
    ],
    layoutDirection: 'LR',
    layoutPathLocked: true,
    _layoutPathLocked: true,
    runtimeHandleLock: { source: true, target: true },
  },
}];

const commercialDirtyCandidate: Edge[] = [{
  ...sourceEdges[0],
  data: {
    ...sourceEdges[0].data,
    computedPath: [
      { x: 100, y: 30 }, { x: 150, y: 30 }, { x: 150, y: 90 },
      { x: 230, y: 90 }, { x: 230, y: 150 }, { x: 310, y: 150 },
      { x: 310, y: 210 }, { x: 390, y: 210 }, { x: 390, y: 330 },
      { x: 500, y: 330 },
    ],
  },
}];

const createRequest = () => ({
  operation: 'validate-or-route' as const,
  edges: sourceEdges,
  candidateEdges: commercialDirtyCandidate,
  candidateSource: 'persistent' as const,
  nodes,
  enableSmartEdges: true,
  smartEdgePadding: 20,
  isLargeGraph: false,
  displayEdgeEpoch: 1,
  qualityMode: 'full' as const,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('display Worker candidate commercial closure', () => {
  it('keeps the clean candidate promotion fast path out of full routing', () => {
    const fullRouteSpy = vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges');

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      ...createRequest(),
      requestId: 'validate-clean-cache',
      candidateEdges: undefined,
      candidatePatches: sourceEdges,
    });

    expect(response).toMatchObject({
      requestId: 'validate-clean-cache',
      edges: sourceEdges,
      hardClean: true,
      routeResolution: 'validated-candidate',
    });
    expect(response.phaseTrace).toEqual([
      expect.objectContaining({ phase: 'candidate-validation', resolution: 'hit' }),
      expect.objectContaining({ phase: 'final-clearance', resolution: 'skip' }),
      expect.objectContaining({ phase: 'final-hard-safety', resolution: 'skip' }),
      expect.objectContaining({ phase: 'session-commit', resolution: 'skip' }),
    ]);
    expect(fullRouteSpy).not.toHaveBeenCalled();
  });

  it('promotes the bounded commercial repair with canonical identity', () => {
    const identityBundle = computeBaseReactFlowDisplayInputIdentityBundle({
      edges: sourceEdges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const inputIdentity = createDisplayRoutingIdentity(
      identityBundle.cacheSignature,
      identityBundle.geometryDigest,
    );
    const fullRouteSpy = vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges');
    const repairNodes = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(node => [node.id, node] as const)),
    );
    expect(getExactDisplayHardReport(commercialDirtyCandidate, repairNodes).hardClean).toBe(true);
    expect(baseReactFlowDisplayCommercialQualityIsClean(commercialDirtyCandidate)).toBe(false);

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      ...createRequest(),
      requestId: 'validate-commercial-closure',
      inputIdentity,
    });

    expect(response).toMatchObject({
      requestId: 'validate-commercial-closure',
      hardClean: true,
      routeResolution: 'repaired-candidate',
      commitReceipt: { identity: inputIdentity },
    });
    expect(baseReactFlowDisplayCommercialQualityIsClean(response.edges ?? [])).toBe(true);
    expect(response.commitReceipt?.outputRouteSignature).toBe(response.outputRouteSignature);
    expect(fullRouteSpy).not.toHaveBeenCalled();
  });

  it('retains the full-route fallback when bounded commercial closure stays dirty', () => {
    vi.spyOn(
      finalEndpointOrder,
      'repairBaseReactFlowFinalCommercialDetours',
    ).mockImplementation(candidate => candidate);
    const fullRouteSpy = vi.spyOn(
      fullRoutePipeline,
      'createBaseReactFlowFullRouteEdges',
    ).mockReturnValue(sourceEdges);

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      ...createRequest(),
      requestId: 'validate-commercial-fallback',
    });

    expect(fullRouteSpy).toHaveBeenCalledOnce();
    expect(response).toMatchObject({
      requestId: 'validate-commercial-fallback',
      hardClean: true,
      routeResolution: 'full-route',
    });
  });
});
