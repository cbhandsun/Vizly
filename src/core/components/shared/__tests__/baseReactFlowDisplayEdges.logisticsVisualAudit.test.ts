import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import type { StandardDiagramData } from '../../../models/DiagramModels';
import {
  auditRenderedEdgeRouting,
  type RenderedAuditEdge,
  type RenderedAuditNode,
} from '../../../algorithms/renderedEdgeRoutingAudit';
import {
  auditFinalSameSideEndpointOrder,
} from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  repairFinalSharedSourceTerminalTrunks,
} from '../../../strategies/shared/edgeFinalEndpointTopologyRepair';
import {
  auditFinalSameSidePassageOrder,
} from '../../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
} from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { createBaseReactFlowDisplayEdges } from '../baseReactFlowDisplayEdges';
import { auditBaseReactFlowDisplayCommercialQuality } from '../baseReactFlowDisplayCommercialQuality';
import { computeBaseReactFlowDisplayEdgeEpoch } from '../baseReactFlowDisplayEdgeCore';
import {
  countRenderUnsafeEndpointStubs,
} from '../baseReactFlowDisplayEndpointStubRepair';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import {
  repairBaseReactFlowFinalCommercialDetours,
  repairBaseReactFlowFinalEndpointOrder,
} from '../baseReactFlowDisplayFinalEndpointOrder';
import {
  buildBidirectionalPortBundleTransactionCandidates,
  repairBaseReactFlowFinalSafetyClosure,
} from '../baseReactFlowDisplayFinalSafetyClosure';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { parseBaseReactFlowPrecompiledRouteArtifact } from '../baseReactFlowPrecompiledRouteArtifact';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';
import { GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS } from '../generated/baseReactFlowPrecompiledRouteLoaders';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';
import { withAbsoluteNodePositions } from './baseReactFlowDisplayEdges.testUtils';
import {
  applySharedTrunkPaintPlan,
  createSharedTrunkJunctionFragments,
  readSharedTrunkPaintPlan,
} from '../../../rendering/sharedTrunkPaint';
import {
  browserColdRequestRoutes,
  browserLogisticsNodes,
  restoreBrowserColdRequestRouteHandles,
} from './fixtures/logisticsBrowserRoutingFixture';

type Point = { x: number; y: number };

const finiteNumber = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const edgePath = (edge: Edge | undefined): Point[] => {
  const raw = (edge?.data as { computedPath?: unknown } | undefined)?.computedPath;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(point => {
    if (!point || typeof point !== 'object') return [];
    const candidate = point as { x?: unknown; y?: unknown };
    const x = finiteNumber(candidate.x);
    const y = finiteNumber(candidate.y);
    return Number.isFinite(candidate.x) && Number.isFinite(candidate.y) ? [{ x, y }] : [];
  });
};

const toSvgPath = (points: Point[]): string => points
  .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
  .join(' ');

const LOGISTICS_NEAR_BEND_CROSSING_PAIRS = [
  'edge-loms-customs|edge-tms-carrier',
  'edge-loms-visibility|edge-tms-bms',
] as const;

const auditNode = (node: Node): RenderedAuditNode => {
  const absolute = (node as Node & { positionAbsolute?: Point }).positionAbsolute ?? node.position;
  return {
    id: node.id,
    type: node.type,
    x: finiteNumber(absolute.x),
    y: finiteNumber(absolute.y),
    width: finiteNumber(node.measured?.width ?? node.width ?? node.style?.width),
    height: finiteNumber(node.measured?.height ?? node.height ?? node.style?.height),
  };
};

const renderedRoutingAudit = (edges: Edge[], nodes: Node[]) => (
  auditRenderedEdgeRouting(
    edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      path: toSvgPath(edgePath(edge)),
    })),
    nodes.map(auditNode),
  )
);

const renderedStrictCrossingPairs = (edges: Edge[], nodes: Node[]): string[] => (
  renderedRoutingAudit(edges, nodes).errors.flatMap(finding => (
    finding.rule === 'edge-crossing' && finding.relatedEdgeIds?.length === 2
      ? [[...finding.relatedEdgeIds].sort().join('|')]
      : []
  )).sort()
);

const routeSnapshot = (edges: Edge[]) => edges.map(edge => ({
  id: edge.id,
  sourceHandle: edge.sourceHandle,
  targetHandle: edge.targetHandle,
  path: edgePath(edge),
}));

const renderedSharedTrunkJunctions = (edges: Edge[]) => applySharedTrunkPaintPlan(edges)
  .flatMap(edge => createSharedTrunkJunctionFragments(
    (edge.data as { computedPath?: unknown } | undefined)?.computedPath,
    readSharedTrunkPaintPlan(edge.data),
  ).map(junction => ({
    ownerEdgeId: edge.id,
    ...junction,
  })));

const legalTrunkIdentities = (
  order: ReturnType<typeof auditFinalSameSideEndpointOrder>,
): string[] => order.legalSharedTrunks.map(trunk => (
  `${trunk.nodeId}:${trunk.role}:${[...trunk.edgeIds].sort().join(',')}`
)).sort();

const maximalLegalTrunk = (
  order: ReturnType<typeof auditFinalSameSideEndpointOrder>,
  nodeId: string,
  role: 'source' | 'target',
) => [...order.legalSharedTrunks]
  .filter(trunk => trunk.nodeId === nodeId && trunk.role === role)
  .sort((left, right) => (
    right.edgeIds.length - left.edgeIds.length
    || right.commonStemLength - left.commonStemLength
    || left.id.localeCompare(right.id)
  ))[0];

const LOMS_COMMERCIAL_SOURCE_TRUNK_EDGES = [
  'edge-loms-tms',
  'edge-loms-visibility',
  'edge-loms-wms',
] as const;

const TMS_COMMERCIAL_SOURCE_TRUNK_EDGES = [
  'edge-tms-bms',
  'edge-tms-visibility',
  'edge-tms-yms',
] as const;

const WMS_COMMERCIAL_SOURCE_TRUNK_EDGES = [
  'edge-wms-bms',
  'edge-wms-visibility',
  'edge-wms-wcs',
] as const;

const VISIBILITY_COMMERCIAL_TARGET_TRUNK_EDGES = [
  'edge-loms-visibility',
  'edge-tms-visibility',
  'edge-wms-visibility',
] as const;

// Captured from the v122 production Worker before the final display gate. This
// is intentionally a complete graph: the L-OMS dual-trunk edge must retain both
// its source and target trunk identities while the residual crossing is fixed.
const capturedRejectedLogisticsEdges: Edge[] = [
  { id: 'edge-loms-customs', source: 'l-oms', target: 'customs', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'left', data: { computedPath: [{ x: 1065, y: 652 }, { x: 1065, y: 742 }, { x: 1454, y: 742 }, { x: 1454, y: 867 }, { x: 1526, y: 867 }] } },
  { id: 'edge-loms-tms', source: 'l-oms', target: 'tms', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 1065, y: 652 }, { x: 1065, y: 812 }] } },
  { id: 'edge-loms-visibility', source: 'l-oms', target: 'visibility', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 1065, y: 652 }, { x: 1065, y: 742 }, { x: 20, y: 742 }, { x: 20, y: 1450 }, { x: 1434, y: 1450 }, { x: 1434, y: 1540 }] } },
  { id: 'edge-loms-wms', source: 'l-oms', target: 'wms', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 1065, y: 652 }, { x: 1065, y: 755 }, { x: 191, y: 755 }, { x: 191, y: 812 }] } },
  { id: 'edge-tms-bms', source: 'tms', target: 'bms', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 1065, y: 930 }, { x: 1065, y: 1020 }, { x: 812, y: 1020 }, { x: 812, y: 1090 }] } },
  { id: 'edge-tms-carrier', source: 'tms', target: 'carrier-portal', type: 'stablePath', sourceHandle: 'top', targetHandle: 'bottom', data: { computedPath: [{ x: 1177, y: 812 }, { x: 1177, y: 722 }, { x: 1426, y: 722 }, { x: 1426, y: 202 }] } },
  { id: 'edge-tms-downstream', source: 'tms', target: 'downstream', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'bottom', data: { computedPath: [{ x: 1065, y: 930 }, { x: 1065, y: 1019 }, { x: 1929, y: 1019 }, { x: 1929, y: 179.5 }] } },
  { id: 'edge-tms-visibility', source: 'tms', target: 'visibility', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 1089, y: 930 }, { x: 1089, y: 1019 }, { x: 1498, y: 1019 }, { x: 1498, y: 1376 }, { x: 1434, y: 1376 }, { x: 1434, y: 1540 }] } },
  { id: 'edge-tms-yms', source: 'tms', target: 'yms', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 1054, y: 930 }, { x: 1054, y: 1020 }, { x: 1338, y: 1020 }, { x: 1338, y: 1090 }] } },
  { id: 'edge-upstream-loms', source: 'upstream', target: 'l-oms', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 895, y: 179.5 }, { x: 895, y: 236 }, { x: 1065, y: 236 }, { x: 1065, y: 534 }] } },
  { id: 'edge-visibility-downstream', source: 'visibility', target: 'downstream', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'bottom', data: { computedPath: [{ x: 1434, y: 1658 }, { x: 1434, y: 1842 }, { x: 1945, y: 1842 }, { x: 1945, y: 179.5 }] } },
  { id: 'edge-wms-bms', source: 'wms', target: 'bms', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 191, y: 930 }, { x: 191, y: 1000 }, { x: 731, y: 1000 }, { x: 731, y: 1090 }] } },
  { id: 'edge-wms-visibility', source: 'wms', target: 'visibility', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 186, y: 930 }, { x: 186, y: 1020 }, { x: 382, y: 1020 }, { x: 382, y: 1450 }, { x: 1434, y: 1450 }, { x: 1434, y: 1540 }] } },
  { id: 'edge-wms-wcs', source: 'wms', target: 'wcs', type: 'stablePath', sourceHandle: 'bottom', targetHandle: 'top', data: { computedPath: [{ x: 181, y: 930 }, { x: 181, y: 1090 }] } },
];

// Captured from the production browser after the full pipeline and measured
// repair. It is orthogonal and node-clear, but the batch was still rejected;
// this is the exact rollback that left the older DATA -> downstream route
// visibly crossing GTS in the canvas.
const browserFinalRejectedRoutes: Record<string, {
  sourceHandle: string;
  targetHandle: string;
  path: Point[];
}> = {
  'edge-loms-customs': { sourceHandle: 'right', targetHandle: 'top', path: [{ x: 1194, y: 593 }, { x: 1250, y: 593 }, { x: 1250, y: 72 }, { x: 2082, y: 72 }, { x: 2082, y: 742 }, { x: 1667, y: 742 }, { x: 1667, y: 823 }] },
  'edge-loms-tms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1038.85, y: 652 }, { x: 1038.85, y: 812 }] },
  'edge-loms-visibility': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1090.65, y: 652 }, { x: 1090.65, y: 802 }, { x: 1473, y: 802 }, { x: 1473, y: 1218 }, { x: 1434.3375, y: 1218 }, { x: 1434.3375, y: 1540 }] },
  'edge-loms-wms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 987, y: 652 }, { x: 987, y: 742 }, { x: 191, y: 742 }, { x: 191, y: 812 }] },
  'edge-tms-bms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1065, y: 930 }, { x: 1065, y: 1020 }, { x: 812, y: 1020 }, { x: 812, y: 1090 }] },
  'edge-tms-carrier': { sourceHandle: 'top', targetHandle: 'bottom', path: [{ x: 1099, y: 812 }, { x: 1099, y: 722 }, { x: 1426, y: 722 }, { x: 1426, y: 202 }] },
  'edge-tms-downstream': { sourceHandle: 'top', targetHandle: 'bottom', path: [{ x: 1099, y: 812 }, { x: 1099, y: 756 }, { x: 1482, y: 756 }, { x: 1482, y: 242 }, { x: 1875, y: 242 }, { x: 1875, y: 179.5 }] },
  'edge-tms-visibility': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1065, y: 930 }, { x: 1065, y: 1248 }, { x: 1434, y: 1248 }, { x: 1434, y: 1540 }] },
  'edge-tms-yms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1065, y: 930 }, { x: 1065, y: 1020 }, { x: 1338, y: 1020 }, { x: 1338, y: 1090 }] },
  'edge-upstream-loms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 895, y: 179.5 }, { x: 895, y: 236 }, { x: 1065, y: 236 }, { x: 1065, y: 534 }] },
  'edge-visibility-downstream': { sourceHandle: 'top', targetHandle: 'bottom', path: [{ x: 1502, y: 1540 }, { x: 1502, y: 242 }, { x: 1875.1125, y: 242 }, { x: 1875.1125, y: 179.5 }] },
  'edge-wms-bms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 302, y: 930 }, { x: 302, y: 1000 }, { x: 731, y: 1000 }, { x: 731, y: 1090 }] },
  'edge-wms-visibility': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 302, y: 930 }, { x: 302, y: 1024 }, { x: 370, y: 1024 }, { x: 370, y: 1483 }, { x: 1434, y: 1483 }, { x: 1434, y: 1540 }] },
  'edge-wms-wcs': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 302, y: 930 }, { x: 302, y: 1020 }, { x: 181, y: 1020 }, { x: 181, y: 1090 }] },
};

const browserFinalRejectedEdges: Edge[] = capturedRejectedLogisticsEdges.map(edge => {
  const route = browserFinalRejectedRoutes[edge.id];
  if (!route) return edge;
  return {
    ...edge,
    sourceHandle: route.sourceHandle,
    targetHandle: route.targetHandle,
    data: { ...edge.data, computedPath: route.path },
  };
});

describe('baseReactFlowDisplayEdges logistics visual audit', () => {
  it('builds a hard-clean bidirectional bundle transaction for the production rollback', () => {
    const absoluteNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const candidates = buildBidirectionalPortBundleTransactionCandidates(
      browserFinalRejectedEdges,
      absoluteNodes,
    );
    const reports = candidates.map(candidate => ({
      hard: getDisplayHardQualityGateReport(candidate, absoluteNodes, 'polished'),
      order: auditFinalSameSideEndpointOrder(candidate, absoluteNodes),
      passage: auditFinalSameSidePassageOrder(candidate, absoluteNodes),
      crossings: renderedStrictCrossingPairs(candidate, absoluteNodes),
      routes: routeSnapshot(candidate),
    }));
    expect(candidates.length, JSON.stringify(reports, null, 2)).toBeGreaterThan(0);
    expect(reports.some(report => (
      report.hard.hardClean
      && report.order.inversions === 0
      && report.order.ambiguousLaneTies === 0
      && report.order.collapsedLanePairs === 0
      && report.passage.passageDefects === 0
      && report.passage.nearTrunkOpportunities === 0
    )), JSON.stringify(reports, null, 2)).toBe(true);
  });

  it('atomically closes the production browser rollback without losing true trunks', () => {
    const absoluteNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const repaired = repairBaseReactFlowFinalSafetyClosure(
      browserFinalRejectedEdges,
      absoluteNodes,
    );
    const before = getDisplayHardQualityGateReport(
      browserFinalRejectedEdges,
      absoluteNodes,
      'polished',
    );
    const after = getDisplayHardQualityGateReport(repaired, absoluteNodes, 'polished');
    const order = auditFinalSameSideEndpointOrder(repaired, absoluteNodes);
    const passage = auditFinalSameSidePassageOrder(repaired, absoluteNodes);
    const diagnostics = JSON.stringify({
      before,
      after,
      beforeCrossings: renderedStrictCrossingPairs(browserFinalRejectedEdges, absoluteNodes),
      afterCrossings: renderedStrictCrossingPairs(repaired, absoluteNodes),
      order,
      passage,
      routes: routeSnapshot(repaired),
    }, null, 2);

    expect(before.hardClean).toBe(false);
    expect({
      hardClean: after.hardClean,
      inversions: order.inversions,
      ambiguousLaneTies: order.ambiguousLaneTies,
      collapsedLanePairs: order.collapsedLanePairs,
      passageDefects: passage.passageDefects,
      nearTrunkOpportunities: passage.nearTrunkOpportunities,
      unsafeEndpointStubs: countRenderUnsafeEndpointStubs(repaired),
    }, diagnostics).toEqual({
      hardClean: true,
      inversions: 0,
      ambiguousLaneTies: 0,
      collapsedLanePairs: 0,
      passageDefects: 0,
      nearTrunkOpportunities: 0,
      unsafeEndpointStubs: 0,
    });
    const sourceTrunks = order.legalSharedTrunks.filter(trunk => trunk.role === 'source');
    const targetTrunks = order.legalSharedTrunks.filter(trunk => trunk.role === 'target');
    expect(sourceTrunks.some(trunk => (
      trunk.edgeIds.includes('edge-tms-downstream')
      && trunk.commonStemLength >= 48
    )), diagnostics).toBe(true);
    expect(targetTrunks.some(trunk => (
      trunk.edgeIds.includes('edge-tms-downstream')
      && trunk.edgeIds.includes('edge-visibility-downstream')
      && trunk.commonStemLength >= 48
    )), diagnostics).toBe(true);
    expect(sourceTrunks.some(trunk => (
      trunk.nodeId === 'l-oms'
      && trunk.edgeIds.includes('edge-loms-tms')
      && trunk.edgeIds.includes('edge-loms-visibility')
      && trunk.edgeIds.includes('edge-loms-wms')
      && trunk.commonStemLength >= 90
    )), diagnostics).toBe(true);
    expect(targetTrunks.some(trunk => (
      trunk.nodeId === 'visibility'
      && trunk.edgeIds.includes('edge-loms-visibility')
      && trunk.edgeIds.includes('edge-tms-visibility')
      && trunk.edgeIds.includes('edge-wms-visibility')
      && trunk.commonStemLength >= 292
    )), diagnostics).toBe(true);
    expect(repairBaseReactFlowFinalSafetyClosure(repaired, absoluteNodes)).toBe(repaired);
  });

  it('accepts the captured production geometry after residual crossing and endpoint topology repair', () => {
    const absoluteNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const repaired = repairBaseReactFlowFinalEndpointOrder(
      capturedRejectedLogisticsEdges,
      absoluteNodes,
    );
    const order = auditFinalSameSideEndpointOrder(repaired, absoluteNodes);
    const diagnostics = JSON.stringify({
      before: getDisplayHardQualityGateReport(
        capturedRejectedLogisticsEdges,
        absoluteNodes,
        'polished',
      ),
      after: getDisplayHardQualityGateReport(repaired, absoluteNodes, 'polished'),
      crossingPairs: renderedStrictCrossingPairs(repaired, absoluteNodes),
      order,
      changed: repaired.flatMap((edge, index) => (
        edge === capturedRejectedLogisticsEdges[index]
          ? []
          : [{ id: edge.id, sourceHandle: edge.sourceHandle, path: edgePath(edge) }]
      )),
    }, null, 2);

    expect(getDisplayHardQualityGateReport(
      capturedRejectedLogisticsEdges,
      absoluteNodes,
      'polished',
    ).hardClean).toBe(false);
    expect(getDisplayHardQualityGateReport(repaired, absoluteNodes, 'polished').hardClean, diagnostics)
      .toBe(true);
    expect(countRenderUnsafeEndpointStubs(repaired), diagnostics).toBe(0);
    expect(renderedStrictCrossingPairs(repaired, absoluteNodes), diagnostics).toEqual([]);
    expect(repaired.find(edge => edge.id === 'edge-wms-bms')?.sourceHandle, diagnostics)
      .toBe('right');
    expect(order.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'l-oms'
      && trunk.role === 'source'
      && trunk.edgeIds.includes('edge-loms-visibility')
    ))?.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
    expect(order.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'visibility'
      && trunk.role === 'target'
      && trunk.edgeIds.includes('edge-loms-visibility')
    ))?.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
  });

  it('routes a selected L-OMS visibility target trunk around YMS without losing its endpoint stems', () => {
    const nodes: Node[] = [
      { id: 'l-oms', type: 'custom', position: { x: 935.25, y: 534 }, width: 259, height: 118, measured: { width: 259, height: 118 }, data: {} },
      { id: 'yms', type: 'custom', position: { x: 1213, y: 1090 }, width: 250, height: 118, measured: { width: 250, height: 118 }, data: {} },
      { id: 'visibility', type: 'custom', position: { x: 1286.3375, y: 1540 }, width: 296, height: 118, measured: { width: 296, height: 118 }, data: {} },
    ];
    const directThroughYms: Edge[] = [{
      id: 'edge-loms-visibility',
      source: 'l-oms',
      target: 'visibility',
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 1194.25, y: 593 },
          { x: 1434.3375, y: 593 },
          { x: 1434.3375, y: 1540 },
        ],
      },
    }];

    const repaired = repairBaseReactFlowFinalSafetyClosure(directThroughYms, nodes);
    const originalPath = edgePath(directThroughYms[0]);
    const repairedPath = edgePath(repaired[0]);
    const originalAudit = renderedRoutingAudit(directThroughYms, nodes);
    const repairedAudit = renderedRoutingAudit(repaired, nodes);

    expect(originalAudit.errors.some(finding => finding.rule === 'obstacle-hit')).toBe(true);
    expect(repairedAudit.errors).toEqual([]);
    expect(repairedPath.length).toBeGreaterThan(originalPath.length);
    expect(repairedPath.slice(0, 2)).toEqual(originalPath.slice(0, 2));
    expect(repairedPath.at(-1)).toEqual(originalPath.at(-1));
    expect(repairedPath.at(-2)?.x).toBe(1434.3375);
    expect(repairedPath.at(-2)?.y).toBeGreaterThan(1208);
    expect(getDisplayHardQualityGateReport(repaired, nodes, 'polished').hardClean).toBe(true);
  });

  it('produces a hard-clean logistics route without relying on a precompiled candidate', async () => {
    const canvas = await standardDataToCanvas(
      logisticsStandardData as unknown as StandardDiagramData,
    );
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'logistics-cold-full-route',
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      qualityMode: 'full',
    });
    const result = response.edges ?? [];
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes);
    const hardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
    const diagnostics = JSON.stringify({
      response: {
        hardClean: response.hardClean,
        routeResolution: response.routeResolution,
        phaseTrace: response.phaseTrace,
      },
      hardReport,
      routes: routeSnapshot(result),
    }, null, 2);

    expect(response.hardClean, diagnostics).toBe(true);
    expect(hardReport.hardClean, diagnostics).toBe(true);
    expect(renderedRoutingAudit(result, absoluteNodes).errors, diagnostics).toEqual([]);
    expect(response.phaseTrace, diagnostics).toContainEqual(expect.objectContaining({
      phase: 'post-render-finalize',
      resolution: 'skip',
    }));
  }, 120_000);

  it('closes the production browser cold-route seed before precompiled capture', async () => {
    const canvas = await standardDataToCanvas(
      logisticsStandardData as unknown as StandardDiagramData,
    );
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    // Keep the production browser's measured geometry. The standard-data
    // projection uses authored dimensions and previously let a pair of
    // post-ordering strict crossings escape this regression.
    const browserColdRequestNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const browserColdEdges = projected.edges.map(edge => {
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
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'logistics-browser-cold-route',
      edges: browserColdEdges,
      nodes: browserColdRequestNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
        nodes: browserColdRequestNodes,
        edges: browserColdEdges,
      }),
      qualityMode: 'full',
    });
    const result = response.edges ?? [];
    const absoluteNodes = browserColdRequestNodes;
    const hardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
    const diagnostics = JSON.stringify({
      response: {
        hardClean: response.hardClean,
        routeResolution: response.routeResolution,
        phaseTrace: response.phaseTrace,
      },
      hardReport,
      routeAudit: renderedRoutingAudit(result, absoluteNodes),
      endpointOrder: auditFinalSameSideEndpointOrder(result, absoluteNodes),
      passageOrder: auditFinalSameSidePassageOrder(result, absoluteNodes),
      routes: routeSnapshot(result),
    }, null, 2);

    expect(response.hardClean, diagnostics).toBe(true);
    expect(hardReport.hardClean, diagnostics).toBe(true);
    expect(renderedRoutingAudit(result, absoluteNodes).errors, diagnostics).toEqual([]);
    expect(response.phaseTrace, diagnostics).toContainEqual(expect.objectContaining({
      phase: 'post-render-finalize',
      resolution: 'fallback',
    }));
    expect(response.phaseTrace?.map(trace => trace.phase), diagnostics).toEqual(expect.arrayContaining([
      'post-render-soft-closure',
      'post-render-micro',
      'post-render-soft-quality',
      'post-render-residual',
      'post-render-terminal-gate',
    ]));
  }, 120_000);

  it('eliminates both historical one-pixel near-bend crossings without breaking dual-role trunks', async () => {
    const canvas = await standardDataToCanvas(
      logisticsStandardData as unknown as StandardDiagramData,
    );
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const result = createBaseReactFlowDisplayEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
    });
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes);
    const crossingPairs = renderedStrictCrossingPairs(result, absoluteNodes);
    const hardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
    const order = auditFinalSameSideEndpointOrder(result, absoluteNodes);
    const lomsSourceTrunk = order.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'l-oms'
      && trunk.role === 'source'
      && trunk.edgeIds.includes('edge-loms-visibility')
    ));
    const visibilityTargetTrunk = order.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'visibility'
      && trunk.role === 'target'
      && trunk.edgeIds.includes('edge-loms-visibility')
    ));
    const diagnostics = JSON.stringify({
      crossingPairs,
      hardReport,
      lomsSourceTrunk,
      visibilityTargetTrunk,
      paths: result.map(edge => ({ id: edge.id, path: edgePath(edge) })),
    }, null, 2);

    expect(hardReport.hardClean, diagnostics).toBe(true);
    expect(crossingPairs, diagnostics).toEqual([]);
    for (const pair of LOGISTICS_NEAR_BEND_CROSSING_PAIRS) {
      expect(crossingPairs, diagnostics).not.toContain(pair);
    }
    expect(lomsSourceTrunk?.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
    expect(visibilityTargetTrunk?.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
  }, 120_000);

  it('keeps the generated browser routes commercially clean and idempotent', async () => {
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
    artifact.edges = restoreBrowserColdRequestRouteHandles(artifact.edges);
    const absoluteNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const wrapped = repairBaseReactFlowFinalEndpointOrder(artifact.edges, absoluteNodes);
    const sourceTrunkRestored = repairFinalSharedSourceTerminalTrunks(
      artifact.edges,
      absoluteNodes,
    );
    const rewrapped = repairBaseReactFlowFinalEndpointOrder(wrapped, absoluteNodes);
    const commercial = repairBaseReactFlowFinalCommercialDetours(wrapped, absoluteNodes);
    const validatedCommercial = repairBaseReactFlowFinalCommercialDetours(
      wrapped,
      absoluteNodes,
      { skipLoopShortcut: true },
    );
    const revalidatedCommercial = repairBaseReactFlowFinalCommercialDetours(
      validatedCommercial,
      absoluteNodes,
      { skipLoopShortcut: true },
    );
    const wmsBms = artifact.edges.find(edge => edge.id === 'edge-wms-bms');
    const wmsVisibility = artifact.edges.find(edge => edge.id === 'edge-wms-visibility');
    if (!wmsBms || !wmsVisibility) throw new Error('expected the WMS browser routes');
    const baseline = auditFinalSameSideEndpointOrder(artifact.edges, absoluteNodes);
    const renderedJunctions = renderedSharedTrunkJunctions(artifact.edges);
    const reverseEdge = artifact.edges.find(edge => edge.id === 'edge-visibility-downstream');
    const dataTargetEdge = artifact.edges.find(edge => edge.id === 'edge-loms-visibility');
    const reversePath = edgePath(reverseEdge);
    const dataTargetPath = edgePath(dataTargetEdge);
    const reverseLaneX = reversePath[0]?.x ?? Number.NaN;
    const dataTargetLaneX = dataTargetPath.at(-1)?.x ?? Number.NaN;
    const reverseStrictCrossingPairs = renderedStrictCrossingPairs(artifact.edges, absoluteNodes)
      .filter(pair => pair.split('|').includes('edge-visibility-downstream'));
    const repairedOrder = auditFinalSameSideEndpointOrder(wrapped, absoluteNodes);
    const sourceTrunkRestoredOrder = auditFinalSameSideEndpointOrder(
      sourceTrunkRestored,
      absoluteNodes,
    );
    const rewrappedOrder = auditFinalSameSideEndpointOrder(rewrapped, absoluteNodes);
    const repairedWmsGroups = repairedOrder.groups.filter(group => (
      group.nodeId === 'wms' && group.role === 'source'
    ));
    const repairedBms = wrapped.find(edge => edge.id === wmsBms.id);
    const repairedVisibility = wrapped.find(edge => edge.id === wmsVisibility.id);
    const repairedWcs = wrapped.find(edge => edge.id === 'edge-wms-wcs');
    const visibilityTrunk = maximalLegalTrunk(repairedOrder, 'visibility', 'target');
    const lomsSourceTrunk = maximalLegalTrunk(repairedOrder, 'l-oms', 'source');
    const wmsSourceTrunk = maximalLegalTrunk(repairedOrder, 'wms', 'source');
    const baselineVisibilityTrunk = maximalLegalTrunk(baseline, 'visibility', 'target');
    const baselineLomsSourceTrunk = maximalLegalTrunk(baseline, 'l-oms', 'source');
    const audits = {
      artifact: renderedRoutingAudit(artifact.edges, absoluteNodes),
      wrapped: renderedRoutingAudit(wrapped, absoluteNodes),
      rewrapped: renderedRoutingAudit(rewrapped, absoluteNodes),
    };
    const validatedCommercialClearanceRisks = validatedCommercial.flatMap(edge => {
      const risk = scoreNodeClearanceRisk(
        edgePath(edge),
        absoluteNodes,
        edge,
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      );
      return risk > 0.5 ? [{ edgeId: edge.id, risk, path: edgePath(edge) }] : [];
    });
    const diagnostics = JSON.stringify({
      baseline,
      repairedOrder,
      sourceTrunkRestoredOrder,
      rewrappedOrder,
      audits,
      repairedWmsGroups,
      repairedWms: wrapped.filter(edge => edge.source === 'wms').map(edge => ({
        id: edge.id,
        sourceHandle: edge.sourceHandle,
        path: edgePath(edge),
      })),
      stableGeometry: {
        artifact: routeSnapshot(artifact.edges),
        wrapped: routeSnapshot(wrapped),
        rewrapped: routeSnapshot(rewrapped),
      },
      hardReport: getDisplayHardQualityGateReport(wrapped, absoluteNodes, 'polished'),
      baselineUnsafe: countRenderUnsafeEndpointStubs(artifact.edges),
      repairedUnsafe: countRenderUnsafeEndpointStubs(wrapped),
      renderedJunctions,
      reverseLane: {
        reverseLaneX,
        dataTargetLaneX,
        clearance: Math.abs(reverseLaneX - dataTargetLaneX),
        strictCrossingPairs: reverseStrictCrossingPairs,
      },
      reverseCommercialClearanceRisk: scoreNodeClearanceRisk(
        edgePath(commercial.find(edge => edge.id === 'edge-visibility-downstream')),
        absoluteNodes,
        commercial.find(edge => edge.id === 'edge-visibility-downstream'),
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ),
      validatedCommercialClearanceRisks,
    }, null, 2);
    const commercialIdempotenceDiagnostics = JSON.stringify({
      validated: validatedCommercial
        .filter(edge => edge.id === 'edge-tms-downstream')
        .map(edge => ({ data: edge.data, path: edgePath(edge) })),
      revalidated: revalidatedCommercial
        .filter(edge => edge.id === 'edge-tms-downstream')
        .map(edge => ({ data: edge.data, path: edgePath(edge) })),
    }, null, 2);

    expect(baseline.inversions, diagnostics).toBe(0);
    expect(revalidatedCommercial, commercialIdempotenceDiagnostics).toBe(validatedCommercial);
    expect(validatedCommercialClearanceRisks, diagnostics).toEqual([]);
    expect(baseline.ambiguousLaneTies, diagnostics).toBe(0);
    expect(baseline.collapsedLanePairs, diagnostics).toBe(0);
    expect(repairedOrder.inversions, diagnostics).toBe(0);
    expect(repairedOrder.ambiguousLaneTies, diagnostics).toBe(0);
    expect(repairedOrder.collapsedLanePairs, diagnostics).toBe(0);
    expect(rewrappedOrder.inversions, diagnostics).toBe(0);
    expect(rewrappedOrder.ambiguousLaneTies, diagnostics).toBe(0);
    expect(rewrappedOrder.collapsedLanePairs, diagnostics).toBe(0);
    expect(repairedWmsGroups.every(group => (
      group.inversions === 0 && group.collapsedLanePairs === 0
    )), diagnostics).toBe(true);
    expect(repairedBms?.sourceHandle, diagnostics).toBe('bottom');
    expect(maximalLegalTrunk(sourceTrunkRestoredOrder, 'wms', 'source')?.edgeIds, diagnostics)
      .toEqual([...WMS_COMMERCIAL_SOURCE_TRUNK_EDGES]);
    expect(edgePath(repairedWcs)[0]?.x, diagnostics)
      .toBe(edgePath(repairedVisibility)[0]?.x ?? Number.NaN);
    expect(wmsSourceTrunk?.edgeIds, diagnostics).toEqual([
      ...WMS_COMMERCIAL_SOURCE_TRUNK_EDGES,
    ]);
    expect(wmsSourceTrunk?.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
    expect(visibilityTrunk?.edgeIds, diagnostics).toEqual([
      'edge-loms-visibility',
      'edge-tms-visibility',
      'edge-wms-visibility',
    ]);
    expect(visibilityTrunk?.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
    expect(lomsSourceTrunk?.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
    expect(visibilityTrunk?.commonStemLength, diagnostics)
      .toBeGreaterThanOrEqual(baselineVisibilityTrunk?.commonStemLength ?? Number.POSITIVE_INFINITY);
    expect(lomsSourceTrunk?.commonStemLength, diagnostics)
      .toBeGreaterThanOrEqual(baselineLomsSourceTrunk?.commonStemLength ?? Number.POSITIVE_INFINITY);
    expect(legalTrunkIdentities(repairedOrder), diagnostics).toEqual(legalTrunkIdentities(baseline));
    expect(legalTrunkIdentities(rewrappedOrder), diagnostics)
      .toEqual(legalTrunkIdentities(repairedOrder));
    expect(rewrapped, diagnostics).toBe(wrapped);
    expect(scoreNodeClearanceRisk(
      reversePath,
      absoluteNodes,
      reverseEdge,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ), diagnostics).toBe(0);
    expect(renderedJunctions.some(junction => (
      junction.roles.includes('source')
      && junction.membershipIds.some(id => id.startsWith('source:l-oms:'))
      && junction.distance >= 48
    )), diagnostics).toBe(true);
    expect(renderedJunctions.some(junction => (
      junction.roles.includes('target')
      && junction.membershipIds.some(id => id.startsWith('target:visibility:'))
      && junction.distance >= 48
    )), diagnostics).toBe(true);
    expect(reverseStrictCrossingPairs, diagnostics).toEqual([]);
    expect(Math.abs(reverseLaneX - dataTargetLaneX), diagnostics).toBeGreaterThanOrEqual(48);
    expect(renderedJunctions.some(junction => (
      junction.roles.includes('target')
      && junction.membershipIds.some(id => id.startsWith('target:downstream:'))
      && junction.distance >= 48
    )), diagnostics).toBe(true);
    for (const [stage, audit] of Object.entries(audits)) {
      expect(audit.errors, `${stage}\n${diagnostics}`).toEqual([]);
    }
    for (const stableEdges of [artifact.edges, wrapped, rewrapped]) {
      expect(getDisplayHardQualityGateReport(stableEdges, absoluteNodes, 'polished').hardClean, diagnostics)
        .toBe(true);
      expect(countRenderUnsafeEndpointStubs(stableEdges), diagnostics).toBe(0);
    }
  });

  it('keeps the final rendered logistics routes clear of unrelated business nodes', async () => {
    const canvas = await standardDataToCanvas(
      logisticsStandardData as unknown as StandardDiagramData,
    );
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const result = createBaseReactFlowDisplayEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
    });
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes);
    const logisticsLoaderEntry = Object.entries(
      GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
    ).find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!logisticsLoaderEntry) throw new Error('expected the Logistics precompiled loader');
    const [precompiledInputSignature, precompiledDescriptor] = logisticsLoaderEntry;
    const precompiledArtifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'),
      {
        inputSignature: precompiledInputSignature,
        inputGeometryDigest: precompiledDescriptor.geometryDigest,
        sourceHash: precompiledDescriptor.sourceHash,
      },
    );
    if (!precompiledArtifact) throw new Error('expected the Logistics artifact to parse');
    const precompiledResult = restoreBrowserColdRequestRouteHandles(precompiledArtifact.edges);
    const precompiledAbsoluteNodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const workerResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'logistics-final-endpoint-order',
      edges: projected.edges,
      nodes: projected.nodes,
      candidateEdges: precompiledResult,
      candidateSource: 'precompiled',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      qualityMode: 'full',
    });
    const workerResult = workerResponse.edges ?? [];
    const workerCustomsPath = edgePath(
      workerResult.find(edge => edge.id === 'edge-loms-customs'),
    );
    const workerCommercialCustomsPath = edgePath(
      repairBaseReactFlowFinalCommercialDetours(workerResult, absoluteNodes)
        .find(edge => edge.id === 'edge-loms-customs'),
    );
    const renderedNodes = absoluteNodes.map(auditNode);
    const renderedEdges: RenderedAuditEdge[] = result.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      path: toSvgPath(edgePath(edge)),
    }));
    const audit = auditRenderedEdgeRouting(renderedEdges, renderedNodes);
    const nearNodeWarnings = audit.warnings.filter(
      finding => finding.rule === 'business-node-near-path',
    );
    const reportedBundleNearNodeWarnings = nearNodeWarnings.filter(finding => (
      finding.edgeId === 'edge-loms-visibility'
      || finding.edgeId === 'edge-tms-visibility'
      || finding.edgeId === 'edge-wms-visibility'
      || finding.edgeId === 'edge-visibility-downstream'
    ));
    const endpointOrder = auditFinalSameSideEndpointOrder(result, absoluteNodes);
    const passageOrder = auditFinalSameSidePassageOrder(result, absoluteNodes);
    const hardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
    const sourceX = (edges: Edge[], edgeId: string): number => {
      const found = edges.find(edge => edge.id === edgeId);
      return found ? edgePath(found)[0]?.x ?? Number.NaN : Number.NaN;
    };
    const routeContract = (edges: Edge[], contractNodes: Node[]) => {
      const order = auditFinalSameSideEndpointOrder(edges, contractNodes);
      const wmsBmsEdge = edges.find(edge => edge.id === 'edge-wms-bms');
      const lomsSourceTrunk = maximalLegalTrunk(order, 'l-oms', 'source');
      const tmsSourceTrunk = maximalLegalTrunk(order, 'tms', 'source');
      const visibilityTargetTrunk = maximalLegalTrunk(order, 'visibility', 'target');
      return {
        order,
        hardReport: getDisplayHardQualityGateReport(edges, contractNodes, 'polished'),
        renderedAudit: renderedRoutingAudit(edges, contractNodes),
        renderedStrictCrossingPairs: renderedStrictCrossingPairs(edges, contractNodes),
        unsafeEndpointStubs: countRenderUnsafeEndpointStubs(edges),
        wmsBottomSourceOrder: [
          sourceX(edges, 'edge-wms-wcs'),
          sourceX(edges, 'edge-wms-visibility'),
        ],
        wmsBmsSourceHandle: wmsBmsEdge?.sourceHandle,
        wmsSourceGroups: order.groups.filter(group => (
          group.nodeId === 'wms' && group.role === 'source'
        )),
        lomsSourceTrunk,
        tmsSourceTrunk,
        visibilityTargetTrunk,
        wmsSourceTrunk: maximalLegalTrunk(order, 'wms', 'source'),
        commercialTrunkSemantics: {
          lomsSource: lomsSourceTrunk?.edgeIds
            .filter(edgeId => LOMS_COMMERCIAL_SOURCE_TRUNK_EDGES.includes(
              edgeId as (typeof LOMS_COMMERCIAL_SOURCE_TRUNK_EDGES)[number],
            ))
            .sort(),
          tmsSource: tmsSourceTrunk ? [...tmsSourceTrunk.edgeIds].sort() : undefined,
          visibilityTarget: visibilityTargetTrunk
            ? [...visibilityTargetTrunk.edgeIds].sort()
            : undefined,
          dualTrunkEdgeRoles: [
            ...(lomsSourceTrunk?.edgeIds.includes('edge-loms-visibility')
              ? ['l-oms:source']
              : []),
            ...(visibilityTargetTrunk?.edgeIds.includes('edge-loms-visibility')
              ? ['visibility:target']
              : []),
          ],
        },
      };
    };
    const contracts = {
      synchronous: routeContract(result, absoluteNodes),
      precompiled: routeContract(precompiledResult, precompiledAbsoluteNodes),
      worker: routeContract(workerResult, absoluteNodes),
    };
    const unsafeStubCeiling = countRenderUnsafeEndpointStubs(precompiledResult);
    const diagnostics = JSON.stringify({
      errors: audit.errors,
      nearNodeWarnings,
      endpointOrder,
      passageOrder,
      hardReport,
      workerResponse,
      contracts,
      unsafeStubCeiling,
      paths: result.map(edge => ({ id: edge.id, path: edgePath(edge) })),
    }, null, 2);

    expect(reportedBundleNearNodeWarnings, diagnostics).toEqual([]);
    expect(audit.errors, diagnostics).toEqual([]);
    expect(endpointOrder.inversions, diagnostics).toBe(0);
    expect(endpointOrder.ambiguousLaneTies, diagnostics).toBe(0);
    expect(endpointOrder.collapsedLanePairs, diagnostics).toBe(0);
    expect(passageOrder.nearTrunkOpportunities, diagnostics).toBe(0);
    expect(hardReport.hardClean, diagnostics).toBe(true);
    expect(countRenderUnsafeEndpointStubs(result), diagnostics).toBe(0);
    expect(workerResponse.error, diagnostics).toBeUndefined();
    expect(workerResponse.routeResolution, diagnostics).toMatch(/^full-route(?:-repaired)?$/);
    expect(workerCustomsPath, diagnostics).toEqual(workerCommercialCustomsPath);
    expect(auditBaseReactFlowDisplayCommercialQuality(workerResult), diagnostics).toEqual([]);
    for (const contract of Object.values(contracts)) {
      expect(contract.order.inversions, diagnostics).toBe(0);
      expect(contract.order.ambiguousLaneTies, diagnostics).toBe(0);
      expect(contract.hardReport.hardClean, diagnostics).toBe(true);
      expect(contract.renderedAudit.errors, diagnostics).toEqual([]);
      expect(contract.renderedStrictCrossingPairs, diagnostics).toEqual([]);
      for (const pair of LOGISTICS_NEAR_BEND_CROSSING_PAIRS) {
        expect(contract.renderedStrictCrossingPairs, diagnostics).not.toContain(pair);
      }
      expect(contract.unsafeEndpointStubs, diagnostics).toBeLessThanOrEqual(unsafeStubCeiling);
      expect(contract.wmsBottomSourceOrder[0], diagnostics)
        .toBeLessThanOrEqual(contract.wmsBottomSourceOrder[1]);
      expect(contract.wmsSourceGroups.every(group => (
        group.inversions === 0
        && group.ambiguousLaneTies === 0
        && group.collapsedLanePairs === 0
      )), diagnostics).toBe(true);
      if (contract.lomsSourceTrunk) {
        expect(contract.lomsSourceTrunk.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
      }
      if (contract.tmsSourceTrunk) {
        expect(contract.tmsSourceTrunk.commonStemLength, diagnostics).toBeGreaterThanOrEqual(48);
      }
      if (contract.visibilityTargetTrunk) {
        expect(contract.visibilityTargetTrunk.commonStemLength, diagnostics)
          .toBeGreaterThanOrEqual(48);
      }
    }
    expect(contracts.precompiled.wmsBmsSourceHandle, diagnostics).toBe('bottom');
    expect(contracts.precompiled.wmsSourceTrunk?.edgeIds, diagnostics)
      .toEqual([...WMS_COMMERCIAL_SOURCE_TRUNK_EDGES]);
    expect(contracts.precompiled.wmsSourceTrunk?.commonStemLength, diagnostics)
      .toBeGreaterThanOrEqual(48);
    expect(contracts.precompiled.lomsSourceTrunk?.edgeIds, diagnostics)
      .toEqual(expect.arrayContaining([...LOMS_COMMERCIAL_SOURCE_TRUNK_EDGES]));
    expect(contracts.precompiled.tmsSourceTrunk?.edgeIds, diagnostics)
      .toEqual([...TMS_COMMERCIAL_SOURCE_TRUNK_EDGES]);
    expect(contracts.precompiled.visibilityTargetTrunk?.edgeIds, diagnostics)
      .toEqual([...VISIBILITY_COMMERCIAL_TARGET_TRUNK_EDGES]);
    expect(contracts.precompiled.commercialTrunkSemantics.dualTrunkEdgeRoles, diagnostics).toEqual([
      'l-oms:source',
      'visibility:target',
    ]);
  }, 120_000);

  it('pulls an overextended shared data branch back into a clear interior corridor', async () => {
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
    artifact.edges = restoreBrowserColdRequestRouteHandles(artifact.edges);
    const nodes = withAbsoluteNodePositions(browserLogisticsNodes);
    const repaired = repairBaseReactFlowFinalCommercialDetours(artifact.edges, nodes);
    const before = edgePath(artifact.edges.find(edge => edge.id === 'edge-wms-visibility'));
    const after = edgePath(repaired.find(edge => edge.id === 'edge-wms-visibility'));
    const length = (path: Point[]) => path.slice(1).reduce((total, point, index) => (
      total + Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y)
    ), 0);
    const order = auditFinalSameSideEndpointOrder(repaired, nodes);
    const hard = getDisplayHardQualityGateReport(repaired, nodes, 'polished');
    const diagnostics = JSON.stringify({ before, after, hard, order }, null, 2);

    expect(Math.min(...after.map(point => point.x)), diagnostics)
      .toBeGreaterThanOrEqual(-COMMERCIAL_BUSINESS_NODE_CLEARANCE);
    expect(length(after)).toBeLessThanOrEqual(length(before));
    expect(maximalLegalTrunk(order, 'wms', 'source')?.edgeIds)
      .toEqual([...WMS_COMMERCIAL_SOURCE_TRUNK_EDGES]);
    expect(maximalLegalTrunk(order, 'visibility', 'target')?.edgeIds)
      .toEqual([...VISIBILITY_COMMERCIAL_TARGET_TRUNK_EDGES]);
    expect(hard.hardClean, diagnostics).toBe(true);
  }, 120_000);

});
