export type DisplayCrossingClusterCandidateBudget = Readonly<{
  maxLocalCandidates: number;
  maxSidePairCandidates: number;
}>;

const MAX_CLUSTER_EDGES = 24;
const COMPLEX_CLUSTER_EDGE_THRESHOLD = 16;

const STANDARD_BUDGET: DisplayCrossingClusterCandidateBudget = Object.freeze({
  maxLocalCandidates: 512,
  maxSidePairCandidates: 64,
});

const COMPLEX_BUDGET: DisplayCrossingClusterCandidateBudget = Object.freeze({
  maxLocalCandidates: 4_096,
  maxSidePairCandidates: 512,
});

/**
 * Keeps ordinary clusters on a cheap ordered sample while preserving the
 * broader search needed by the bounded 17–24-edge multi-trunk closure.
 */
export const resolveDisplayCrossingClusterCandidateBudget = (
  edgeCount: number,
): DisplayCrossingClusterCandidateBudget | null => {
  if (!Number.isInteger(edgeCount) || edgeCount <= 0 || edgeCount > MAX_CLUSTER_EDGES) {
    return null;
  }
  return edgeCount > COMPLEX_CLUSTER_EDGE_THRESHOLD ? COMPLEX_BUDGET : STANDARD_BUDGET;
};
