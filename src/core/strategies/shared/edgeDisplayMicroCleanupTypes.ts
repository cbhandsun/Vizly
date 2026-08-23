import type { Edge } from '@xyflow/react';

export type DisplayMicroCleanupDiagnostics = {
  generatedCandidateCount: number;
  evaluatedCandidateCount: number;
  locallyRejectedCandidateCount: number;
  pairOpportunityEdgeCount: number;
  cacheHitCount: number;
  pairCacheHitCount: number;
  scannedEdgePairCount: number;
  scannedSegmentCount: number;
};

export const createDisplayMicroCleanupDiagnostics = (): DisplayMicroCleanupDiagnostics => ({
  generatedCandidateCount: 0,
  evaluatedCandidateCount: 0,
  locallyRejectedCandidateCount: 0,
  pairOpportunityEdgeCount: 0,
  cacheHitCount: 0,
  pairCacheHitCount: 0,
  scannedEdgePairCount: 0,
  scannedSegmentCount: 0,
});

export type DisplayMicroCleanupSafetyScore = Readonly<{
  obstacleHits: number;
  attachedTerminals: number;
  anchoredTerminals: number;
}>;

/**
 * Optional node-aware evaluator supplied by display composition code. The
 * micro-cleanup strategy remains geometry-only when this context is omitted.
 * `changedIndexes` is cumulative relative to the context baseline so the
 * evaluator can reuse per-edge obstacle and terminal snapshots exactly.
 */
export type DisplayMicroCleanupSafetyContext = Readonly<{
  baseline: DisplayMicroCleanupSafetyScore;
  evaluate: (
    candidateEdges: Edge[],
    changedIndexes?: readonly number[],
  ) => DisplayMicroCleanupSafetyScore;
}>;

export type DisplayMicroCleanupOptions = Readonly<{
  /**
   * Restricts a derivative cleanup to edges whose displayed geometry changed
   * in the preceding repair. Newly changed compound peers are included on the
   * next pass. An omitted value keeps the full fixed-point search.
   */
  candidateEdgeIndexes?: readonly number[];
}>;

export const displayMicroCleanupSafetyDoesNotRegress = (
  baseline: DisplayMicroCleanupSafetyScore,
  candidate: DisplayMicroCleanupSafetyScore,
): boolean => (
  Number.isFinite(candidate.obstacleHits)
  && Number.isFinite(candidate.attachedTerminals)
  && Number.isFinite(candidate.anchoredTerminals)
  && candidate.obstacleHits <= baseline.obstacleHits
  && candidate.attachedTerminals >= baseline.attachedTerminals
  && candidate.anchoredTerminals >= baseline.anchoredTerminals
);
