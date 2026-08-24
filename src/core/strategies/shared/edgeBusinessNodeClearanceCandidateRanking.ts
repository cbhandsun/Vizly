export type BusinessNodeClearanceCandidateRank<T> = Readonly<{
  candidate: T;
  bendCount: number;
  commercialRisk: number;
  hits: number;
  length: number;
  risk: number;
}>;

export type BusinessNodeClearanceBaselineRank = Readonly<{
  commercialRisk: number;
  hits: number;
  risk: number;
}>;

export type BusinessNodeClearanceCandidateWithHits<T> = Readonly<{
  candidate: T;
  hits: number;
}>;

const RISK_TOLERANCE = 0.5;

/**
 * Rejects candidates that cannot beat the baseline before callers perform the
 * more expensive commercial and local-clearance scoring. The ranker always
 * rejects a candidate with more obstacle hits than its current best, whose
 * initial hit count is the baseline budget.
 */
export const selectBusinessNodeClearanceCandidatesWithinHitBudget = <T>(
  candidates: readonly T[],
  maximumHits: number,
  countHits: (candidate: T, maximumHits: number) => number,
): BusinessNodeClearanceCandidateWithHits<T>[] => {
  if (!Number.isSafeInteger(maximumHits) || maximumHits < 0) return [];
  return candidates.flatMap(candidate => {
    const hits = countHits(candidate, maximumHits);
    return Number.isSafeInteger(hits) && hits >= 0 && hits <= maximumHits
      ? [{ candidate, hits }]
      : [];
  });
};

const canReplace = <T>(
  best: BusinessNodeClearanceCandidateRank<T>,
  candidate: BusinessNodeClearanceCandidateRank<T>,
): boolean => {
  if (candidate.hits > best.hits) return false;
  if (candidate.commercialRisk > best.commercialRisk + RISK_TOLERANCE) return false;
  if (
    candidate.hits === best.hits
    && Math.abs(candidate.commercialRisk - best.commercialRisk) <= RISK_TOLERANCE
    && candidate.risk >= best.risk - RISK_TOLERANCE
  ) return false;
  return candidate.hits < best.hits
    || candidate.commercialRisk < best.commercialRisk - RISK_TOLERANCE
    || (
      Math.abs(candidate.commercialRisk - best.commercialRisk) <= RISK_TOLERANCE
      && candidate.risk < best.risk - RISK_TOLERANCE
    )
    || (
      candidate.hits === best.hits
      && Math.abs(candidate.commercialRisk - best.commercialRisk) <= RISK_TOLERANCE
      && Math.abs(candidate.risk - best.risk) <= RISK_TOLERANCE
      && (
        candidate.bendCount < best.bendCount
        || (
          candidate.bendCount === best.bendCount
          && candidate.length < best.length
        )
      )
    );
};

/**
 * Orders candidates from the exact local winner to weaker alternatives. A
 * caller can stop at the first candidate that passes its global hard gate:
 * failed candidates never changed the baseline in the original selection loop.
 */
export const rankBusinessNodeClearanceCandidates = <T>(
  candidates: readonly BusinessNodeClearanceCandidateRank<T>[],
  baseline: BusinessNodeClearanceBaselineRank,
): BusinessNodeClearanceCandidateRank<T>[] => [
  ...iterateBusinessNodeClearanceCandidates(candidates, baseline),
];

/**
 * Lazily yields the same winner sequence as the complete ranker. Consumers
 * that accept an early candidate avoid ranking alternatives that can no longer
 * affect the committed route.
 */
export function* iterateBusinessNodeClearanceCandidates<T>(
  candidates: readonly BusinessNodeClearanceCandidateRank<T>[],
  baseline: BusinessNodeClearanceBaselineRank,
): Generator<BusinessNodeClearanceCandidateRank<T>, void, undefined> {
  const remaining = [...candidates];
  while (remaining.length > 0) {
    let best: BusinessNodeClearanceCandidateRank<T> = {
      candidate: remaining[0].candidate,
      bendCount: Number.POSITIVE_INFINITY,
      commercialRisk: baseline.commercialRisk,
      hits: baseline.hits,
      length: Number.POSITIVE_INFINITY,
      risk: baseline.risk,
    };
    let bestIndex = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      if (!canReplace(best, remaining[index])) continue;
      best = remaining[index];
      bestIndex = index;
    }
    if (bestIndex < 0) break;
    remaining.splice(bestIndex, 1);
    yield best;
  }
}
