// @vitest-environment node
import type { Edge, Node, Position } from '@xyflow/react';
import { expect, it } from 'vitest';

import { repairBaseReactFlowFinalCommercialDetours } from '../baseReactFlowDisplayCommercialDetourRepair';
import {
  auditBaseReactFlowDisplayCommercialQuality,
} from '../baseReactFlowDisplayCommercialQuality';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';
import { finalizeBaseReactFlowExactCommercialClearance } from '../baseReactFlowDisplayFinalCommercialClearanceTransaction';

type Point = Readonly<{ x: number; y: number }>;

const nodes: Node[] = [
  ['upstream-systems', 1773.33, 491.5, 229, 73],
  ['logistics-oms', 1005, 469, 285, 118],
  ['wms-inbound', 496, 480, 217, 96],
  ['wms-outbound', 133, 367, 243, 96],
  ['wms-integration', 541, 255, 172, 96],
  ['tms-planning', 3129, 974.5, 250, 118],
  ['tms-execution', 2798, 861.5, 211, 96],
  ['tms-delivery', 2390, 861.5, 214, 96],
  ['fleet-management', 3671, 1077.5, 218, 96],
  ['driver-management', 3671, 861.5, 218, 96],
  ['gps', 3671, 420, 172, 96],
  ['frp', 3671, 204, 172, 96],
  ['carrier-portal', 1791.33, 684.5, 211, 96],
  ['mobile-app', 1846.33, 900.5, 156, 96],
  ['performance-analysis', 1880, 1332.5, 218, 96],
  ['cost-analysis', 1919, 1548.5, 140, 96],
  ['bi-report', 1572, 1332.5, 188, 96],
].map(([id, x, y, width, height]) => ({
  id: String(id),
  position: { x: Number(x), y: Number(y) },
  width: Number(width),
  height: Number(height),
  measured: { width: Number(width), height: Number(height) },
  data: {},
  type: 'custom',
})).concat([
  ['titlegroup-external', 1692.33, 339.5, 391, 721, 'titleGroup'],
  ['titlegroup-logistics', 924, 317, 447, 334, 'titleGroup'],
  ['titlegroup-wms', 52, 103, 742, 537, 'titleGroup'],
  ['titlegroup-tms', 2309, 644.5, 1151, 512, 'titleGroup'],
  ['titlegroup-fleet', 3590, 709.5, 375, 528, 'titleGroup'],
  ['titlegroup-tech', 3590, 52, 329, 528, 'titleGroup'],
  ['titlegroup-analytics', 1496, 1180.5, 683, 528, 'titleGroup'],
  ['subgroup-external-external', 1741.33, 427.5, 293, 597, 'subGroup'],
  ['subgroup-logistics-logistics', 973, 405, 349, 210, 'subGroup'],
  ['subgroup-wms-wms', 101, 191, 644, 413, 'subGroup'],
  ['subgroup-tms-core', 2766, 797.5, 645, 323, 'subGroup'],
  ['subgroup-tms-delivery', 2358, 797.5, 278, 188, 'subGroup'],
  ['subgroup-fleet-fleet', 3639, 797.5, 282, 404, 'subGroup'],
  ['subgroup-tech-tech', 3639, 140, 236, 404, 'subGroup'],
  ['subgroup-analytics-analytics', 1540, 1268.5, 590, 404, 'subGroup'],
].map(([id, x, y, width, height, type]) => ({
  id: String(id),
  position: { x: Number(x), y: Number(y) },
  width: Number(width),
  height: Number(height),
  measured: { width: Number(width), height: Number(height) },
  data: {},
  type: String(type),
})));

const endpointById: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['edge-cost-bi', ['cost-analysis', 'bi-report']],
  ['edge-driver-tms-execution', ['driver-management', 'tms-execution']],
  ['edge-fleet-tms-planning', ['fleet-management', 'tms-planning']],
  ['edge-frp-wms-integration', ['frp', 'wms-integration']],
  ['edge-gps-tms-execution', ['gps', 'tms-execution']],
  ['edge-oms-wms-inbound', ['logistics-oms', 'wms-inbound']],
  ['edge-oms-wms-outbound', ['logistics-oms', 'wms-outbound']],
  ['edge-analysis-bi', ['performance-analysis', 'bi-report']],
  ['edge-tms-mobile', ['tms-delivery', 'mobile-app']],
  ['edge-tms-performance', ['tms-delivery', 'performance-analysis']],
  ['edge-tms-carrier', ['tms-execution', 'carrier-portal']],
  ['edge-tms-execution-delivery', ['tms-execution', 'tms-delivery']],
  ['edge-tms-cost', ['tms-planning', 'cost-analysis']],
  ['edge-tms-planning-execution', ['tms-planning', 'tms-execution']],
  ['edge-upstream-oms', ['upstream-systems', 'logistics-oms']],
  ['edge-wms-inbound-outbound', ['wms-inbound', 'wms-outbound']],
  ['edge-wms-tms-planning', ['wms-outbound', 'tms-planning']],
] as const);

const pathsById = new Map<string, Point[]>([
  ['edge-cost-bi', [{ x: 1919, y: 1596.5 }, { x: 1832, y: 1596.5 }, { x: 1832, y: 1380.5 }, { x: 1760, y: 1380.5 }]],
  ['edge-driver-tms-execution', [{ x: 3671, y: 909.5 }, { x: 3009, y: 909.5 }]],
  ['edge-fleet-tms-planning', [{ x: 3671, y: 1125.5 }, { x: 3525, y: 1125.5 }, { x: 3525, y: 1033.5 }, { x: 3379, y: 1033.5 }]],
  ['edge-frp-wms-integration', [{ x: 3671, y: 252 }, { x: 2192, y: 252 }, { x: 2192, y: 303 }, { x: 713, y: 303 }]],
  ['edge-gps-tms-execution', [{ x: 3671, y: 468 }, { x: 3340, y: 468 }, { x: 3340, y: 909.5 }, { x: 3009, y: 909.5 }]],
  ['edge-oms-wms-inbound', [{ x: 1005, y: 528 }, { x: 713, y: 528 }]],
  ['edge-oms-wms-outbound', [{ x: 1005, y: 528 }, { x: 859, y: 528 }, { x: 859, y: 427 }, { x: 376, y: 427 }]],
  ['edge-analysis-bi', [{ x: 1880, y: 1380.5 }, { x: 1760, y: 1380.5 }]],
  ['edge-tms-mobile', [{ x: 2390, y: 905 }, { x: 2244, y: 905 }, { x: 2244, y: 949 }, { x: 2002, y: 949 }]],
  ['edge-tms-performance', [{ x: 2390, y: 905 }, { x: 2244, y: 905 }, { x: 2244, y: 1381 }, { x: 2098, y: 1381 }]],
  ['edge-tms-carrier', [{ x: 2798, y: 910 }, { x: 2726, y: 910 }, { x: 2726, y: 733 }, { x: 2002, y: 733 }]],
  ['edge-tms-execution-delivery', [{ x: 2798, y: 909.5 }, { x: 2604, y: 909.5 }]],
  ['edge-tms-cost', [{ x: 3129, y: 1066 }, { x: 2594, y: 1066 }, { x: 2594, y: 1597 }, { x: 2059, y: 1597 }]],
  ['edge-tms-planning-execution', [{ x: 3254, y: 974.5 }, { x: 3254, y: 910 }, { x: 3009, y: 910 }]],
  ['edge-upstream-oms', [{ x: 1773.33, y: 528 }, { x: 1290, y: 528 }]],
  ['edge-wms-inbound-outbound', [{ x: 496, y: 528 }, { x: 432, y: 528 }, { x: 432, y: 427 }, { x: 376, y: 427 }]],
  ['edge-wms-tms-planning', [{ x: 254, y: 367 }, { x: 254, y: 311 }, { x: 493, y: 311 }, { x: 493, y: 399 }, { x: 761, y: 399 }, { x: 761, y: 372 }, { x: 4061, y: 372 }, { x: 4061, y: 1010 }, { x: 3475, y: 1010 }, { x: 3475, y: 1034 }, { x: 3379, y: 1034 }]],
]);

const displayClearanceEdgeIds = new Set([
  'edge-cost-bi',
  'edge-tms-mobile',
  'edge-tms-carrier',
  'edge-wms-tms-planning',
]);
const terminalBridgeEdgeIds = new Set([
  'edge-tms-planning-execution',
  'edge-wms-tms-planning',
]);

const resolveHandle = (nodeId: string, point: Point): Position => {
  const node = nodes.find(candidate => candidate.id === nodeId);
  if (!node) throw new Error(`Missing test node: ${nodeId}`);
  const { x, y } = node.position;
  const width = node.width ?? 0;
  const height = node.height ?? 0;
  const distances = [
    ['left', Math.abs(point.x - x)],
    ['right', Math.abs(point.x - x - width)],
    ['top', Math.abs(point.y - y)],
    ['bottom', Math.abs(point.y - y - height)],
  ] as const;
  return distances.reduce((best, candidate) => (
    candidate[1] < best[1] ? candidate : best
  ))[0] as Position;
};

const edges: Edge[] = [...pathsById].map(([id, computedPath]) => {
  const endpoints = endpointById.get(id);
  if (!endpoints) throw new Error(`Missing test endpoints: ${id}`);
  const [source, target] = endpoints;
  return {
    id,
    source,
    target,
    sourceHandle: resolveHandle(source, computedPath[0]),
    targetHandle: resolveHandle(target, computedPath.at(-1) ?? computedPath[0]),
    type: 'stablePath',
    data: {
      computedPath,
      layoutDirection: 'RL',
      ...(displayClearanceEdgeIds.has(id) ? { displayNodeClearanceRepaired: true } : {}),
      ...(terminalBridgeEdgeIds.has(id) ? { terminalPortBridgeRepaired: true } : {}),
      ...(id === 'edge-wms-tms-planning' ? {
        detachedOverlapSeparated: true,
        detachedSourceEndpointReanchored: true,
        detachedTargetEndpointReanchored: false,
        displaySoftQualityRepaired: true,
        endpointOrthogonalRepaired: true,
      } : {}),
    },
  };
});

it('closes the real TMS reverse compound excessive-bend route without weakening hard geometry', () => {
  expect(getExactDisplayHardReport(edges, nodes).hardClean).toBe(true);
  expect(auditBaseReactFlowDisplayCommercialQuality(edges)).toEqual([{
    edgeId: 'edge-wms-tms-planning',
    kind: 'excessive-bends',
    limit: 6,
    value: 9,
  }]);
  const repaired = repairBaseReactFlowFinalCommercialDetours(edges, nodes, {
    preferredEdges: edges.map(edge => edge.id === 'edge-wms-tms-planning'
      ? { ...edge, sourceHandle: 'left' }
      : edge),
    skipLoopShortcut: true,
  });

  expect(getExactDisplayHardReport(repaired, nodes).hardClean).toBe(true);
  expect(auditBaseReactFlowDisplayCommercialQuality(repaired)).toEqual([]);

  const finalized = finalizeBaseReactFlowExactCommercialClearance({
    exactBaseline: {
      requestId: 'tms-reverse-layout-final',
      edges,
      hardClean: true,
      hardReport: getExactDisplayHardReport(edges, nodes),
      routeResolution: 'full-route',
    },
    repairNodes: nodes,
  });
  expect(finalized.hardClean).toBe(true);
  expect(auditBaseReactFlowDisplayCommercialQuality(finalized.edges ?? [])).toEqual([]);
});
