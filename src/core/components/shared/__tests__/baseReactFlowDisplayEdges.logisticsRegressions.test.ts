import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import tmsStandardData from '../../../../data/standardized/TmsStandardData.json';
import wmsProcessFlowStandardData from '../../../../data/standardized/WmsProcessFlowStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  displayEdgesHaveNodeAnchoredTerminals,
  displayEdgesHaveNodeAttachedTerminals,
} from '../baseReactFlowTerminalAxisRepair';
import {
  createBaseReactFlowDisplayEdges,
  createBaseReactFlowPreDisplayFinalEdges,
} from '../baseReactFlowDisplayEdges';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayOutputRouteSignature,
} from '../baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';
import {
  createBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayRoutingTransactions,
  resolveBaseReactFlowDisplayCacheReplaySignature,
} from '../baseReactFlowDisplayRoutingTransaction';
import {
  countHairpins,
  detachedDisplayEndpoints,
  edgeNodeObstacleHits,
  edgeOverlapProblems,
  node,
  strictPathCrossings,
  tinyInteriorSegments,
  withAbsoluteNodePositions,
} from './baseReactFlowDisplayEdges.testUtils';

type PositionedNode = Node & {
  positionAbsolute: { x: number; y: number };
};

describe('baseReactFlowDisplayEdges logistics regressions', () => {
  it('removes logistics multi-trunk crossings before display', () => {
    const nodes: Node[] = [
      node('upstream', 985.487, 119, 303, 119),
      node('l-oms', 1120.25, 605, 406, 197),
      node('wms', 42, 962, 420, 236),
      node('wcs', 32, 1358, 420, 236),
      node('tms', 1113.25, 962, 420, 236),
      node('customs', 1853.25, 981.5, 420, 197),
      node('bms', 772, 1377.5, 378, 197),
      node('yms', 1470, 1377.5, 389, 197),
      node('visibility', 1579.69, 1922, 420, 236),
      node('carrier-portal', 1608.49, 80, 322, 197),
      node('downstream', 2250.49, 119, 336, 119),
    ];
    const paths: Array<[string, string, string, Array<{ x: number; y: number }>]> = [
      ['edge-loms-customs', 'l-oms', 'customs', [{ x: 1323, y: 802 }, { x: 1323, y: 885 }, { x: 2063, y: 885 }, { x: 2063, y: 981 }]],
      ['edge-loms-tms', 'l-oms', 'tms', [{ x: 1323, y: 802 }, { x: 1323, y: 962 }]],
      ['edge-loms-visibility', 'l-oms', 'visibility', [{ x: 1526.25, y: 703.5 }, { x: 1574.25, y: 703.5 }, { x: 1574.25, y: 329 }, { x: 1113, y: 329 }, { x: 1113, y: 270 }, { x: 18, y: 270 }, { x: 18, y: 1825 }, { x: 1790, y: 1825 }, { x: 1790, y: 1922 }]],
      ['edge-loms-wms', 'l-oms', 'wms', [{ x: 1323, y: 802 }, { x: 1323, y: 873 }, { x: 252, y: 873 }, { x: 252, y: 962 }]],
      ['edge-tms-bms', 'tms', 'bms', [{ x: 1113.25, y: 1187 }, { x: 1024, y: 1187 }, { x: 1024, y: 1377 }]],
      ['edge-tms-carrier', 'tms', 'carrier-portal', [{ x: 1306, y: 962 }, { x: 236, y: 962 }, { x: 236, y: 785 }, { x: 1713, y: 785 }, { x: 1713, y: 277 }]],
      ['edge-tms-downstream', 'tms', 'downstream', [{ x: 1323, y: 1198 }, { x: 1323, y: 1294 }, { x: 2418, y: 1294 }, { x: 2418, y: 238 }]],
      ['edge-tms-visibility', 'tms', 'visibility', [{ x: 1306, y: 1198 }, { x: 1306, y: 1825 }, { x: 1790, y: 1825 }, { x: 1790, y: 1922 }]],
      ['edge-tms-yms', 'tms', 'yms', [{ x: 1306, y: 1198 }, { x: 1306, y: 1295 }, { x: 1665, y: 1295 }, { x: 1665, y: 1377 }]],
      ['edge-upstream-loms', 'upstream', 'l-oms', [{ x: 1137, y: 238 }, { x: 1137, y: 328 }, { x: 1097, y: 328 }, { x: 1097, y: 488 }, { x: 1323, y: 488 }, { x: 1323, y: 605 }]],
      ['edge-visibility-downstream', 'visibility', 'downstream', [{ x: 1790, y: 2158 }, { x: 1790, y: 2254 }, { x: 2418, y: 2254 }, { x: 2418, y: 238 }]],
      ['edge-wms-bms', 'wms', 'bms', [{ x: 252, y: 1198 }, { x: 252, y: 1281 }, { x: 898, y: 1281 }, { x: 898, y: 1377 }]],
      ['edge-wms-visibility', 'wms', 'visibility', [{ x: 247, y: 1198 }, { x: 247, y: 1295 }, { x: 537, y: 1295 }, { x: 537, y: 1825 }, { x: 1790, y: 1825 }, { x: 1790, y: 1922 }]],
      ['edge-wms-wcs', 'wms', 'wcs', [{ x: 242, y: 1198 }, { x: 242, y: 1358 }]],
    ];
    const handlesByEdgeId: Record<string, [string, string]> = {
      'edge-loms-customs': ['bottom', 'top'],
      'edge-loms-tms': ['bottom', 'top'],
      'edge-loms-visibility': ['right', 'top'],
      'edge-loms-wms': ['bottom', 'top'],
      'edge-tms-bms': ['left', 'top'],
      'edge-tms-carrier': ['top', 'bottom'],
      'edge-tms-downstream': ['bottom', 'bottom'],
      'edge-tms-visibility': ['bottom', 'top'],
      'edge-tms-yms': ['bottom', 'top'],
      'edge-upstream-loms': ['bottom', 'top'],
      'edge-visibility-downstream': ['bottom', 'bottom'],
      'edge-wms-bms': ['bottom', 'top'],
      'edge-wms-visibility': ['bottom', 'top'],
      'edge-wms-wcs': ['bottom', 'top'],
    };
    const edges = paths.map(([id, source, target, computedPath]) => ({
      id,
      source,
      target,
      sourceHandle: handlesByEdgeId[id]?.[0],
      targetHandle: handlesByEdgeId[id]?.[1],
      type: 'advanced-smart-step',
      data: {
        autoSource: false,
        autoTarget: false,
        auto: [],
        computedPath,
        layoutPathLocked: true,
        layoutDirection: 'TB',
        runtimeHandleLock: { source: true, target: true },
      },
    })) as Edge[];

    const result = createBaseReactFlowPreDisplayFinalEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 800,
    });
    const resultPaths = result.map((edge) => ({
      id: edge.id,
      path: (edge.data as any).computedPath as Array<{ x: number; y: number }>,
    }));

    expect(strictPathCrossings(resultPaths), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(edgeNodeObstacleHits(result, nodes), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(detachedDisplayEndpoints(result, nodes), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(displayEdgesHaveNodeAnchoredTerminals(result, nodes), JSON.stringify({
      resultPaths,
      invalidTerminalEdges: result
        .filter(edge => !displayEdgesHaveNodeAnchoredTerminals([edge], nodes))
        .map(edge => edge.id),
    }, null, 2)).toBe(true);
    expect(calculateEdgePathQualityScore(result).nonOrthogonalSegments).toBe(0);
    const carrierEdge = result.find(edge => edge.id === 'edge-tms-carrier');
    const downstreamEdge = result.find(edge => edge.id === 'edge-tms-downstream');
    const carrierPath = resultPaths.find(path => path.id === 'edge-tms-carrier')?.path ?? [];
    const downstreamPath = resultPaths.find(path => path.id === 'edge-tms-downstream')?.path ?? [];
    const expectTerminalDirections = (
      edge: Edge | undefined,
      path: Array<{ x: number; y: number }>,
    ) => {
      const start = path[0];
      const next = path[1];
      const previous = path[path.length - 2];
      const end = path[path.length - 1];
      expect(start && next && previous && end).toBeTruthy();
      if (edge?.sourceHandle === 'top') expect(start.y - next.y).toBeGreaterThanOrEqual(48);
      if (edge?.sourceHandle === 'bottom') expect(next.y - start.y).toBeGreaterThanOrEqual(48);
      if (edge?.sourceHandle === 'left') expect(start.x - next.x).toBeGreaterThanOrEqual(48);
      if (edge?.sourceHandle === 'right') expect(next.x - start.x).toBeGreaterThanOrEqual(48);
      if (edge?.targetHandle === 'top') expect(end.y - previous.y).toBeGreaterThanOrEqual(48);
      if (edge?.targetHandle === 'bottom') expect(previous.y - end.y).toBeGreaterThanOrEqual(48);
      if (edge?.targetHandle === 'left') expect(end.x - previous.x).toBeGreaterThanOrEqual(48);
      if (edge?.targetHandle === 'right') expect(previous.x - end.x).toBeGreaterThanOrEqual(48);
    };
    expectTerminalDirections(carrierEdge, carrierPath);
    expectTerminalDirections(downstreamEdge, downstreamPath);
    expect(countHairpins(carrierPath)).toBe(0);
    expect(tinyInteriorSegments(carrierPath)).toEqual([]);
    expect(carrierPath.length).toBeLessThanOrEqual(7);
    expect(Math.max(...downstreamPath.map(point => point.y)), JSON.stringify(downstreamPath)).toBeLessThanOrEqual(1294);
    const downstreamLength = downstreamPath.slice(1).reduce((total, point, index) => (
      total
        + Math.abs(point.x - downstreamPath[index].x)
        + Math.abs(point.y - downstreamPath[index].y)
    ), 0);
    const downstreamDirect = Math.abs((downstreamPath.at(-1)?.x ?? 0) - (downstreamPath[0]?.x ?? 0))
      + Math.abs((downstreamPath.at(-1)?.y ?? 0) - (downstreamPath[0]?.y ?? 0));
    expect(downstreamLength / Math.max(1, downstreamDirect), JSON.stringify(downstreamPath)).toBeLessThanOrEqual(1.25);
  }, 45_000);

  it('keeps generated logistics terminal routes outside node bodies', async () => {
    const canvas = await standardDataToCanvas(logisticsStandardData as any);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const result = createBaseReactFlowDisplayEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
        edges: projected.edges,
        nodes: projected.nodes,
      }),
    });
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes as any);
    const carrierEdge = result.find(edge => edge.id === 'edge-tms-carrier');
    const customsEdge = result.find(edge => edge.id === 'edge-loms-customs');
    const customsPath = ((customsEdge?.data as any)?.computedPath || []) as Array<{ x: number; y: number }>;
    const customsDirect = customsPath.length >= 2
      ? Math.abs(customsPath.at(-1)!.x - customsPath[0].x)
        + Math.abs(customsPath.at(-1)!.y - customsPath[0].y)
      : 0;
    const customsLength = customsPath.slice(1).reduce((total, point, index) => (
      total + Math.abs(point.x - customsPath[index].x) + Math.abs(point.y - customsPath[index].y)
    ), 0);

    expect(carrierEdge).toBeDefined();
    expect(customsEdge).toBeDefined();
    expect(edgeNodeObstacleHits(
      [carrierEdge, customsEdge].filter((edge): edge is Edge => Boolean(edge)),
      absoluteNodes,
    )).toEqual([]);
    expect(customsPath[1]?.x).toBe(customsPath[0]?.x);
    expect((customsPath[1]?.y ?? 0) - (customsPath[0]?.y ?? 0)).toBeGreaterThanOrEqual(48);
    expect(customsLength / Math.max(1, customsDirect), JSON.stringify(customsPath)).toBeLessThanOrEqual(1.25);
    expect(calculateEdgePathQualityScore(result).nonOrthogonalSegments).toBe(0);
  }, 60_000);

  it('builds a final-quality logistics candidate within the interactive budget', async () => {
    const canvas = await standardDataToCanvas(logisticsStandardData as any);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const startedAt = performance.now();
    const result = createBaseReactFlowDisplayEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
    });
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes as any);
    const durationMs = performance.now() - startedAt;
    const paths = result.map(edge => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      hairpins: calculateEdgePathQualityScore([edge]).hairpins,
      tinyInteriorDoglegs: calculateEdgePathQualityScore([edge]).tinyInteriorDoglegs,
      path: ((edge.data as any).computedPath || []) as Array<{ x: number; y: number }>,
    }));
    const quality = calculateEdgePathQualityScore(result);

    expect(
      quality.nonOrthogonalSegments,
      JSON.stringify({ quality, paths }, null, 2),
    ).toBe(0);
    expect(
      quality.strictCrossings,
      JSON.stringify({ strictCrossings: strictPathCrossings(paths), paths }, null, 2),
    ).toBe(0);
    expect(
      quality.reverseOverlap,
      JSON.stringify(edgeOverlapProblems(result), null, 2),
    ).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.unexplainedRelatedOverlap).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(
      quality.tinyInteriorDoglegs,
      JSON.stringify({ quality, paths: paths.filter(path => path.tinyInteriorDoglegs > 0) }, null, 2),
    ).toBe(0);
    expect(
      quality.hairpins,
      JSON.stringify({ quality, paths: paths.filter(path => path.hairpins > 0) }, null, 2),
    ).toBe(0);
    expect(edgeNodeObstacleHits(result, absoluteNodes), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes)).toBe(true);
    expect(durationMs, JSON.stringify({ quality, paths }, null, 2)).toBeLessThan(3_000);
  }, 30_000);

  it('keeps the browser worker logistics candidate under the same hard gates', async () => {
    const canvas = await standardDataToCanvas(logisticsStandardData as any);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const browserMeasuredNodes: PositionedNode[] = [
      { ...node('titlegroup-external', 953.4875, 0, 1715.4, 365), type: 'titleGroup', positionAbsolute: { x: 953.4875, y: 0 } },
      { ...node('titlegroup-logistics', 0, 525, 2368.25, 1157), type: 'titleGroup', positionAbsolute: { x: 0, y: 525 } },
      { ...node('titlegroup-data', 1547.6875, 1842, 547, 404), type: 'titleGroup', positionAbsolute: { x: 1547.6875, y: 1842 } },
      { ...node('upstream', 32, 119, 303, 119), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 985.4875, y: 119 } },
      { ...node('l-oms', 1120.25, 80, 406, 197), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1120.25, y: 605 } },
      { ...node('wms', 42, 437, 420, 236), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 42, y: 962 } },
      { ...node('wcs', 32, 833, 420, 236), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 32, y: 1358 } },
      { ...node('tms', 1113.25, 437, 420, 236), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1113.25, y: 962 } },
      { ...node('customs', 1853.25, 456.5, 420, 197), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1853.25, y: 981.5 } },
      { ...node('bms', 772, 852.5, 378, 197), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 772, y: 1377.5 } },
      { ...node('yms', 1470, 852.5, 389, 197), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1470, y: 1377.5 } },
      { ...node('carrier-portal', 655, 80, 322, 197), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 1608.4875, y: 80 } },
      { ...node('visibility', 32, 80, 420, 236), parentId: 'titlegroup-data', type: 'custom', positionAbsolute: { x: 1579.6875, y: 1922 } },
      { ...node('downstream', 1297, 119, 336, 119), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 2250.4875, y: 119 } },
    ];
    const browserLockedRoutes: Record<string, {
      sourceHandle: string;
      targetHandle: string;
      computedPath: Array<{ x: number; y: number }>;
      auto?: boolean;
      metadata?: Record<string, boolean>;
    }> = {
      'edge-loms-customs': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1445, y: 803 },
          { x: 1445, y: 899 },
          { x: 2063, y: 899 },
          { x: 2063, y: 981 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-loms-tms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1282.65, y: 803 },
          { x: 1282.65, y: 961 },
        ],
      },
      'edge-loms-visibility': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1363.85, y: 803 },
          { x: 1363.85, y: 952 },
          { x: 1869, y: 1367.5 },
          { x: 1789.6875, y: 1584.5 },
          { x: 1789.6875, y: 1921 },
        ],
      },
      'edge-tms-carrier': {
        sourceHandle: 'top',
        targetHandle: 'bottom',
        computedPath: [
          { x: 1253, y: 961 },
          { x: 1253, y: 885 },
          { x: 1769, y: 885 },
          { x: 1769, y: 278 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-loms-wms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1201, y: 803 },
          { x: 1201, y: 899 },
          { x: 252, y: 899 },
          { x: 252, y: 961 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-tms-bms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1218, y: 1199 },
          { x: 1218, y: 1295 },
          { x: 1200, y: 1295 },
          { x: 1200, y: 1211 },
          { x: 1042, y: 1211 },
          { x: 1042, y: 1199 },
          { x: 1024, y: 1199 },
          { x: 1024, y: 1377 },
        ],
        metadata: {
          crossingOptimized: true,
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
          sharedTrunkAware: true,
        },
      },
      'edge-tms-downstream': {
        sourceHandle: 'top',
        targetHandle: 'bottom',
        computedPath: [
          { x: 1323, y: 962 },
          { x: 1323, y: 866 },
          { x: 2362, y: 866 },
          { x: 2362, y: 239 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: true,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-tms-visibility': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1428, y: 1199 },
          { x: 1428, y: 1295 },
          { x: 1895, y: 1295 },
          { x: 1895, y: 1921 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-tms-yms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1323, y: 1199 },
          { x: 1323, y: 1281 },
          { x: 1665, y: 1281 },
          { x: 1665, y: 1377 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-upstream-loms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        auto: true,
        computedPath: [
          { x: 1137, y: 239 },
          { x: 1137, y: 328 },
          { x: 1323, y: 328 },
          { x: 1323, y: 604 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-visibility-downstream': {
        sourceHandle: 'top',
        targetHandle: 'bottom',
        computedPath: [
          { x: 1886, y: 1921 },
          { x: 1886, y: 1827 },
          { x: 2474, y: 1827 },
          { x: 2474, y: 239 },
        ],
        metadata: {
          detachedOverlapSeparated: true,
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-wms-bms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 252, y: 1199 },
          { x: 252, y: 1281 },
          { x: 898, y: 1281 },
          { x: 898, y: 1377 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-wms-visibility': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 357, y: 1199 },
          { x: 357, y: 1919 },
          { x: 1685, y: 1919 },
          { x: 1685, y: 1921 },
        ],
        metadata: {
          detachedOverlapSeparated: true,
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-wms-wcs': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 147, y: 1199 },
          { x: 147, y: 1295 },
          { x: 242, y: 1295 },
          { x: 242, y: 1357 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
    };
    const browserProjected = {
      ...projected,
      nodes: browserMeasuredNodes,
      edges: projected.edges.map(edge => {
        const lockedRoute = browserLockedRoutes[edge.id];
        if (!lockedRoute) return edge;
        return {
          ...edge,
          type: 'advanced-smart-step',
          sourceHandle: lockedRoute.sourceHandle,
          targetHandle: lockedRoute.targetHandle,
          data: {
            auto: lockedRoute.auto ? ['source', 'target'] : [],
            autoSource: lockedRoute.auto === true,
            autoTarget: lockedRoute.auto === true,
            computedPath: lockedRoute.computedPath,
            layoutPathLocked: true,
            runtimeHandleLock: { source: true, target: true },
            ...(lockedRoute.metadata || {}),
          },
        };
      }),
    };
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'logistics-worker-hard-gates',
      edges: browserProjected.edges,
      nodes: browserProjected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(browserProjected),
      qualityMode: 'full',
    });
    const absoluteNodes = withAbsoluteNodePositions(browserProjected.nodes as any);
    const result = response.edges ?? [];
    const quality = calculateEdgePathQualityScore(result);
    const paths = result.map(edge => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      path: ((edge.data as any)?.computedPath || []) as Array<{ x: number; y: number }>,
    }));

    expect(response.error).toBeUndefined();
    expect(response.hardClean, JSON.stringify({ quality, paths }, null, 2)).toBe(true);
    expect(edgeNodeObstacleHits(result, absoluteNodes), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes)).toBe(true);
  }, 30_000);

  it('builds the WMS process final candidate within the cold quality budget', async () => {
    const canvas = await standardDataToCanvas(wmsProcessFlowStandardData as any);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const startedAt = performance.now();
    const result = createBaseReactFlowPreDisplayFinalEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
    });
    const durationMs = performance.now() - startedAt;
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes as any);
    const quality = calculateEdgePathQualityScore(result);
    const paths = result.map(edge => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      path: ((edge.data as any).computedPath || []) as Array<{ x: number; y: number }>,
    }));
    const workerRoutingPatches = createBaseReactFlowDisplayEdgePatches(projected.edges, result);
    const mergedTransactions = workerRoutingPatches
      ? mergeBaseReactFlowDisplayRoutingTransactions({
        latestSourceEdges: projected.edges,
        workerRoutingPatches,
        repairRoutingPatches: createBaseReactFlowDisplayEdgePatches(result, result)!,
      })
      : null;
    const finalOutputRouteSignature = mergedTransactions
      ? computeBaseReactFlowDisplayOutputRouteSignature(mergedTransactions.edges)
      : null;
    expect(quality.nonOrthogonalSegments, JSON.stringify({ quality, paths }, null, 2)).toBe(0);
    expect(
      quality.strictCrossings,
      JSON.stringify({ strictCrossings: strictPathCrossings(paths), paths }, null, 2),
    ).toBe(0);
    expect(
      quality.reverseOverlap,
      JSON.stringify(edgeOverlapProblems(result), null, 2),
    ).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.unexplainedRelatedOverlap).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
    expect(edgeNodeObstacleHits(result, absoluteNodes), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(
      displayEdgesHaveNodeAttachedTerminals(result, absoluteNodes),
      JSON.stringify(result
        .filter(edge => !displayEdgesHaveNodeAttachedTerminals([edge], absoluteNodes))
        .map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          path: (edge.data as any)?.computedPath,
        })), null, 2),
    ).toBe(true);
    expect(
      displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes),
      JSON.stringify(result
        .filter(edge => !displayEdgesHaveNodeAnchoredTerminals([edge], absoluteNodes))
        .map(edge => ({
          id: edge.id,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          path: (edge.data as any)?.computedPath,
        })), null, 2),
    ).toBe(true);
    expect(finalOutputRouteSignature).not.toBeNull();
    expect(result.some(edge => (
      (edge.data as any)?.sharedTrunkAware === true
      || (edge.data as any)?.sharedTrunkSynthesized === true
    ))).toBe(true);
    expect(resolveBaseReactFlowDisplayCacheReplaySignature({
      sourceEdges: projected.edges,
      finalEdges: mergedTransactions?.edges ?? [],
      cachePatches: mergedTransactions?.cachePatches ?? [],
      finalOutputRouteSignature,
    })).toBeNull();
    expect(durationMs, JSON.stringify({ durationMs, quality }, null, 2)).toBeLessThan(30_000);
  }, 60_000);

  it('routes TMS execution trunks outside stepped cost blockers', async () => {
    const canvas = await standardDataToCanvas(tmsStandardData as any);
    const result = createBaseReactFlowDisplayEdges({
      edges: canvas.edges,
      nodes: canvas.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
        edges: canvas.edges,
        nodes: canvas.nodes,
      }),
    });
    const absoluteNodes = withAbsoluteNodePositions(canvas.nodes as any);
    const quality = calculateEdgePathQualityScore(result);
    const paths = result.map(edge => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      path: (edge.data as any)?.computedPath,
    }));

    expect(quality.nonOrthogonalSegments, JSON.stringify({ quality, paths }, null, 2)).toBe(0);
    expect(
      quality.strictCrossings,
      JSON.stringify({ quality, crossings: strictPathCrossings(paths as any), paths }, null, 2),
    ).toBe(0);
    expect(quality.reverseOverlap, JSON.stringify(edgeOverlapProblems(result), null, 2)).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.unexplainedRelatedOverlap).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
    expect(edgeNodeObstacleHits(result, absoluteNodes), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(displayEdgesHaveNodeAttachedTerminals(result, absoluteNodes)).toBe(true);
    expect(displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes)).toBe(true);
  }, 60_000);
});
