import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { expectCompleteLogisticsIncrementalPhaseTrace } from './baseReactFlowDisplayLogisticsPhaseTrace.testUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { displayEdgesHaveNodeAnchoredTerminals } from '../baseReactFlowTerminalAxisRepair';
import {
  createBaseReactFlowDisplayEdges,
} from '../baseReactFlowDisplayEdges';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayOutputRouteSignature,
  withDisplayAbsolutePositions,
} from '../baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { countRenderUnsafeEndpointStubs } from '../baseReactFlowDisplayEndpointStubRepair';
import {
  buildStrictBlockingTerminalLaneShiftVariants,
} from '../baseReactFlowDisplayLoopShortcutRepair';
import { withDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import {
  createBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayEdgePatches,
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
import { parseBaseReactFlowPrecompiledRouteArtifact } from '../baseReactFlowPrecompiledRouteArtifact';
import { GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS } from '../generated/baseReactFlowPrecompiledRouteLoaders';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';
import { withDisplayPortBridge } from '../baseReactFlowDisplayTerminalPortCandidates';
import {
  finiteDisplayPointPath as finitePointPath,
  unexplainedRelatedOverlapPairs,
} from './fixtures/displayEdgeQualityDiagnostics';

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

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 800,
    });
    const resultPaths = result.map((edge) => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
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
    // A fully clear multi-obstacle bypass may require seven orthogonal segments.
    expect(carrierPath.length).toBeLessThanOrEqual(8);
    expect(Math.max(...downstreamPath.map(point => point.y)), JSON.stringify(downstreamPath))
      .toBe(1295);
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
    const hardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
    const directCustomsPaths = customsPath.length >= 4 && customsEdge
      ? [
        [
          customsPath[0],
          customsPath[1],
          { x: customsPath.at(-2)!.x, y: customsPath[1].y },
          customsPath.at(-2)!,
          customsPath.at(-1)!,
        ],
        [
          customsPath[0],
          customsPath[1],
          { x: customsPath[1].x, y: customsPath.at(-2)!.y },
          customsPath.at(-2)!,
          customsPath.at(-1)!,
        ],
      ]
      : [];
    const directCandidates = directCustomsPaths.map(path => result.map(edge => (
        edge.id === customsEdge?.id
          ? { ...edge, data: { ...(edge.data ?? {}), computedPath: path } }
          : edge
      )));
    const strictBlockingVariants = directCustomsPaths.flatMap(path => (
      buildStrictBlockingTerminalLaneShiftVariants(
        path,
        result.findIndex(edge => edge.id === customsEdge?.id),
        result,
        absoluteNodes,
      ).map(variant => ({ path, variant }))
    ));
    const atomicCandidates = strictBlockingVariants.map(({ path, variant }) => result.map(
      (edge, index) => {
        if (edge.id === customsEdge?.id) return withDisplayComputedPath(edge, path);
        if (index !== variant.edgeIndex) return edge;
        return variant.sourceSide && variant.targetSide
          ? withDisplayPortBridge(
            edge,
            variant.path,
            variant.sourceSide,
            variant.targetSide,
          )
          : withDisplayComputedPath(edge, variant.path);
      },
    ));
    const diagnostics = JSON.stringify({
      customsPath,
      carrierPath: finitePointPath(carrierEdge?.data?.computedPath),
      carrierTerminalPolicy: carrierEdge ? {
        sourceHandle: carrierEdge.sourceHandle,
        targetHandle: carrierEdge.targetHandle,
        sourcePortPolicy: carrierEdge.data?.sourcePortPolicy,
        targetPortPolicy: carrierEdge.data?.targetPortPolicy,
        manualHandles: carrierEdge.data?.manualHandles,
        manualHandlePositions: carrierEdge.data?.manualHandlePositions,
      } : null,
      directCandidates: directCandidates.map(candidate => ({
        hardReport: getDisplayHardQualityGateReport(candidate, absoluteNodes, 'polished'),
        nodeHits: edgeNodeObstacleHits(candidate, absoluteNodes),
        strictCrossings: strictPathCrossings(candidate.map(edge => ({
          id: edge.id,
          path: finitePointPath(edge.data?.computedPath),
        }))),
      })),
      atomicCandidates: atomicCandidates.slice(0, 8).map(candidate => ({
        hardReport: getDisplayHardQualityGateReport(candidate, absoluteNodes, 'polished'),
        nodeHits: edgeNodeObstacleHits(candidate, absoluteNodes),
        changed: candidate.flatMap((edge, index) => (
          edge === result[index] ? [] : [{
            id: edge.id,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            path: finitePointPath(edge.data?.computedPath),
          }]
        )),
      })),
    }, null, 2);
    expect(carrierEdge).toBeDefined();
    expect(customsEdge).toBeDefined();
    expect(edgeNodeObstacleHits(
      [carrierEdge, customsEdge].filter((edge): edge is Edge => Boolean(edge)),
      absoluteNodes,
    )).toEqual([]);
    const customsSourceOutwardDistance = customsEdge && customsPath.length >= 2
      ? ({
        top: customsPath[0].y - customsPath[1].y,
        right: customsPath[1].x - customsPath[0].x,
        bottom: customsPath[1].y - customsPath[0].y,
        left: customsPath[0].x - customsPath[1].x,
      } as const)[String(customsEdge.sourceHandle) as 'top' | 'right' | 'bottom' | 'left']
      : undefined;
    expect(customsSourceOutwardDistance, diagnostics).toBeGreaterThanOrEqual(48);
    expect(customsLength / Math.max(1, customsDirect), diagnostics).toBeLessThanOrEqual(1.25);
    expect(hardReport, JSON.stringify(hardReport, null, 2)).toMatchObject({
      hardClean: true,
      obstacleHits: 0,
      terminalsAttached: true,
      terminalsAnchored: true,
      quality: {
        nonOrthogonalSegments: 0,
        strictCrossings: 0,
        reverseOverlap: 0,
        unrelatedOverlap: 0,
        unexplainedRelatedOverlap: 0,
        shortEndpointStubs: 0,
        tinyInteriorDoglegs: 0,
        hairpins: 0,
      },
    });
  }, 60_000);

  it('builds a final-quality logistics candidate within the interactive budget', async () => {
    const canvas = await standardDataToCanvas(logisticsStandardData as any);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const phaseTraces: DisplayRoutingPhaseTrace[] = [];
    const startedAt = performance.now();
    const result = createBaseReactFlowDisplayEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      onPhaseTrace: trace => phaseTraces.push(trace),
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
    expect(
      quality.unexplainedRelatedOverlap,
      JSON.stringify(unexplainedRelatedOverlapPairs(result), null, 2),
    ).toBe(0);
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
    expect(
      phaseTraces.find(trace => trace.phase === 'post-render-residual'),
      JSON.stringify({ quality, phaseTraces }, null, 2),
    ).toMatchObject({ resolution: 'skip' });
    expect(
      phaseTraces.find(
        trace => trace.phase === 'quality-crossing-global-refine-fixed-point',
      ),
      JSON.stringify({ quality, phaseTraces }, null, 2),
    ).toMatchObject({
      resolution: 'skip',
      evaluationCount: 0,
      scannedNodeCount: 0,
      scannedSegmentCount: 0,
      scannedEdgePairCount: 0,
    });
    expect(
      phaseTraces.find(
        trace => trace.phase === 'quality-crossing-global-refine-dogleg',
      ),
      JSON.stringify({ quality, phaseTraces }, null, 2),
    ).toMatchObject({
      candidateCount: expect.any(Number),
    });
    expect(
      phaseTraces.find(
        trace => trace.phase === 'quality-crossing-global-refine-dogleg',
      )?.candidateCount,
      JSON.stringify({ quality, phaseTraces }, null, 2),
    ).toBeLessThan(projected.edges.length);
    expect(
      phaseTraces.find(
        trace => trace.phase === 'quality-crossing-final-overlap',
      )?.cacheHitCount,
      JSON.stringify({ quality, phaseTraces }, null, 2),
    ).toBeLessThan(1_000);
    expect(
      phaseTraces.some(trace => trace.phase === 'strict'),
      JSON.stringify({ quality, phaseTraces }, null, 2),
    ).toBe(false);
    expect(
      phaseTraces.find(trace => trace.phase === 'terminal'),
      JSON.stringify({ quality, phaseTraces }, null, 2),
    ).toMatchObject({ resolution: 'accepted' });
    expect(durationMs, JSON.stringify({ quality, phaseTraces, paths }, null, 2)).toBeLessThan(3_000);
  }, 30_000);

  it('keeps the browser worker logistics candidate under the same hard gates', async () => {
    const canvas = await standardDataToCanvas(logisticsStandardData as any);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const browserMeasuredNodes: PositionedNode[] = [
      { ...node('titlegroup-external', 758.1125, 0, 1377, 290), type: 'titleGroup', positionAbsolute: { x: 758.1125, y: 0 } },
      { ...node('titlegroup-logistics', 0, 450, 1882, 846), type: 'titleGroup', positionAbsolute: { x: 0, y: 450 } },
      { ...node('titlegroup-data', 1254.3375, 1456, 404, 290), type: 'titleGroup', positionAbsolute: { x: 1254.3375, y: 1456 } },
      { ...node('upstream', 32, 106.5, 210, 73), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 790.1125, y: 106.5 } },
      { ...node('l-oms', 935.25, 84, 259, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 935.25, y: 534 } },
      { ...node('wms', 50, 362, 282, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 50, y: 812 } },
      { ...node('wcs', 32, 640, 298, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 32, y: 1090 } },
      { ...node('tms', 923.75, 362, 282, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 923.75, y: 812 } },
      { ...node('customs', 1525.75, 373, 282, 96), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1525.75, y: 823 } },
      { ...node('bms', 650, 640, 243, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 650, y: 1090 } },
      { ...node('yms', 1213, 640, 250, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1213, y: 1090 } },
      { ...node('carrier-portal', 562, 84, 211, 118), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 1320.1125, y: 84 } },
      { ...node('visibility', 32, 84, 296, 118), parentId: 'titlegroup-data', type: 'custom', positionAbsolute: { x: 1286.3375, y: 1540 } },
      { ...node('downstream', 1093, 106.5, 219, 73), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 1851.1125, y: 106.5 } },
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
    const latestBrowserMeasuredRoutes: typeof browserLockedRoutes = {
      'edge-loms-customs': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1142, y: 653 }, { x: 1142, y: 742 }, { x: 1667, y: 742 }, { x: 1667, y: 822 }],
      },
      'edge-loms-tms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1038.85, y: 653 }, { x: 1038.85, y: 811 }],
      },
      'edge-loms-visibility': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1090.65, y: 653 }, { x: 1090.65, y: 802 }, { x: 1473, y: 1080 }, { x: 1434.3375, y: 1218 }, { x: 1434.3375, y: 1539 }],
      },
      'edge-loms-wms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 987, y: 653 }, { x: 987, y: 742 }, { x: 191, y: 742 }, { x: 191, y: 811 }],
      },
      'edge-tms-bms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 994, y: 931 }, { x: 994, y: 1020 }, { x: 976, y: 1020 }, { x: 976, y: 943 }, { x: 830, y: 943 }, { x: 830, y: 931 }, { x: 812, y: 931 }, { x: 812, y: 1089 }],
      },
      'edge-tms-carrier': {
        sourceHandle: 'top', targetHandle: 'bottom',
        computedPath: [{ x: 1018, y: 811 }, { x: 1018, y: 722 }, { x: 1426, y: 722 }, { x: 1426, y: 203 }],
      },
      'edge-tms-downstream': {
        sourceHandle: 'top', targetHandle: 'bottom',
        computedPath: [{ x: 1065, y: 812 }, { x: 1065, y: 723 }, { x: 1924, y: 723 }, { x: 1924, y: 181 }],
      },
      'edge-tms-visibility': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1135, y: 931 }, { x: 1135, y: 1020 }, { x: 1508, y: 1020 }, { x: 1508, y: 1539 }],
      },
      'edge-tms-yms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1065, y: 931 }, { x: 1065, y: 1020 }, { x: 1201, y: 1020 }, { x: 1201, y: 1000 }, { x: 1338, y: 1000 }, { x: 1338, y: 1089 }],
      },
      'edge-upstream-loms': {
        sourceHandle: 'bottom', targetHandle: 'top', auto: true,
        computedPath: [{ x: 895, y: 181 }, { x: 895, y: 236 }, { x: 1065, y: 236 }, { x: 1065, y: 533 }],
      },
      'edge-visibility-downstream': {
        sourceHandle: 'top', targetHandle: 'bottom',
        computedPath: [{ x: 1434, y: 1539 }, { x: 1434, y: 1457 }, { x: 1997, y: 1457 }, { x: 1997, y: 181 }],
      },
      'edge-wms-bms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 191, y: 931 }, { x: 191, y: 1000 }, { x: 731, y: 1000 }, { x: 731, y: 1089 }],
      },
      'edge-wms-visibility': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 262, y: 931 }, { x: 262, y: 1450 }, { x: 1360, y: 1450 }, { x: 1360, y: 1539 }],
      },
      'edge-wms-wcs': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 121, y: 931 }, { x: 121, y: 1020 }, { x: 181, y: 1020 }, { x: 181, y: 1089 }],
      },
    };
    Object.assign(browserLockedRoutes, latestBrowserMeasuredRoutes);
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
    const endpointOrder = auditFinalSameSideEndpointOrder(result, absoluteNodes);
    const passageOrder = auditFinalSameSidePassageOrder(result, absoluteNodes);
    const hardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
    const diagnostics = JSON.stringify({
      endpointOrder,
      passageOrder,
      hardReport,
      obstacleHits: edgeNodeObstacleHits(result, absoluteNodes),
      unsafeEdges: result.filter(edge => countRenderUnsafeEndpointStubs([edge]) > 0)
        .map(edge => ({ id: edge.id, path: finitePointPath((edge.data as { computedPath?: unknown } | undefined)?.computedPath) })),
      paths: result.map(edge => ({ id: edge.id, path: finitePointPath((edge.data as { computedPath?: unknown } | undefined)?.computedPath) })),
    }, null, 2);
    expect(response.error, diagnostics).toBeUndefined();
    expect({
      responseHardClean: response.hardClean, displayHardClean: hardReport.hardClean,
      inversions: endpointOrder.inversions, ambiguousLaneTies: endpointOrder.ambiguousLaneTies,
      collapsedLanePairs: endpointOrder.collapsedLanePairs, passageDefects: passageOrder.passageDefects,
      nearTrunkOpportunities: passageOrder.nearTrunkOpportunities, unsafeEndpointStubs: countRenderUnsafeEndpointStubs(result),
    }, diagnostics).toEqual({ responseHardClean: true, displayHardClean: true, inversions: 0, ambiguousLaneTies: 0, collapsedLanePairs: 0, passageDefects: 0, nearTrunkOpportunities: 0, unsafeEndpointStubs: 0 });
    const sourceTrunks = endpointOrder.legalSharedTrunks.filter(trunk => trunk.role === 'source');
    const targetTrunks = endpointOrder.legalSharedTrunks.filter(trunk => trunk.role === 'target');
    const dualRoleEdgeIds = [...new Set(sourceTrunks.flatMap(trunk => trunk.edgeIds))]
      .filter(edgeId => targetTrunks.some(trunk => trunk.edgeIds.includes(edgeId)));
    const dualSource = sourceTrunks.find(trunk => trunk.edgeIds.includes(dualRoleEdgeIds[0] ?? ''));
    const dualTarget = targetTrunks.find(trunk => trunk.edgeIds.includes(dualRoleEdgeIds[0] ?? ''));
    expect(dualRoleEdgeIds, diagnostics).not.toEqual([]);
    expect([dualSource, dualTarget].every(trunk => (trunk?.commonStemLength ?? 0) >= 48), diagnostics).toBe(true);

    const logisticsLoaderEntry = Object.entries(
      GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
    ).find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!logisticsLoaderEntry) {
      throw new Error('expected the Logistics precompiled loader');
    }
    const [precompiledInputSignature, precompiledDescriptor] = logisticsLoaderEntry;
    const precompiledArtifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'),
      {
        inputSignature: precompiledInputSignature,
        inputGeometryDigest: precompiledDescriptor.geometryDigest,
        sourceHash: precompiledDescriptor.sourceHash,
      },
    );
    if (!precompiledArtifact) {
      throw new Error('expected the Logistics precompiled artifact to parse');
    }
    const precompiledBaseline = mergeBaseReactFlowDisplayEdgePatches(
      browserProjected.edges,
      precompiledArtifact.edges,
    );
    if (!precompiledBaseline) {
      throw new Error('expected the Logistics precompiled baseline to merge');
    }
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(
      browserProjected.edges,
      precompiledBaseline,
    );
    const baselineOutputRouteSignature =
      computeBaseReactFlowDisplayOutputRouteSignature(precompiledBaseline);
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: browserProjected.nodes,
      edges: browserProjected.edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected a valid Logistics incremental baseline');
    }
    const dragCases = [
      {
        nodeId: 'tms',
        deltaX: 48.25,
        deltaY: 16,
        expectedMutableCount: 6,
        expectedAffectedCount: 6,
      },
      { nodeId: 'wms', deltaX: 48.25, deltaY: 16, expectedMutableCount: 4 },
      { nodeId: 'l-oms', deltaX: 48.25, deltaY: 16, expectedMutableCount: 5 },
      { nodeId: 'l-oms', deltaX: 36.75, deltaY: 6, expectedMutableCount: 5 },
    ] as const;

    for (const dragCase of dragCases) {
      const movedNodes = browserProjected.nodes.map((item) => (
        item.id === dragCase.nodeId
          ? {
            ...item,
            position: {
              x: item.position.x + dragCase.deltaX,
              y: item.position.y + dragCase.deltaY,
            },
            positionAbsolute: {
              x: item.positionAbsolute.x + dragCase.deltaX,
              y: item.positionAbsolute.y + dragCase.deltaY,
            },
          }
          : item
      ));
      const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
        nodes: movedNodes,
        edges: browserProjected.edges,
        enableSmartEdges: true,
        smartEdgePadding: 20,
        isLargeGraph: false,
      });
      const changeSet = createBaseReactFlowRoutingChangeSet({
        previousNodes: browserProjected.nodes,
        previousEdges: browserProjected.edges,
        nextNodes: movedNodes,
        nextEdges: browserProjected.edges,
        reasonHint: 'node-drag',
      });
      const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
        changeSet,
        previousNodes: browserProjected.nodes,
        nextNodes: movedNodes,
        baselineEdges: precompiledBaseline,
        nextEdges: browserProjected.edges,
      });
      const movedAbsoluteNodes = withDisplayAbsolutePositions(
        movedNodes,
        new Map(movedNodes.map(item => [item.id, item] as const)),
      );
      const incrementalResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
        operation: 'incremental-route',
        requestId: `logistics-${dragCase.nodeId}-incremental-route`,
        edges: browserProjected.edges,
        nodes: movedNodes,
        enableSmartEdges: true,
        smartEdgePadding: 20,
        isLargeGraph: false,
        displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
          nodes: movedNodes,
          edges: browserProjected.edges,
        }),
        qualityMode: 'full',
        baselineInputSignature: baselineIdentity.cacheSignature,
        baselineInputGeometryDigest: baselineIdentity.geometryDigest,
        baselineNodes: browserProjected.nodes,
        baselineSourceEdges: browserProjected.edges,
        baselinePatches,
        baselineOutputRouteSignature,
        nextInputSignature: nextIdentity.cacheSignature,
        nextInputGeometryDigest: nextIdentity.geometryDigest,
        changeSet,
        mutableEdgeIds: affectedClosure.mutableEdgeIds,
        contextEdgeIds: affectedClosure.contextEdgeIds,
      });
      const hardReport = incrementalResponse.edges
        ? getDisplayHardQualityGateReport(
          incrementalResponse.edges,
          movedAbsoluteNodes,
          'polished',
        )
        : null;
      const endpointOrder = incrementalResponse.edges
        ? auditFinalSameSideEndpointOrder(incrementalResponse.edges, movedAbsoluteNodes)
        : null;
      const passageOrder = incrementalResponse.edges
        ? auditFinalSameSidePassageOrder(incrementalResponse.edges, movedAbsoluteNodes)
        : null;
      const unsafeEndpointStubs = incrementalResponse.edges
        ? countRenderUnsafeEndpointStubs(incrementalResponse.edges)
        : null;
      const diagnostics = JSON.stringify({
        nodeId: dragCase.nodeId,
        routeResolution: incrementalResponse.routeResolution,
        affectedEdgeCount: incrementalResponse.affectedEdgeCount,
        fallbackLevel: incrementalResponse.fallbackLevel,
        phaseTrace: incrementalResponse.phaseTrace,
        report: hardReport,
        endpointOrder,
        passageOrder,
        unsafeEndpointStubs,
      }, null, 2);

      expect(
        affectedClosure.mutableEdgeIds,
        diagnostics,
      ).toHaveLength(dragCase.expectedMutableCount);
      expect(incrementalResponse, diagnostics).toMatchObject({
        hardClean: true,
        routeResolution: 'incremental-route',
        fallbackLevel: 'none',
      });
      if ('expectedAffectedCount' in dragCase) {
        expect(incrementalResponse.affectedEdgeCount, diagnostics)
          .toBe(dragCase.expectedAffectedCount);
      } else {
        expect(incrementalResponse.affectedEdgeCount, diagnostics)
          .toBeGreaterThanOrEqual(dragCase.expectedMutableCount);
        expect(incrementalResponse.affectedEdgeCount, diagnostics)
          .toBeLessThanOrEqual(dragCase.expectedMutableCount + 8);
      }
      expect(hardReport, diagnostics).toMatchObject({
        hardClean: true,
        obstacleHits: 0,
        terminalsAttached: true,
        terminalsAnchored: true,
        quality: {
          nonOrthogonalSegments: 0,
          strictCrossings: 0,
          reverseOverlap: 0,
          unrelatedOverlap: 0,
          unexplainedRelatedOverlap: 0,
          shortEndpointStubs: 0,
          tinyInteriorDoglegs: 0,
          hairpins: 0,
        },
      });
      expect({
        inversions: endpointOrder?.inversions,
        ambiguousLaneTies: endpointOrder?.ambiguousLaneTies,
        collapsedLanePairs: endpointOrder?.collapsedLanePairs,
        passageDefects: passageOrder?.passageDefects,
        nearTrunkOpportunities: passageOrder?.nearTrunkOpportunities,
        unsafeEndpointStubs,
      }, diagnostics).toEqual({
        inversions: 0,
        ambiguousLaneTies: 0,
        collapsedLanePairs: 0,
        passageDefects: 0,
        nearTrunkOpportunities: 0,
        unsafeEndpointStubs: 0,
      });
      expectCompleteLogisticsIncrementalPhaseTrace(
        incrementalResponse.phaseTrace,
        diagnostics,
      );
      expect(incrementalResponse.phaseTrace?.slice(0, 3).every(
        trace => trace.resolution === 'accepted',
      ), diagnostics).toBe(true);
      const baselineById = new Map(
        precompiledBaseline.map(edge => [edge.id, edge] as const),
      );
      const changedPathIds = (incrementalResponse.edges ?? [])
        .filter(edge => {
          const baselineEdge = baselineById.get(edge.id);
          return JSON.stringify([
            edge.sourceHandle,
            edge.targetHandle,
            (edge.data as { computedPath?: unknown } | undefined)?.computedPath,
          ]) !== JSON.stringify([
            baselineEdge?.sourceHandle,
            baselineEdge?.targetHandle,
            (baselineEdge?.data as { computedPath?: unknown } | undefined)?.computedPath,
          ]);
        })
        .map(edge => edge.id)
        .sort();
      const expectedChangedPathIds = [
        ...affectedClosure.mutableEdgeIds,
        ...(incrementalResponse.affectedEdgeCount === affectedClosure.mutableEdgeIds.length
          ? []
          : ['edge-tms-carrier']),
      ].sort();
      expect(changedPathIds, diagnostics).toEqual(expectedChangedPathIds);
    }
  }, 60_000);

});
