import type { Edge } from '@xyflow/react';

import {
  countStrictEdgeCrossings,
  createEdgePathQualityEvaluationContext,
} from '../../strategies/shared/edgeStrictCrossingGuard';

export type StrictCrossingRepairDiagnostics = {
  qualityEvaluationCount: number;
  qualityContextCacheHitCount: number;
  qualityScoreCacheHitCount: number;
  pairCacheHitCount: number;
  segmentQueryCacheHitCount: number;
  nodeContextBuildCount: number;
  scannedEdgePairCount: number;
  scannedSegmentCount: number;
  duplicateVariantReferenceCount: number;
  knownQualityStrictReuseCount: number;
  residualRepairInvocationCount: number;
  strictFallbackInvocationCount: number;
  strictSweepInvocationCount: number;
};

export const createStrictCrossingRepairDiagnostics = (): StrictCrossingRepairDiagnostics => ({
  qualityEvaluationCount: 0,
  qualityContextCacheHitCount: 0,
  qualityScoreCacheHitCount: 0,
  pairCacheHitCount: 0,
  segmentQueryCacheHitCount: 0,
  nodeContextBuildCount: 0,
  scannedEdgePairCount: 0,
  scannedSegmentCount: 0,
  duplicateVariantReferenceCount: 0,
  knownQualityStrictReuseCount: 0,
  residualRepairInvocationCount: 0,
  strictFallbackInvocationCount: 0,
  strictSweepInvocationCount: 0,
});

export const countTrackedStrictCrossings = (
  edges: Edge[],
  diagnostics?: StrictCrossingRepairDiagnostics,
): number => {
  const scanMetrics = { scannedSegmentCount: 0 };
  const count = countStrictEdgeCrossings(edges, scanMetrics);
  if (diagnostics) diagnostics.scannedSegmentCount += scanMetrics.scannedSegmentCount;
  return count;
};

export const createTrackedStrictQualityContext = (
  edges: Edge[],
  diagnostics?: StrictCrossingRepairDiagnostics,
) => {
  const initialization = {
    cacheHit: false,
    scannedEdgePairCount: 0,
    scannedSegmentCount: 0,
  };
  const context = createEdgePathQualityEvaluationContext(edges, initialization);
  if (diagnostics) {
    diagnostics.qualityContextCacheHitCount += initialization.cacheHit ? 1 : 0;
    diagnostics.scannedEdgePairCount += initialization.scannedEdgePairCount;
    diagnostics.scannedSegmentCount += initialization.scannedSegmentCount;
  }
  let previous = context.readMetrics?.();
  const syncMetrics = (): void => {
    if (!diagnostics || !context.readMetrics || !previous) return;
    const next = context.readMetrics();
    diagnostics.pairCacheHitCount += Math.max(
      0,
      next.pairCacheHitCount - previous.pairCacheHitCount,
    );
    diagnostics.segmentQueryCacheHitCount += Math.max(
      0,
      next.segmentQueryCacheHitCount - previous.segmentQueryCacheHitCount,
    );
    diagnostics.scannedEdgePairCount += Math.max(
      0,
      next.scannedEdgePairCount - previous.scannedEdgePairCount,
    );
    diagnostics.scannedSegmentCount += Math.max(
      0,
      next.scannedSegmentCount - previous.scannedSegmentCount,
    );
    previous = next;
  };
  return {
    ...context,
    readCached(candidate: Edge[]) {
      const result = context.readCached?.(candidate);
      if (result && diagnostics) diagnostics.qualityScoreCacheHitCount += 1;
      return result;
    },
    createState(candidate: Edge[]) {
      const result = context.createState(candidate);
      syncMetrics();
      return result;
    },
    evaluate(candidate: Edge[]) {
      const result = context.evaluate(candidate);
      syncMetrics();
      return result;
    },
    evaluateChanged(candidate: Edge[], changedIndexes: readonly number[]) {
      const result = context.evaluateChanged(candidate, changedIndexes);
      syncMetrics();
      return result;
    },
    evaluateStateChanged(parentState, candidate, changedIndexes) {
      const result = context.evaluateStateChanged(parentState, candidate, changedIndexes);
      syncMetrics();
      return result;
    },
  } satisfies typeof context;
};
