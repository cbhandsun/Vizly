import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import supplyChainReceivingFlow from '../../../../data/standardized/SupplyChainReceivingFlow.json';
import demandAllocationData from '../../../../data/standardized/DeamndAllocation.json';
import tmsStandardData from '../../../../data/standardized/TmsStandardData.json';
import wmsProcessFlowStandardData from '../../../../data/standardized/WmsProcessFlowStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { coerceCustomPreset } from '../../../utils/customPresetStorage';
import {
  createBaseReactFlowDisplayEdges,
} from '../baseReactFlowDisplayEdges';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayOutputRouteSignature,
} from '../baseReactFlowDisplayEdgeCore';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import {
  createBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayRoutingTransactions,
  resolveBaseReactFlowDisplayCacheReplaySignature,
} from '../baseReactFlowDisplayRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';
import {
  createDisplayTerminalValidationSnapshot,
  displayEdgesHaveNodeAnchoredTerminals,
  displayEdgesHaveNodeAttachedTerminals,
} from '../baseReactFlowTerminalAxisRepair';
import {
  edgeNodeObstacleHits,
  edgeOverlapProblems,
  strictPathCrossings,
  withAbsoluteNodePositions,
} from './baseReactFlowDisplayEdges.testUtils';
import {
  finiteDisplayPointPath as finitePointPath,
  unexplainedRelatedOverlapPairs,
} from './fixtures/displayEdgeQualityDiagnostics';

const absoluteNodeX = (nodeItem: Node): number => {
  const position = (nodeItem as Node & {
    positionAbsolute?: { x?: unknown };
  }).positionAbsolute;
  return typeof position?.x === 'number' ? position.x : nodeItem.position.x;
};

const measuredNodeWidth = (nodeItem: Node): number => {
  const width = nodeItem.measured?.width ?? nodeItem.width ?? nodeItem.style?.width;
  return typeof width === 'number' && Number.isFinite(width) ? width : 0;
};

describe('baseReactFlowDisplayEdges WMS and TMS regressions', () => {
  it('keeps the bounded demand-allocation route hard-clean without commercial detours', async () => {
    const preset = coerceCustomPreset(demandAllocationData, {
      id: 'DemandAllocationRouteProbe',
      title: 'DemandAllocationRouteProbe',
    });
    if (!preset) throw new Error('expected the demand-allocation preset to be valid');
    const canvas = await standardDataToCanvas(preset);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const startedAt = performance.now();
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'demand-allocation-commercial-route',
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: true,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      qualityMode: 'full',
    });
    const durationMs = performance.now() - startedAt;
    const result = response.edges ?? [];
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes);
    const quality = calculateEdgePathQualityScore(result);
    const metrics = result.map(edge => {
      const path = finitePointPath(edge.data?.computedPath);
      const lengths = path.slice(0, -1).map((point, index) => (
        Math.abs(path[index + 1].x - point.x) + Math.abs(path[index + 1].y - point.y)
      ));
      const direct = path.length < 2
        ? 0
        : Math.abs(path[path.length - 1].x - path[0].x)
          + Math.abs(path[path.length - 1].y - path[0].y);
      const length = lengths.reduce((total, segment) => total + segment, 0);
      return {
        id: edge.id,
        bends: Math.max(0, path.length - 2),
        length,
        detourRatio: direct > 0 ? Number((length / direct).toFixed(3)) : 1,
        shortInteriorSegments: lengths.slice(1, -1).filter(segment => segment < 24),
        path,
      };
    });
    const diagnostics = JSON.stringify({
      durationMs,
      routeResolution: response.routeResolution,
      hardClean: response.hardClean,
      quality,
      metrics,
      phaseTrace: response.phaseTrace,
    }, null, 2);

    expect(response.error, diagnostics).toBeUndefined();
    expect(response.hardClean, diagnostics).toBe(true);
    expect(quality.strictCrossings, diagnostics).toBe(0);
    expect(edgeNodeObstacleHits(result, absoluteNodes), diagnostics).toEqual([]);
    expect(Math.max(...metrics.map(metric => metric.bends)), diagnostics).toBeLessThanOrEqual(8);
    expect(
      Math.max(...metrics.map(metric => metric.detourRatio)),
      diagnostics,
    ).toBeLessThanOrEqual(2.6);
    const poolMerge = metrics.find(metric => metric.id === 'e15');
    expect(poolMerge, diagnostics).toBeDefined();
    expect(poolMerge?.bends, diagnostics).toBeLessThanOrEqual(2);
    expect(poolMerge?.detourRatio, diagnostics).toBeLessThanOrEqual(1.2);
    expect(
      metrics.filter(metric => metric.shortInteriorSegments.length > 0),
      diagnostics,
    ).toEqual([]);
    expect(durationMs, diagnostics).toBeLessThan(15_000);
  }, 30_000);

  it('builds the WMS process final candidate within the cold quality budget', async () => {
    const preset = coerceCustomPreset(wmsProcessFlowStandardData, {
      id: 'WmsProcessFlowProbe',
      title: 'WmsProcessFlowProbe',
    });
    if (!preset) throw new Error('expected the WMS process preset to be valid');
    const canvas = await standardDataToCanvas(preset);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const startedAt = performance.now();
    const phaseTrace: DisplayRoutingPhaseTrace[] = [];
    const result = createBaseReactFlowDisplayEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      onPhaseTrace: trace => phaseTrace.push(trace),
    });
    const durationMs = performance.now() - startedAt;
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes);
    const quality = calculateEdgePathQualityScore(result);
    const paths = result.map(edge => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      path: finitePointPath(edge.data?.computedPath),
    }));
    const nonOrthogonalPaths = paths.flatMap(route => (
      route.path.some((point, index) => {
        const next = route.path[index + 1];
        if (!next) return false;
        const deltaX = Math.abs(point.x - next.x);
        const deltaY = Math.abs(point.y - next.y);
        return !(
          (deltaX <= 0.5 && deltaY > 0.5)
          || (deltaY <= 0.5 && deltaX > 0.5)
        );
      }) ? [route] : []
    ));
    const tinyInteriorPaths = paths.flatMap(route => {
      const tinySegments = route.path.slice(1, -2).flatMap((point, index) => {
        const next = route.path[index + 2];
        const length = next
          ? Math.abs(point.x - next.x) + Math.abs(point.y - next.y)
          : Number.POSITIVE_INFINITY;
        return length < 24 ? [{ from: point, to: next, length }] : [];
      });
      return tinySegments.length > 0 ? [{ ...route, tinySegments }] : [];
    });
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
    const terminalValidation = createDisplayTerminalValidationSnapshot(absoluteNodes);
    const terminalDiagnostics = JSON.stringify({
      durationMs,
      unanchoredEdges: result.flatMap(edge => {
        const validation = terminalValidation.validateEdge(edge);
        return validation.anchored ? [] : [{
          id: edge.id,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          path: finitePointPath(edge.data?.computedPath),
          validation,
        }];
      }),
      phaseTrace,
    }, null, 2);

    expect(
      quality.nonOrthogonalSegments,
      JSON.stringify({ quality, nonOrthogonalPaths }, null, 2),
    ).toBe(0);
    expect(
      quality.strictCrossings,
      JSON.stringify({ strictCrossings: strictPathCrossings(paths), paths }, null, 2),
    ).toBe(0);
    expect(quality.reverseOverlap, JSON.stringify(edgeOverlapProblems(result), null, 2)).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(
      quality.unexplainedRelatedOverlap,
      JSON.stringify(unexplainedRelatedOverlapPairs(result), null, 2),
    ).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(
      quality.tinyInteriorDoglegs,
      JSON.stringify({ quality, tinyInteriorPaths }, null, 2),
    ).toBe(0);
    expect(quality.hairpins).toBe(0);
    expect(edgeNodeObstacleHits(result, absoluteNodes), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(displayEdgesHaveNodeAttachedTerminals(result, absoluteNodes), terminalDiagnostics).toBe(true);
    expect(displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes), terminalDiagnostics).toBe(true);
    expect(finalOutputRouteSignature).not.toBeNull();
    expect(result.some(edge => (
      edge.data?.sharedTrunkAware === true || edge.data?.sharedTrunkSynthesized === true
    ))).toBe(true);
    expect(resolveBaseReactFlowDisplayCacheReplaySignature({
      sourceEdges: projected.edges,
      finalEdges: mergedTransactions?.edges ?? [],
      cachePatches: mergedTransactions?.cachePatches ?? [],
      finalOutputRouteSignature,
    })).toBeNull();
    expect(
      phaseTrace.some(trace => trace.phase === 'quality'),
      JSON.stringify({ durationMs, phaseTrace }, null, 2),
    ).toBe(true);
    expect(
      phaseTrace.some(trace => (
        trace.phase === 'final-safety-closure'
        && (trace.parentPhase === 'quality' || trace.parentPhase === 'post-render')
      )),
      JSON.stringify({ durationMs, phaseTrace }, null, 2),
    ).toBe(true);
    expect(
      phaseTrace.some(trace => (
        (trace.evaluationCount ?? 0) > 0 || (trace.cacheHitCount ?? 0) > 0
      )),
      JSON.stringify({ durationMs, phaseTrace }, null, 2),
    ).toBe(true);
    expect(
      durationMs,
      JSON.stringify({ durationMs, phaseTrace, quality }, null, 2),
    ).toBeLessThan(25_000);
  }, 60_000);

  it('keeps the large-graph WMS worker response hard-clean at the browser boundary', async () => {
    const preset = coerceCustomPreset(wmsProcessFlowStandardData, {
      id: 'WmsProcessWorkerProbe',
      title: 'WmsProcessWorkerProbe',
    });
    if (!preset) throw new Error('expected the WMS process preset to be valid');
    const canvas = await standardDataToCanvas(preset);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'wms-process-large-worker-route',
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: true,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      qualityMode: 'full',
    });
    const result = response.edges ?? [];
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes);
    const quality = calculateEdgePathQualityScore(result);
    const hardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
    const terminalValidation = createDisplayTerminalValidationSnapshot(absoluteNodes);
    const diagnostics = JSON.stringify({
      hardClean: response.hardClean,
      routeResolution: response.routeResolution,
      quality,
      hardReport,
      responseHardReport: response.hardReport,
      obstacleHits: edgeNodeObstacleHits(result, absoluteNodes),
      terminalsAttached: displayEdgesHaveNodeAttachedTerminals(result, absoluteNodes),
      terminalsAnchored: displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes),
      unanchoredEdges: result
        .map(edge => ({
          id: edge.id,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          path: finitePointPath(edge.data?.computedPath),
          validation: terminalValidation.validateEdge(edge),
        }))
        .filter(edge => !edge.validation.anchored),
      phaseTrace: response.phaseTrace,
    }, null, 2);

    expect(response.error, diagnostics).toBeUndefined();
    expect(response.hardClean, diagnostics).toBe(true);
    expect(quality.strictCrossings, diagnostics).toBe(0);
    expect(edgeNodeObstacleHits(result, absoluteNodes), diagnostics).toEqual([]);
    expect(displayEdgesHaveNodeAttachedTerminals(result, absoluteNodes), diagnostics).toBe(true);
    expect(displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes), diagnostics).toBe(true);

    const replay = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'wms-process-large-worker-replay',
      edges: projected.edges,
      nodes: projected.nodes,
      candidateEdges: result,
      candidateSource: 'precompiled',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: true,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      qualityMode: 'full',
    });
    expect(replay.hardReport?.minimumClearanceViolationEdgeIds, diagnostics)
      .not.toContain('e-labor-alloc-fb');
    expect(replay.hardReport?.minimumClearanceViolations, diagnostics).toBe(0);
  }, 90_000);

  it('routes TMS execution trunks outside stepped cost blockers', async () => {
    const preset = coerceCustomPreset(tmsStandardData, {
      id: 'TmsRouteProbe',
      title: 'TmsRouteProbe',
    });
    if (!preset) throw new Error('expected the TMS preset to be valid');
    const canvas = await standardDataToCanvas(preset);
    const phaseTrace: DisplayRoutingPhaseTrace[] = [];
    const startedAt = performance.now();
    const result = createBaseReactFlowDisplayEdges({
      edges: canvas.edges,
      nodes: canvas.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(canvas),
      onPhaseTrace: trace => phaseTrace.push(trace),
    });
    const durationMs = performance.now() - startedAt;
    const absoluteNodes = withAbsoluteNodePositions(canvas.nodes);
    const quality = calculateEdgePathQualityScore(result);
    const paths = result.map(edge => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      path: finitePointPath(edge.data?.computedPath),
    }));

    expect(quality.nonOrthogonalSegments, JSON.stringify({
      durationMs,
      phaseTrace,
      quality,
      paths,
    }, null, 2)).toBe(0);
    expect(
      quality.strictCrossings,
      JSON.stringify({
        quality,
        crossings: strictPathCrossings(paths),
      }, null, 2),
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
    expect(durationMs, JSON.stringify({ durationMs, phaseTrace }, null, 2)).toBeLessThan(60_000);
  }, 60_000);

  it('repairs a cached SupplyChain e11 lane into its narrow container corridor center', async () => {
    const preset = coerceCustomPreset(supplyChainReceivingFlow, {
      id: 'RouteClearanceProbe',
      title: 'RouteClearanceProbe',
    });
    if (!preset) throw new Error('expected the SupplyChain preset to be valid');
    const canvas = await standardDataToCanvas(preset);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const fullRouteResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'supply-chain-e11-full-route',
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      qualityMode: 'full',
    });
    const fullRouteEdges = fullRouteResponse.edges ?? [];
    const absoluteNodes = withAbsoluteNodePositions(projected.nodes);
    const targetDomain = absoluteNodes.find(item => item.id === 'titlegroup-场地管理');
    const sourceDomain = absoluteNodes.find(item => item.id === 'titlegroup-wms');
    const targetBoundaryX = targetDomain ? absoluteNodeX(targetDomain) : Number.NaN;
    const sourceBoundaryX = sourceDomain
      ? absoluteNodeX(sourceDomain) + measuredNodeWidth(sourceDomain)
      : Number.NaN;
    const cachedCandidateEdges = fullRouteEdges.map(edge => {
      if (edge.id !== 'e11') return edge;
      const path = finitePointPath(edge.data?.computedPath);
      if (path.length !== 4) return edge;
      const nearBoundaryLane = Math.round(targetBoundaryX - 30);
      return {
        ...edge,
        data: {
          ...edge.data,
          computedPath: [
            path[0],
            { ...path[1], x: nearBoundaryLane },
            { ...path[2], x: nearBoundaryLane },
            path[3],
          ],
          displaySoftQualityRepaired: false,
        },
      };
    });
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'supply-chain-e11-cached-route',
      edges: projected.edges,
      nodes: projected.nodes,
      candidateEdges: cachedCandidateEdges,
      candidateSource: 'persistent',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
      qualityMode: 'full',
    });
    const repairedEdge = response.edges?.find(item => item.id === 'e11');
    const path = finitePointPath(repairedEdge?.data?.computedPath);
    const centeredLane = path.slice(0, -1)
      .map((point, index) => ({ from: point, to: path[index + 1] }))
      .filter(segment => (
        segment.from.x === segment.to.x
        && Math.abs(segment.to.y - segment.from.y) >= 48
      ))
      .map(segment => segment.from.x)
      .filter(x => x < targetBoundaryX)
      .sort((left, right) => right - left)[0];
    const targetClearance = targetBoundaryX - centeredLane;
    const sourceClearance = centeredLane - sourceBoundaryX;
    const diagnostics = JSON.stringify({
      routeResolution: response.routeResolution,
      hardClean: response.hardClean,
      path,
      targetClearance,
      sourceClearance,
    }, null, 2);

    expect(response.error, diagnostics).toBeUndefined();
    expect(response.hardClean, diagnostics).toBe(true);
    expect(response.routeResolution, diagnostics).toBe('repaired-candidate');
    expect(repairedEdge, diagnostics).toBeDefined();
    expect(targetDomain, diagnostics).toBeDefined();
    expect(sourceDomain, diagnostics).toBeDefined();
    expect(centeredLane, diagnostics).toBeTypeOf('number');
    expect(targetClearance, diagnostics).toBeGreaterThanOrEqual(79.5);
    expect(sourceClearance, diagnostics).toBeGreaterThanOrEqual(79.5);
    expect(Math.abs(targetClearance - sourceClearance), diagnostics).toBeLessThanOrEqual(1);
  }, 60_000);
});
