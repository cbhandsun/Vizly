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

export type EdgePathQualityDecomposition = {
  edgeSegments: Segment[][];
  edgeScores: EdgePathQualityScore[];
  pairScores: Map<number, PairQualityContribution>;
  score: EdgePathQualityScore;
};

export const calculateEdgePathQualityDecomposition = (
  edges: Edge[],
  snapshot: QualityInputSnapshot,
  scanMetrics?: { scannedEdgePairCount: number },
): EdgePathQualityDecomposition => {
  const edgeSegments = snapshot.paths.map(buildEdgeSegments);
  const edgeScores = snapshot.paths.map(calculateSingleEdgeQuality);
  const pairScores = new Map<number, PairQualityContribution>();
  const score = emptyScore();
  const edgeCount = edges.length;

  for (const edgeScore of edgeScores) addScore(score, edgeScore);
  for (let firstIndex = 0; firstIndex < edgeCount; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < edgeCount; secondIndex += 1) {
      if (scanMetrics) scanMetrics.scannedEdgePairCount += 1;
      const pairScore = calculateEdgePairQuality(
        edges[firstIndex],
        edges[secondIndex],
        edgeSegments[firstIndex],
        edgeSegments[secondIndex],
      );
      if (hasPairContribution(pairScore)) {
        pairScores.set(firstIndex * edgeCount + secondIndex, pairScore);
        addPairContribution(score, pairScore);
      }
    }
  }
  return { edgeSegments, edgeScores, pairScores, score };
};

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
