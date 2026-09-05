// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import wmsProcessFlowStandardData from '../../../../data/standardized/WmsProcessFlowStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { coerceCustomPreset } from '../../../utils/customPresetStorage';
import { createBaseReactFlowDisplayEdges } from '../baseReactFlowDisplayEdges';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayOutputRouteSignature,
} from '../baseReactFlowDisplayEdgeCore';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
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

type WorkCounterKey =
  | 'candidateCount'
  | 'changedEdgeCount'
  | 'evaluationCount'
  | 'cacheHitCount'
  | 'scannedNodeCount'
  | 'scannedSegmentCount'
  | 'scannedEdgePairCount'
  | 'workItemCount';

const expectWorkWithinCeilings = (
  trace: DisplayRoutingPhaseTrace | undefined,
  ceilings: ReadonlyArray<readonly [WorkCounterKey, number]>,
  diagnostics: string,
): void => {
  expect(trace, diagnostics).toBeDefined();
  if (!trace) return;
  for (const [key, maximum] of ceilings) {
    const value = trace[key];
    expect(value, `${diagnostics}\nmissing numeric ${key}`).toBeTypeOf('number');
    if (typeof value === 'number') {
      expect(value, `${diagnostics}\n${key} exceeded ${maximum}`).toBeLessThanOrEqual(maximum);
    }
  }
};

describe('baseReactFlowDisplayEdges WMS cold performance', () => {
  it('builds the WMS process final candidate within deterministic work and time budgets', async () => {
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
    }, null, 2);

    expect(result).toHaveLength(44);
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
    expect(result.some(edge => (
      edge.data?.sharedTrunkAware === true || edge.data?.sharedTrunkSynthesized === true
    ))).toBe(true);
    expect(resolveBaseReactFlowDisplayCacheReplaySignature({
      sourceEdges: projected.edges,
      finalEdges: mergedTransactions?.edges ?? [],
      cachePatches: mergedTransactions?.cachePatches ?? [],
      finalOutputRouteSignature,
    })).toBeNull();
    expect(phaseTrace.some(trace => trace.phase === 'quality')).toBe(true);
    expect(phaseTrace.some(trace => (
      trace.phase === 'final-safety-closure'
      && (trace.parentPhase === 'quality' || trace.parentPhase === 'post-render')
    ))).toBe(true);

    const hardGateTrace = phaseTrace.find(trace => trace.phase === 'hard-gate');
    const activeStrictFallbackTraces = phaseTrace.filter(trace => (
      trace.phase === 'final-endpoint-closure-terminal-stubs'
      && (trace.workItemCount ?? 0) > 0
    ));
    const laneRepairTrace = phaseTrace.find(trace => (
      trace.phase === 'seed-interactive-lane-repair'
    ));
    const workDiagnostics = JSON.stringify({
      hardGateTrace,
      activeStrictFallbackTraces,
      laneRepairTrace,
    }, null, 2);

    expect(hardGateTrace, workDiagnostics).toMatchObject({
      candidateCount: 44,
      resolution: 'accepted',
      workItemCount: 1,
    });
    expect(activeStrictFallbackTraces, workDiagnostics).toHaveLength(1);
    const strictFallbackTrace = activeStrictFallbackTraces[0];
    expect(strictFallbackTrace, workDiagnostics).toMatchObject({
      candidateCount: 44,
      resolution: 'accepted',
      workItemCount: 1,
    });
    expectWorkWithinCeilings(strictFallbackTrace, [
      ['changedEdgeCount', 18],
      ['evaluationCount', 23],
      ['cacheHitCount', 32],
      ['scannedNodeCount', 136],
      ['scannedSegmentCount', 22_987],
      ['scannedEdgePairCount', 3_998],
    ], workDiagnostics);
    expect(laneRepairTrace, workDiagnostics).toMatchObject({
      resolution: 'accepted',
      cacheHitCount: 0,
    });
    expectWorkWithinCeilings(laneRepairTrace, [
      ['candidateCount', 6_814],
      ['changedEdgeCount', 12],
      ['evaluationCount', 6_858],
      ['scannedSegmentCount', 548_879],
    ], workDiagnostics);

    expect(
      durationMs,
      JSON.stringify({ durationMs, quality, workDiagnostics }, null, 2),
    ).toBeLessThan(25_000);
    // Check the fingerprint after all quality/work budgets so a geometry change
    // cannot hide an independent performance regression.
    // Clearance-staged corner shortcuts remove two e-op-heat bends; two other
    // corridors move while retaining their endpoints and all quality gates.
    expect(paths.find(route => route.id === 'e-op-heat')?.path).toEqual([
      { x: 3712, y: 850 }, { x: 3712, y: 1395 },
      { x: 4231.6, y: 1395 }, { x: 4231.6, y: 1809 },
      { x: 4433.4, y: 1809 },
    ]);
    expect(finalOutputRouteSignature).toBe('route-v2:44:174:065ac410d5a8527e');
  }, 60_000);
});
