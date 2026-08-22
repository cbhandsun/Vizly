// @vitest-environment jsdom

import type { Edge } from '@xyflow/react';
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
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
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
      ? getDisplayHardQualityGateReport(response.edges, nextNodes, 'polished')
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
});
