const MAX_INCREMENTAL_QUALITY_STATE_EDGE_CHANGES = 8;
const MAX_INCREMENTAL_QUALITY_EDGE_CHANGES = 32;
const MAX_INCREMENTAL_QUALITY_AFFECTED_PAIRS = 1_024;
const MIN_INCREMENTAL_QUALITY_PAIR_SAVINGS = 32;

export const shouldUseIncrementalEdgePathQualityState = (
  changedEdgeCount: number,
): boolean => Number.isSafeInteger(changedEdgeCount)
  && changedEdgeCount >= 0
  && changedEdgeCount <= MAX_INCREMENTAL_QUALITY_STATE_EDGE_CHANGES;

/**
 * Keeps the historic small-change path, then admits a bounded wider change set
 * only when its worst-case affected pairs have material savings over a full
 * scan and stay within a fixed absolute work budget.
 */
export const shouldUseIncrementalEdgePathQualityEvaluation = (
  edgeCount: number,
  changedEdgeCount: number,
): boolean => {
  if (
    !Number.isSafeInteger(edgeCount)
    || !Number.isSafeInteger(changedEdgeCount)
    || edgeCount < 0
    || changedEdgeCount < 0
    || changedEdgeCount > edgeCount
  ) return false;
  if (shouldUseIncrementalEdgePathQualityState(changedEdgeCount)) return true;
  if (
    changedEdgeCount > MAX_INCREMENTAL_QUALITY_EDGE_CHANGES
    || changedEdgeCount >= edgeCount
  ) return false;
  const fullPairCount = edgeCount * (edgeCount - 1) / 2;
  const affectedPairCount = changedEdgeCount
    * (2 * edgeCount - changedEdgeCount - 1) / 2;
  return fullPairCount - affectedPairCount >= MIN_INCREMENTAL_QUALITY_PAIR_SAVINGS
    && affectedPairCount <= MAX_INCREMENTAL_QUALITY_AFFECTED_PAIRS;
};
