import type { Edge } from '@xyflow/react';

import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';

type DisplayDiagnosticsWindow = {
  __vizlyDisplayRoutingDiagnosticsEnabled?: unknown;
};

export type DisplayRoutingPairDiagnostic = {
  first: Edge;
  second: Edge;
  overlap: number;
};

export type DisplayRoutingPairDiagnosticReport = {
  pairs: DisplayRoutingPairDiagnostic[];
  evaluatedPairCount: number;
  truncated: boolean;
};

const DEFAULT_MAX_PAIR_EVALUATIONS = 512;
const DEFAULT_MAX_EDGE_COUNT = 64;
const DEFAULT_MAX_DURATION_MS = 8;
const DEFAULT_MAX_REPORTED_PAIRS = 3;

/** Expensive pair diagnostics are opt-in and compiled out of production. */
export const isBaseReactFlowDisplayDiagnosticsEnabled = (
  windowLike: DisplayDiagnosticsWindow | undefined = (
    typeof window === 'undefined' ? undefined : window
  ),
): boolean => windowLike?.__vizlyDisplayRoutingDiagnosticsEnabled === true;

/**
 * Samples pair diagnostics within count and wall-clock budgets. Dense local
 * diagrams therefore cannot turn developer tooling into an unbounded O(E²)
 * main-thread task.
 */
export const collectBoundedDisplayRoutingPairDiagnostics = ({
  edges,
  maxEdgeCount = DEFAULT_MAX_EDGE_COUNT,
  maxPairEvaluations = DEFAULT_MAX_PAIR_EVALUATIONS,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  maxReportedPairs = DEFAULT_MAX_REPORTED_PAIRS,
  now = () => typeof performance === 'undefined' ? Date.now() : performance.now(),
}: {
  edges: readonly Edge[];
  maxEdgeCount?: number;
  maxPairEvaluations?: number;
  maxDurationMs?: number;
  maxReportedPairs?: number;
  now?: () => number;
}): DisplayRoutingPairDiagnosticReport => {
  const edgeLimit = Number.isFinite(maxEdgeCount)
    ? Math.max(0, Math.min(256, Math.floor(maxEdgeCount)))
    : DEFAULT_MAX_EDGE_COUNT;
  const pairLimit = Number.isFinite(maxPairEvaluations)
    ? Math.max(0, Math.min(10_000, Math.floor(maxPairEvaluations)))
    : DEFAULT_MAX_PAIR_EVALUATIONS;
  const durationLimit = Number.isFinite(maxDurationMs)
    ? Math.max(0, Math.min(100, maxDurationMs))
    : DEFAULT_MAX_DURATION_MS;
  const reportLimit = Number.isFinite(maxReportedPairs)
    ? Math.max(0, Math.min(20, Math.floor(maxReportedPairs)))
    : DEFAULT_MAX_REPORTED_PAIRS;
  const startedAt = now();
  const pairs: DisplayRoutingPairDiagnostic[] = [];
  let evaluatedPairCount = 0;
  let truncated = false;

  const candidateEdgeCount = Math.min(edges.length, edgeLimit);
  outer: for (let firstIndex = 0; firstIndex < candidateEdgeCount; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < candidateEdgeCount; secondIndex += 1) {
      if (
        evaluatedPairCount >= pairLimit
        || now() - startedAt >= durationLimit
        || pairs.length >= reportLimit
      ) {
        truncated = true;
        break outer;
      }
      const first = edges[firstIndex];
      const second = edges[secondIndex];
      evaluatedPairCount += 1;
      const overlap = calculateEdgePathQualityScore(
        [first, second],
      ).unexplainedRelatedOverlap;
      if (overlap > 0) pairs.push({ first, second, overlap });
    }
  }

  const totalPairCount = edges.length > 1
    ? (edges.length * (edges.length - 1)) / 2
    : 0;
  return {
    pairs,
    evaluatedPairCount,
    truncated: truncated || evaluatedPairCount < totalPairCount,
  };
};
