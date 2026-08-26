// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import type { StandardDiagramData } from '../../../models/DiagramModels';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceEvaluationContext } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayOutputRouteSignature,
} from '../baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { createBaseReactFlowRigidMoveSeed } from '../baseReactFlowDisplayRigidMove';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import { parseBaseReactFlowPrecompiledRouteArtifact } from '../baseReactFlowPrecompiledRouteArtifact';
import {
  createBaseReactFlowDisplayEdgePatches,
} from '../baseReactFlowDisplayWorkerClient';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
} from '../baseReactFlowDisplayRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';
import { GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS } from '../generated/baseReactFlowPrecompiledRouteLoaders';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';
import { withAbsoluteNodePositions } from './baseReactFlowDisplayEdges.testUtils';
import {
  browserColdRequestRoutes,
  browserLogisticsNodes,
} from './fixtures/logisticsBrowserRoutingFixture';

const createBrowserSourceEdges = async (): Promise<Edge[]> => {
  const canvas = await standardDataToCanvas(
    logisticsStandardData as unknown as StandardDiagramData,
  );
  const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
  return projected.edges.map(edge => {
    const route = browserColdRequestRoutes[edge.id];
    if (!route) return edge;
    const auto = edge.id === 'edge-upstream-loms' ? ['source', 'target'] : [];
    return {
      ...edge,
      type: 'advanced-smart-step',
      sourceHandle: route.sourceHandle,
      targetHandle: route.targetHandle,
      data: {
        ...edge.data,
        computedPath: route.path,
        auto,
        autoSource: auto.includes('source'),
        autoTarget: auto.includes('target'),
        layoutPathLocked: true,
        runtimeHandleLock: { source: true, target: true },
      },
    };
  });
};

describe('Logistics incremental display routing', () => {
  it('keeps an L-OMS move inside a hard-clean bounded transaction', async () => {
    const entry = Object.entries(GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS)
      .find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!entry) throw new Error('expected the Logistics precompiled loader');
    const [inputSignature, descriptor] = entry;
    const artifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'), {
      inputSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      sourceHash: descriptor.sourceHash,
    });
    if (!artifact) throw new Error('expected the Logistics artifact to parse');

    const sourceEdges = await createBrowserSourceEdges();
    const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, artifact.edges);
    if (!baselineEdges) throw new Error('expected the Logistics artifact patches to merge');
    const baselineNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const nextNodes = withAbsoluteNodePositions(browserLogisticsNodes.map(node => (
      node.id === 'l-oms'
        ? { ...node, position: { x: 972, y: 90 } }
        : node
    )));
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(
      sourceEdges,
      baselineEdges,
    );
    const baselineOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(
      baselineEdges,
    );
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid Logistics incremental baseline');
    }
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: baselineNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: nextNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: sourceEdges,
      nextNodes,
      nextEdges: sourceEdges,
      reasonHint: 'node-drag',
    });
    const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: baselineNodes,
      nextNodes,
      baselineEdges,
      nextEdges: sourceEdges,
    });
    const boundedReports: ReturnType<typeof getDisplayHardQualityGateReport>[] = [];
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-loms-incremental',
      edges: sourceEdges,
      nodes: nextNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: nextNodes, edges: sourceEdges }),
      qualityMode: 'full',
      baselineInputSignature: baselineIdentity.cacheSignature,
      baselineInputGeometryDigest: baselineIdentity.geometryDigest,
      baselineNodes,
      baselineSourceEdges: sourceEdges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: nextIdentity.cacheSignature,
      nextInputGeometryDigest: nextIdentity.geometryDigest,
      changeSet,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
      contextEdgeIds: affectedClosure.contextEdgeIds,
    }, report => boundedReports.push(report));
    const report = response.edges
      ? getExactDisplayHardReport(response.edges, nextNodes)
      : null;
    const diagnostics = JSON.stringify({
      affectedClosure,
      response: {
        routeResolution: response.routeResolution,
        fallbackLevel: response.fallbackLevel,
        affectedEdgeCount: response.affectedEdgeCount,
        phaseTrace: response.phaseTrace,
      },
      boundedReports,
      report,
    }, null, 2);

    expect(response.routeResolution, diagnostics).toBe('incremental-route');
    expect(response.fallbackLevel, diagnostics).toBe('none');
    expect(affectedClosure.mutableEdgeIds, diagnostics).toHaveLength(5);
    expect(response.affectedEdgeCount, diagnostics).toBe(
      affectedClosure.mutableEdgeIds.length,
    );
    expect(report?.hardClean, diagnostics).toBe(true);
    expect(response.hardReport, diagnostics).toEqual(report);
    const reconnectCandidateTrace = response.phaseTrace?.find(
      trace => trace.phase === 'local-reconnect-candidates',
    );
    expect(reconnectCandidateTrace?.evaluationCount, diagnostics).toBeGreaterThan(0);
    expect(reconnectCandidateTrace?.cacheHitCount, diagnostics).toBeGreaterThan(0);
    expect(reconnectCandidateTrace?.scannedNodeCount, diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('keeps every mutable WMS branch at commercial clearance after a small drag', async () => {
    const entry = Object.entries(GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS)
      .find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!entry) throw new Error('expected the Logistics precompiled loader');
    const [inputSignature, descriptor] = entry;
    const artifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'), {
      inputSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      sourceHash: descriptor.sourceHash,
    });
    if (!artifact) throw new Error('expected the Logistics artifact to parse');

    const sourceEdges = await createBrowserSourceEdges();
    const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, artifact.edges);
    if (!baselineEdges) throw new Error('expected the Logistics artifact patches to merge');
    const baselineNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const nextNodes = withAbsoluteNodePositions(browserLogisticsNodes.map(node => (
      node.id === 'wms'
        ? { ...node, position: { x: 84, y: 378 } }
        : node
    )));
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(
      sourceEdges,
      baselineEdges,
    );
    const baselineOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(
      baselineEdges,
    );
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid Logistics incremental baseline');
    }
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: baselineNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: nextNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: sourceEdges,
      nextNodes,
      nextEdges: sourceEdges,
      reasonHint: 'node-drag',
    });
    const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: baselineNodes,
      nextNodes,
      baselineEdges,
      nextEdges: sourceEdges,
    });
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-wms-commercial-clearance',
      edges: sourceEdges,
      nodes: nextNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: nextNodes, edges: sourceEdges }),
      qualityMode: 'full',
      baselineInputSignature: baselineIdentity.cacheSignature,
      baselineInputGeometryDigest: baselineIdentity.geometryDigest,
      baselineNodes,
      baselineSourceEdges: sourceEdges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: nextIdentity.cacheSignature,
      nextInputGeometryDigest: nextIdentity.geometryDigest,
      changeSet,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
      contextEdgeIds: affectedClosure.contextEdgeIds,
    });
    const responseEdges = response.edges ?? [];
    const visibilityEdge = responseEdges.find(edge => edge.id === 'edge-wms-visibility');
    if (!visibilityEdge) throw new Error('expected the WMS visibility branch');
    const report = response.edges
      ? getDisplayHardQualityGateReport(response.edges, nextNodes, 'polished')
      : null;
    const mutableIds = new Set(affectedClosure.mutableEdgeIds);
    const clearanceRisks = responseEdges
      .filter(edge => mutableIds.has(edge.id))
      .flatMap(edge => {
        const risk = createNodeClearanceEvaluationContext(nextNodes, edge).score(
          getDisplayComputedPath(edge),
          COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        );
        return risk > 1e-6 ? [{ edgeId: edge.id, risk }] : [];
      });
    const diagnostics = JSON.stringify({
      affectedClosure,
      response: {
        routeResolution: response.routeResolution,
        fallbackLevel: response.fallbackLevel,
        affectedEdgeCount: response.affectedEdgeCount,
        phaseTrace: response.phaseTrace,
      },
      report,
      clearanceRisks,
      visibilityPath: getDisplayComputedPath(visibilityEdge),
    }, null, 2);

    expect(response.routeResolution, diagnostics).toBe('incremental-route');
    expect(response.fallbackLevel, diagnostics).toBe('none');
    expect(affectedClosure.mutableEdgeIds, diagnostics).toHaveLength(4);
    expect(response.affectedEdgeCount, diagnostics).toBe(4);
    expect(report?.hardClean, diagnostics).toBe(true);
    expect(clearanceRisks, diagnostics).toEqual([]);
  }, 120_000);

  it('routes a newly connected bare edge inside a bounded topology transaction', async () => {
    const entry = Object.entries(GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS)
      .find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!entry) throw new Error('expected the Logistics precompiled loader');
    const [inputSignature, descriptor] = entry;
    const artifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'), {
      inputSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      sourceHash: descriptor.sourceHash,
    });
    if (!artifact) throw new Error('expected the Logistics artifact to parse');

    const sourceEdges = await createBrowserSourceEdges();
    const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, artifact.edges);
    if (!baselineEdges) throw new Error('expected the Logistics artifact patches to merge');
    const nodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const addedEdge: Edge = {
      id: 'xy-edge__wcsright-bmsleft',
      source: 'wcs',
      target: 'bms',
    };
    const nextEdges = [...sourceEdges, addedEdge];
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, baselineEdges);
    const baselineOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(
      baselineEdges,
    );
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid Logistics incremental baseline');
    }
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges: nextEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: nodes,
      previousEdges: sourceEdges,
      nextNodes: nodes,
      nextEdges,
      reasonHint: 'edge-add',
    });
    const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: nodes,
      nextNodes: nodes,
      baselineEdges,
      nextEdges,
    });
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-edge-add-incremental',
      edges: nextEdges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes, edges: nextEdges }),
      qualityMode: 'full',
      baselineInputSignature: baselineIdentity.cacheSignature,
      baselineInputGeometryDigest: baselineIdentity.geometryDigest,
      baselineNodes: nodes,
      baselineSourceEdges: sourceEdges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: nextIdentity.cacheSignature,
      nextInputGeometryDigest: nextIdentity.geometryDigest,
      changeSet,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
      contextEdgeIds: affectedClosure.contextEdgeIds,
    });
    const report = response.edges ? getExactDisplayHardReport(response.edges, nodes) : null;
    const routedAddedEdge = response.edges?.find(edge => edge.id === addedEdge.id);
    const addedPath = routedAddedEdge ? getDisplayComputedPath(routedAddedEdge) : [];
    const diagnostics = JSON.stringify({
      changeSet,
      affectedClosure,
      response: {
        hardClean: response.hardClean,
        routeResolution: response.routeResolution,
        fallbackLevel: response.fallbackLevel,
        affectedEdgeCount: response.affectedEdgeCount,
        phaseTrace: response.phaseTrace,
      },
      report,
      addedPath,
    }, null, 2);

    expect(changeSet, diagnostics).toMatchObject({
      classification: 'topology',
      reason: 'edge-add',
      topologyChanged: true,
    });
    expect(response.routeResolution, diagnostics).toBe('incremental-route');
    expect(response.fallbackLevel, diagnostics).toBe('none');
    expect(response.affectedEdgeCount, diagnostics).toBe(2);
    expect(response.hardClean, diagnostics).toBe(true);
    expect(report?.hardClean, diagnostics).toBe(true);
    expect(report?.commercialClearanceViolations, diagnostics).toBe(0);
    expect(addedPath.length, diagnostics).toBeGreaterThanOrEqual(2);
    const frozenBaselineEdges = baselineEdges.filter(edge => edge.id !== 'edge-wms-visibility');
    const responseById = new Map(response.edges?.map(edge => [edge.id, edge] as const));
    const frozenResponseEdges = frozenBaselineEdges.flatMap(edge => {
      const responseEdge = responseById.get(edge.id);
      return responseEdge ? [responseEdge] : [];
    });
    expect(frozenResponseEdges, diagnostics).toHaveLength(frozenBaselineEdges.length);
    expect(doBaseReactFlowDisplayRoutesMatchExactly(
      frozenBaselineEdges,
      frozenResponseEdges,
    ), diagnostics).toBe(true);
    const baselineVisibility = baselineEdges.find(edge => edge.id === 'edge-wms-visibility');
    const responseVisibility = responseById.get('edge-wms-visibility');
    expect(Boolean(baselineVisibility && responseVisibility), diagnostics).toBe(true);
    expect(responseVisibility, diagnostics).toMatchObject({
      sourceHandle: baselineVisibility?.sourceHandle,
      targetHandle: baselineVisibility?.targetHandle,
    });
    expect(doBaseReactFlowDisplayRoutesMatchExactly(
      baselineVisibility ? [baselineVisibility] : [],
      responseVisibility ? [responseVisibility] : [],
    ), diagnostics).toBe(false);

    const addedBaselineEdges = response.edges ?? [];
    const addedBaselinePatches = createBaseReactFlowDisplayEdgePatches(
      nextEdges,
      addedBaselineEdges,
    );
    const addedBaselineSignature = computeBaseReactFlowDisplayOutputRouteSignature(
      addedBaselineEdges,
    );
    if (!addedBaselinePatches || !addedBaselineSignature) {
      throw new Error('expected a valid added-edge baseline');
    }
    const portEdges = nextEdges.map(edge => edge.id === addedEdge.id ? {
      ...edge,
      targetHandle: 'top',
      data: { ...(edge.data || {}), autoTarget: false },
    } : edge);
    const portIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges: portEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const portChangeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: nodes,
      previousEdges: nextEdges,
      nextNodes: nodes,
      nextEdges: portEdges,
      reasonHint: 'port-policy',
    });
    const portClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet: portChangeSet,
      previousNodes: nodes,
      nextNodes: nodes,
      baselineEdges: addedBaselineEdges,
      nextEdges: portEdges,
    });
    const portRejectedReports: ReturnType<typeof getDisplayHardQualityGateReport>[] = [];
    const portResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-port-policy-incremental',
      edges: portEdges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes, edges: portEdges }),
      qualityMode: 'full',
      baselineInputSignature: nextIdentity.cacheSignature,
      baselineInputGeometryDigest: nextIdentity.geometryDigest,
      baselineNodes: nodes,
      baselineSourceEdges: nextEdges,
      baselinePatches: addedBaselinePatches,
      baselineOutputRouteSignature: addedBaselineSignature,
      nextInputSignature: portIdentity.cacheSignature,
      nextInputGeometryDigest: portIdentity.geometryDigest,
      changeSet: portChangeSet,
      mutableEdgeIds: portClosure.mutableEdgeIds,
      contextEdgeIds: portClosure.contextEdgeIds,
    }, report => portRejectedReports.push(report));
    const portDiagnostics = JSON.stringify({
      portChangeSet,
      portClosure,
      rejectedReports: portRejectedReports,
      response: {
        hardClean: portResponse.hardClean,
        routeResolution: portResponse.routeResolution,
        fallbackLevel: portResponse.fallbackLevel,
        affectedEdgeCount: portResponse.affectedEdgeCount,
        phaseTrace: portResponse.phaseTrace,
      },
    }, null, 2);
    expect(portResponse, portDiagnostics).toMatchObject({
      hardClean: true,
      routeResolution: 'incremental-route',
      fallbackLevel: 'none',
    });

  }, 120_000);

  it('removes one edge without rerouting the surviving Logistics topology', async () => {
    const entry = Object.entries(GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS)
      .find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!entry) throw new Error('expected the Logistics precompiled loader');
    const [inputSignature, descriptor] = entry;
    const artifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'), {
        inputSignature,
        inputGeometryDigest: descriptor.geometryDigest,
        sourceHash: descriptor.sourceHash,
      });
    if (!artifact) throw new Error('expected the Logistics artifact to parse');

    const sourceEdges = await createBrowserSourceEdges();
    const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, artifact.edges);
    if (!baselineEdges) throw new Error('expected the Logistics artifact patches to merge');
    const nodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const removedEdgeId = 'edge-wms-wcs';
    const nextEdges = sourceEdges.filter(edge => edge.id !== removedEdgeId);
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, baselineEdges);
    const baselineOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(
      baselineEdges,
    );
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid Logistics incremental baseline');
    }
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges: nextEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: nodes,
      previousEdges: sourceEdges,
      nextNodes: nodes,
      nextEdges,
      reasonHint: 'edge-remove',
    });
    const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: nodes,
      nextNodes: nodes,
      baselineEdges,
      nextEdges,
    });
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-edge-remove-incremental',
      edges: nextEdges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes, edges: nextEdges }),
      qualityMode: 'full',
      baselineInputSignature: baselineIdentity.cacheSignature,
      baselineInputGeometryDigest: baselineIdentity.geometryDigest,
      baselineNodes: nodes,
      baselineSourceEdges: sourceEdges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: nextIdentity.cacheSignature,
      nextInputGeometryDigest: nextIdentity.geometryDigest,
      changeSet,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
      contextEdgeIds: affectedClosure.contextEdgeIds,
    });
    const survivingBaselineEdges = baselineEdges.filter(edge => edge.id !== removedEdgeId);
    const diagnostics = JSON.stringify({
      changeSet,
      affectedClosure,
      routeResolution: response.routeResolution,
      fallbackLevel: response.fallbackLevel,
      hardClean: response.hardClean,
      phaseTrace: response.phaseTrace,
    }, null, 2);

    expect(response.routeResolution, diagnostics).toBe('incremental-route');
    expect(response.fallbackLevel, diagnostics).toBe('none');
    expect(response.affectedEdgeCount, diagnostics).toBe(1);
    expect(response.hardClean, diagnostics).toBe(true);
    expect(response.edges, diagnostics).toHaveLength(sourceEdges.length - 1);
    expect(response.edges?.some(edge => edge.id === removedEdgeId), diagnostics).toBe(false);
    expect(doBaseReactFlowDisplayRoutesMatchExactly(
      survivingBaselineEdges,
      response.edges ?? [],
    ), diagnostics).toBe(true);
  }, 120_000);

  it('adds and removes an isolated node without rerouting any Logistics edge', async () => {
    const entry = Object.entries(GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS)
      .find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!entry) throw new Error('expected the Logistics precompiled loader');
    const [inputSignature, descriptor] = entry;
    const artifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'), {
        inputSignature,
        inputGeometryDigest: descriptor.geometryDigest,
        sourceHash: descriptor.sourceHash,
      });
    if (!artifact) throw new Error('expected the Logistics artifact to parse');

    const sourceEdges = await createBrowserSourceEdges();
    const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, artifact.edges);
    const baselinePatches = baselineEdges
      ? createBaseReactFlowDisplayEdgePatches(sourceEdges, baselineEdges)
      : null;
    const baselineOutputRouteSignature = baselineEdges
      ? computeBaseReactFlowDisplayOutputRouteSignature(baselineEdges)
      : null;
    if (!baselineEdges || !baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid Logistics incremental baseline');
    }
    const sourceNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const isolatedNode = {
      id: 'routing-audit-isolated',
      type: 'custom',
      position: { x: 2_400, y: 2_000 },
      positionAbsolute: { x: 2_400, y: 2_000 },
      width: 160,
      height: 80,
      measured: { width: 160, height: 80 },
      data: {},
    };
    const addedNodes = [...sourceNodes, isolatedNode];
    const sourceIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: sourceNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const addedIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: addedNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const additionChangeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: sourceNodes,
      previousEdges: sourceEdges,
      nextNodes: addedNodes,
      nextEdges: sourceEdges,
      reasonHint: 'node-add',
    });
    const additionClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet: additionChangeSet,
      previousNodes: sourceNodes,
      nextNodes: addedNodes,
      baselineEdges,
      nextEdges: sourceEdges,
    });
    const additionResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-node-add-incremental',
      edges: sourceEdges,
      nodes: addedNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
        nodes: addedNodes,
        edges: sourceEdges,
      }),
      qualityMode: 'full',
      baselineInputSignature: sourceIdentity.cacheSignature,
      baselineInputGeometryDigest: sourceIdentity.geometryDigest,
      baselineNodes: sourceNodes,
      baselineSourceEdges: sourceEdges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: addedIdentity.cacheSignature,
      nextInputGeometryDigest: addedIdentity.geometryDigest,
      changeSet: additionChangeSet,
      mutableEdgeIds: additionClosure.mutableEdgeIds,
      contextEdgeIds: additionClosure.contextEdgeIds,
    });
    const addedEdges = additionResponse.edges ?? [];
    const addedPatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, addedEdges);
    const addedOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(addedEdges);
    if (!addedPatches || !addedOutputRouteSignature) {
      throw new Error('expected a valid isolated-node addition baseline');
    }
    const removalChangeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: addedNodes,
      previousEdges: sourceEdges,
      nextNodes: sourceNodes,
      nextEdges: sourceEdges,
      reasonHint: 'node-remove',
    });
    const removalClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet: removalChangeSet,
      previousNodes: addedNodes,
      nextNodes: sourceNodes,
      baselineEdges: addedEdges,
      nextEdges: sourceEdges,
    });
    const removalResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-node-remove-incremental',
      edges: sourceEdges,
      nodes: sourceNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
        nodes: sourceNodes,
        edges: sourceEdges,
      }),
      qualityMode: 'full',
      baselineInputSignature: addedIdentity.cacheSignature,
      baselineInputGeometryDigest: addedIdentity.geometryDigest,
      baselineNodes: addedNodes,
      baselineSourceEdges: sourceEdges,
      baselinePatches: addedPatches,
      baselineOutputRouteSignature: addedOutputRouteSignature,
      nextInputSignature: sourceIdentity.cacheSignature,
      nextInputGeometryDigest: sourceIdentity.geometryDigest,
      changeSet: removalChangeSet,
      mutableEdgeIds: removalClosure.mutableEdgeIds,
      contextEdgeIds: removalClosure.contextEdgeIds,
    });
    const diagnostics = JSON.stringify({
      additionChangeSet,
      additionClosure,
      additionResponse: {
        routeResolution: additionResponse.routeResolution,
        fallbackLevel: additionResponse.fallbackLevel,
        hardClean: additionResponse.hardClean,
      },
      removalChangeSet,
      removalClosure,
      removalResponse: {
        routeResolution: removalResponse.routeResolution,
        fallbackLevel: removalResponse.fallbackLevel,
        hardClean: removalResponse.hardClean,
      },
    }, null, 2);

    expect(additionChangeSet, diagnostics).toMatchObject({
      classification: 'topology',
      reason: 'node-add',
      changedNodeIds: ['routing-audit-isolated'],
      changedEdgeIds: [],
    });
    expect(removalChangeSet, diagnostics).toMatchObject({
      classification: 'topology',
      reason: 'node-remove',
      changedNodeIds: ['routing-audit-isolated'],
      changedEdgeIds: [],
    });
    for (const response of [additionResponse, removalResponse]) {
      expect(response, diagnostics).toMatchObject({
        routeResolution: 'incremental-route',
        fallbackLevel: 'none',
        affectedEdgeCount: 0,
        hardClean: true,
      });
      expect(response.edges, diagnostics).toHaveLength(sourceEdges.length);
    }
    expect(doBaseReactFlowDisplayRoutesMatchExactly(
      baselineEdges,
      addedEdges,
    ), diagnostics).toBe(true);
    expect(doBaseReactFlowDisplayRoutesMatchExactly(
      baselineEdges,
      removalResponse.edges ?? [],
    ), diagnostics).toBe(true);
  }, 120_000);

  it('rigidly translates internal paths when the Logistics compound subtree moves', async () => {
    const entry = Object.entries(GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS)
      .find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!entry) throw new Error('expected the Logistics precompiled loader');
    const [inputSignature, descriptor] = entry;
    const artifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'), {
      inputSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      sourceHash: descriptor.sourceHash,
    });
    if (!artifact) throw new Error('expected the Logistics artifact to parse');

    const sourceEdges = await createBrowserSourceEdges();
    const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, artifact.edges);
    if (!baselineEdges) throw new Error('expected the Logistics artifact patches to merge');
    const baselineNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const nextNodes = withAbsoluteNodePositions(browserLogisticsNodes.map(node => (
      node.id === 'titlegroup-logistics'
        ? {
            ...node,
            position: {
              x: node.position.x + 24,
              y: node.position.y + 8,
            },
          }
        : node
    )));
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, baselineEdges);
    const baselineOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(
      baselineEdges,
    );
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid compound-move baseline');
    }
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: baselineNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: nextNodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: sourceEdges,
      nextNodes,
      nextEdges: sourceEdges,
      reasonHint: 'node-drag',
    });
    const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: baselineNodes,
      nextNodes,
      baselineEdges,
      nextEdges: sourceEdges,
    });
    const rigidSeed = createBaseReactFlowRigidMoveSeed({
      baselineEdges,
      baselineNodes,
      nextNodes,
      changedNodeIds: changeSet.changedNodeIds,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
    });
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'logistics-compound-subtree-move',
      edges: sourceEdges,
      nodes: nextNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
        nodes: nextNodes,
        edges: sourceEdges,
      }),
      qualityMode: 'full',
      baselineInputSignature: baselineIdentity.cacheSignature,
      baselineInputGeometryDigest: baselineIdentity.geometryDigest,
      baselineNodes,
      baselineSourceEdges: sourceEdges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: nextIdentity.cacheSignature,
      nextInputGeometryDigest: nextIdentity.geometryDigest,
      changeSet,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
      contextEdgeIds: affectedClosure.contextEdgeIds,
    });
    const report = response.edges ? getExactDisplayHardReport(response.edges, nextNodes) : null;
    const diagnostics = JSON.stringify({
      changeSet,
      affectedEdgeCount: affectedClosure.mutableEdgeIds.length,
      rigidEdgeCount: rigidSeed.rigidEdgeIds.length,
      response: {
        routeResolution: response.routeResolution,
        fallbackLevel: response.fallbackLevel,
        affectedEdgeCount: response.affectedEdgeCount,
        phaseTrace: response.phaseTrace,
      },
      report,
    }, null, 2);

    expect(changeSet.changedNodeIds, diagnostics).toHaveLength(8);
    expect(affectedClosure.mutableEdgeIds, diagnostics).toHaveLength(13);
    expect(rigidSeed.rigidEdgeIds, diagnostics).toHaveLength(7);
    expect(response, diagnostics).toMatchObject({
      routeResolution: 'incremental-route',
      fallbackLevel: 'none',
      affectedEdgeCount: 13,
      hardClean: true,
    });
    expect(report?.hardClean, diagnostics).toBe(true);
    const baselineById = new Map(baselineEdges.map(edge => [edge.id, edge] as const));
    const responseById = new Map(response.edges?.map(edge => [edge.id, edge] as const));
    for (const edgeId of rigidSeed.rigidEdgeIds) {
      const baselineEdge = baselineById.get(edgeId);
      const responseEdge = responseById.get(edgeId);
      if (!baselineEdge || !responseEdge) throw new Error('expected translated internal edge');
      expect(getDisplayComputedPath(responseEdge), diagnostics).toEqual(
        getDisplayComputedPath(baselineEdge)
          .map(point => ({ x: point.x + 24, y: point.y + 8 })),
      );
    }
    const frozenBaseline = baselineById.get('edge-visibility-downstream');
    const frozenResponse = responseById.get('edge-visibility-downstream');
    if (!frozenBaseline || !frozenResponse) throw new Error('expected frozen external edge');
    expect(doBaseReactFlowDisplayRoutesMatchExactly(
      [frozenBaseline],
      [frozenResponse],
    ), diagnostics).toBe(true);
  }, 120_000);

  it('fails rigid translation closed for empty, resized, asymmetric, and extreme input', () => {
    const baselineNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
      { id: 'target', position: { x: 200, y: 0 }, width: 100, height: 60, data: {} },
    ];
    const edge: Edge = {
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 100, y: 30 }, { x: 200, y: 30 }] },
    };
    const baselineEdges = [edge];
    const createSeed = (nextNodes: Node[], candidateEdges = baselineEdges) => (
      createBaseReactFlowRigidMoveSeed({
        baselineEdges: candidateEdges,
        baselineNodes,
        nextNodes,
        changedNodeIds: ['source', 'target'],
        mutableEdgeIds: ['edge'],
      })
    );
    const emptyEdges: Edge[] = [];
    const empty = createSeed(baselineNodes, emptyEdges);
    expect(empty.edges).toBe(emptyEdges);
    expect(empty.rigidEdgeIds).toEqual([]);

    const asymmetric = createSeed([
      { ...baselineNodes[0], position: { x: 10, y: 8 } },
      { ...baselineNodes[1], position: { x: 209, y: 8 } },
    ]);
    expect(asymmetric.edges).toBe(baselineEdges);
    expect(asymmetric.rigidEdgeIds).toEqual([]);

    const resized = createSeed([
      { ...baselineNodes[0], position: { x: 10, y: 8 }, width: 101 },
      { ...baselineNodes[1], position: { x: 210, y: 8 } },
    ]);
    expect(resized.rigidEdgeIds).toEqual([]);

    const extreme = createSeed([
      { ...baselineNodes[0], position: { x: 1_000_001, y: 0 } },
      { ...baselineNodes[1], position: { x: 1_000_201, y: 0 } },
    ]);
    expect(extreme.rigidEdgeIds).toEqual([]);

    const invalidPath = createSeed([
      { ...baselineNodes[0], position: { x: 10, y: 8 } },
      { ...baselineNodes[1], position: { x: 210, y: 8 } },
    ], [{ ...edge, data: { computedPath: [{ x: Number.NaN, y: 0 }, { x: 1, y: 0 }] } }]);
    expect(invalidPath.rigidEdgeIds).toEqual([]);
  });
});
