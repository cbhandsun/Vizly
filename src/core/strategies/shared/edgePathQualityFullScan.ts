import type { Edge } from '@xyflow/react';

import type {
  EdgePathQualityScore,
  PairQualityContribution,
  Segment,
} from './edgePathQualityGeometry';
import {
  addPairContribution,
  addScore,
  buildEdgeSegments,
  calculateEdgePairQuality,
  calculateSingleEdgeQuality,
  emptyScore,
  hasPairContribution,
} from './edgePathQualityGeometry';
import {
  buildQualityInputSnapshot,
  type QualityInputSnapshot,
} from './edgePathQualityInputSnapshot';
import {
  calculateMemoizedEdgePairQuality,
  type PairMemoCalculationMetrics,
} from './edgePathQualityPairMemo';

export type EdgePathQualityDecomposition = {
  edgeSegments: Segment[][];
  edgeScores: EdgePathQualityScore[];
  pairScores: Map<number, PairQualityContribution>;
  score: EdgePathQualityScore;
};

type DecompositionScanMetrics = {
  scannedEdgePairCount: number;
  pairCacheHitCount?: number;
};

const decomposeEdgePathQuality = (
  edges: Edge[],
  snapshot: QualityInputSnapshot,
  scanMetrics: DecompositionScanMetrics | undefined,
  memoized: boolean,
): EdgePathQualityDecomposition => {
  const pairMemoMetrics: PairMemoCalculationMetrics = {
    cacheHitCount: 0,
    calculatedPairCount: 0,
  };
  const edgeSegments = snapshot.paths.map(buildEdgeSegments);
  const edgeScores = snapshot.paths.map(calculateSingleEdgeQuality);
  const pairScores = new Map<number, PairQualityContribution>();
  const score = emptyScore();
  const edgeCount = edges.length;

  for (const edgeScore of edgeScores) addScore(score, edgeScore);
  for (let firstIndex = 0; firstIndex < edgeCount; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < edgeCount; secondIndex += 1) {
      const pairScore = memoized
        ? calculateMemoizedEdgePairQuality(
            edges[firstIndex],
            edges[secondIndex],
            edgeSegments[firstIndex],
            edgeSegments[secondIndex],
            snapshot.edgeSignatures[firstIndex],
            snapshot.edgeSignatures[secondIndex],
            pairMemoMetrics,
          )
        : calculateEdgePairQuality(
            edges[firstIndex],
            edges[secondIndex],
            edgeSegments[firstIndex],
            edgeSegments[secondIndex],
          );
      if (!memoized && scanMetrics) scanMetrics.scannedEdgePairCount += 1;
      if (hasPairContribution(pairScore)) {
        pairScores.set(firstIndex * edgeCount + secondIndex, pairScore);
        addPairContribution(score, pairScore);
      }
    }
  }
  if (memoized && scanMetrics) {
    scanMetrics.scannedEdgePairCount += pairMemoMetrics.calculatedPairCount;
    if (typeof scanMetrics.pairCacheHitCount === 'number') {
      scanMetrics.pairCacheHitCount += pairMemoMetrics.cacheHitCount;
    }
  }
  return { edgeSegments, edgeScores, pairScores, score };
};

export const calculateEdgePathQualityDecomposition = (
  edges: Edge[],
  snapshot: QualityInputSnapshot,
  scanMetrics?: DecompositionScanMetrics,
): EdgePathQualityDecomposition => decomposeEdgePathQuality(
  edges,
  snapshot,
  scanMetrics,
  false,
);

export const calculateMemoizedEdgePathQualityDecomposition = (
  edges: Edge[],
  snapshot: QualityInputSnapshot,
  scanMetrics?: DecompositionScanMetrics,
): EdgePathQualityDecomposition => decomposeEdgePathQuality(
  edges,
  snapshot,
  scanMetrics,
  true,
);

/** Bypasses request and signature caches for the final commit gate. */
export const calculateEdgePathQualityScoreExact = (
  edges: Edge[],
  scanMetrics?: { scannedEdgePairCount: number },
): EdgePathQualityScore => ({
  ...calculateEdgePathQualityDecomposition(
    edges,
    buildQualityInputSnapshot(edges),
    scanMetrics,
  ).score,
});
