import type { Edge } from '@xyflow/react';

import type { DisplayPoint } from './baseReactFlowDisplayGeometry';

export type DisplayCrossingClusterPortSide = 'top' | 'bottom' | 'left' | 'right';

export type DisplayCrossingClusterCandidateMetrics = {
  group: string;
  laneExcursion: number;
  length: number;
  obstacleHits: number;
  pairRank: number;
  path: DisplayPoint[];
  pathSignature: string;
  sourceHandle: Edge['sourceHandle'];
  sourceClearance: number;
  strictCrossings: number;
  targetHandle: Edge['targetHandle'];
  targetClearance: number;
  unrelatedOverlap: number;
};

export type DisplayCrossingClusterLocalCandidate = DisplayCrossingClusterCandidateMetrics & (
  | {
    kind: 'port-bridge';
    sourceSide: DisplayCrossingClusterPortSide;
    targetSide: DisplayCrossingClusterPortSide;
  }
  | {
    kind: 'materialized';
    edge: Edge;
  }
);

export type DisplayCrossingClusterRankedCandidate = DisplayCrossingClusterCandidateMetrics & {
  edge: Edge;
};

export const DISPLAY_CROSSING_CLUSTER_MAX_LOCAL_CANDIDATES = 8;
export const DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB = 48;

const candidateSignature = (candidate: DisplayCrossingClusterLocalCandidate): string => (
  `${String(candidate.sourceHandle)}:${String(candidate.targetHandle)}:${candidate.pathSignature}`
);

const compareDefault = (
  first: DisplayCrossingClusterLocalCandidate,
  second: DisplayCrossingClusterLocalCandidate,
): number => (
  first.obstacleHits - second.obstacleHits
  || first.strictCrossings - second.strictCrossings
  || first.unrelatedOverlap - second.unrelatedOverlap
  || first.length - second.length
  || first.path.length - second.path.length
  || first.pairRank - second.pairRank
);

const compareOuterCurrentPair = (
  first: DisplayCrossingClusterLocalCandidate,
  second: DisplayCrossingClusterLocalCandidate,
): number => (
  first.obstacleHits - second.obstacleHits
  || first.strictCrossings - second.strictCrossings
  || first.unrelatedOverlap - second.unrelatedOverlap
  || second.laneExcursion - first.laneExcursion
);

const compareExtendedSource = (
  first: DisplayCrossingClusterLocalCandidate,
  second: DisplayCrossingClusterLocalCandidate,
): number => (
  first.obstacleHits - second.obstacleHits
  || first.strictCrossings - second.strictCrossings
  || first.unrelatedOverlap - second.unrelatedOverlap
  || second.sourceClearance - first.sourceClearance
  || first.targetClearance - second.targetClearance
  || second.laneExcursion - first.laneExcursion
);

const compareExtendedTarget = (
  first: DisplayCrossingClusterLocalCandidate,
  second: DisplayCrossingClusterLocalCandidate,
): number => (
  first.obstacleHits - second.obstacleHits
  || first.strictCrossings - second.strictCrossings
  || first.unrelatedOverlap - second.unrelatedOverlap
  || second.targetClearance - first.targetClearance
  || first.sourceClearance - second.sourceClearance
  || second.laneExcursion - first.laneExcursion
);

const compareFarLane = (
  first: DisplayCrossingClusterLocalCandidate,
  second: DisplayCrossingClusterLocalCandidate,
): number => second.laneExcursion - first.laneExcursion;

const hasOnlyFiniteRankingMetrics = (
  candidates: readonly DisplayCrossingClusterLocalCandidate[],
): boolean => candidates.every(candidate => (
  Number.isFinite(candidate.obstacleHits)
  && Number.isFinite(candidate.strictCrossings)
  && Number.isFinite(candidate.unrelatedOverlap)
  && Number.isFinite(candidate.length)
  && Number.isFinite(candidate.pairRank)
  && Number.isFinite(candidate.laneExcursion)
  && Number.isFinite(candidate.sourceClearance)
  && Number.isFinite(candidate.targetClearance)
));

/**
 * Returns the stable first minimum. Invalid/non-finite metrics are outside the
 * routed candidate contract; retaining native stable sort for that boundary
 * preserves the legacy comparator's exact NaN/Infinity behavior.
 */
const stableFirstWhere = (
  candidates: readonly DisplayCrossingClusterLocalCandidate[],
  predicate: (candidate: DisplayCrossingClusterLocalCandidate) => boolean,
  compare: (
    first: DisplayCrossingClusterLocalCandidate,
    second: DisplayCrossingClusterLocalCandidate,
  ) => number,
  canSelectLinearly: boolean,
): DisplayCrossingClusterLocalCandidate | undefined => {
  if (!canSelectLinearly) {
    return candidates.filter(predicate).sort(compare)[0];
  }
  let best: DisplayCrossingClusterLocalCandidate | undefined;
  for (const candidate of candidates) {
    if (!predicate(candidate)) continue;
    if (!best || compare(candidate, best) < 0) best = candidate;
  }
  return best;
};

/**
 * Preserves the legacy quota and preference order while avoiding repeated
 * filter/sort passes after the single global stable sort.
 */
export const rankDisplayCrossingClusterCandidates = (
  candidates: DisplayCrossingClusterLocalCandidate[],
  primaryCorridorAxis: 'x' | 'y',
): DisplayCrossingClusterLocalCandidate[] => {
  const sorted = [...candidates].sort(compareDefault);
  const canSelectLinearly = hasOnlyFiniteRankingMetrics(sorted);
  const byPairRank = new Map<number, DisplayCrossingClusterLocalCandidate[]>();
  for (const candidate of sorted) {
    const pairCandidates = byPairRank.get(candidate.pairRank);
    if (pairCandidates) pairCandidates.push(candidate);
    else byPairRank.set(candidate.pairRank, [candidate]);
  }

  const selected: DisplayCrossingClusterLocalCandidate[] = [];
  const selectedSignatures = new Set<string>();
  const append = (candidate: DisplayCrossingClusterLocalCandidate | undefined): void => {
    if (!candidate || selected.length >= DISPLAY_CROSSING_CLUSTER_MAX_LOCAL_CANDIDATES) return;
    const signature = candidateSignature(candidate);
    if (selectedSignatures.has(signature)) return;
    selectedSignatures.add(signature);
    selected.push(candidate);
  };
  const appendPairQuota = (pairRank: number, quota: number, preserveNearAndFar: boolean): void => {
    const pairCandidates = byPairRank.get(pairRank) ?? [];
    const firstByGroup = new Map<string, DisplayCrossingClusterLocalCandidate>();
    for (const candidate of pairCandidates) {
      if (!firstByGroup.has(candidate.group)) firstByGroup.set(candidate.group, candidate);
    }
    const before = selected.length;
    for (const group of [`${primaryCorridorAxis}-low`, `${primaryCorridorAxis}-high`]) {
      const nearest = firstByGroup.get(group);
      append(nearest);
      if (selected.length - before >= quota) return;
      if (preserveNearAndFar && nearest) {
        append(stableFirstWhere(
          pairCandidates,
          candidate => (
            candidate.group === group
            && candidate.obstacleHits === nearest.obstacleHits
            && candidate.strictCrossings <= nearest.strictCrossings + 2
          ),
          compareFarLane,
          canSelectLinearly,
        ));
        if (selected.length - before >= quota) return;
      }
    }
    for (const group of [
      `${primaryCorridorAxis}-middle`,
      `${primaryCorridorAxis === 'x' ? 'y' : 'x'}-low`,
      `${primaryCorridorAxis === 'x' ? 'y' : 'x'}-high`,
      `${primaryCorridorAxis === 'x' ? 'y' : 'x'}-middle`,
    ]) {
      append(firstByGroup.get(group));
      if (selected.length - before >= quota) return;
    }
    for (const candidate of pairCandidates) {
      append(candidate);
      if (selected.length - before >= quota) return;
    }
  };
  appendPairQuota(0, 4, true);
  appendPairQuota(1, 2, false);
  appendPairQuota(2, 2, false);
  for (const candidate of sorted) append(candidate);

  // The legacy second current-pair sort used a comparator prefix of compareDefault.
  // Stable sorting therefore left this filtered order unchanged.
  const currentPairCandidates = byPairRank.get(0) ?? [];
  const preferred = [
    currentPairCandidates[0],
    sorted.find(candidate => candidate.group === 'loop-shortcut'),
    stableFirstWhere(
      currentPairCandidates,
      candidate => candidate.sourceClearance > DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB,
      compareExtendedSource,
      canSelectLinearly,
    ),
    stableFirstWhere(
      currentPairCandidates,
      candidate => candidate.targetClearance > DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB,
      compareExtendedTarget,
      canSelectLinearly,
    ),
    stableFirstWhere(
      currentPairCandidates,
      () => true,
      compareOuterCurrentPair,
      canSelectLinearly,
    ),
    selected.find(candidate => candidate.pairRank === 1),
    selected.find(candidate => candidate.pairRank === 2),
  ].filter((candidate): candidate is DisplayCrossingClusterLocalCandidate => Boolean(candidate));

  const ranked: DisplayCrossingClusterLocalCandidate[] = [];
  const rankedSignatures = new Set<string>();
  const appendRanked = (candidate: DisplayCrossingClusterLocalCandidate): void => {
    if (ranked.length >= DISPLAY_CROSSING_CLUSTER_MAX_LOCAL_CANDIDATES) return;
    const signature = candidateSignature(candidate);
    if (rankedSignatures.has(signature)) return;
    rankedSignatures.add(signature);
    ranked.push(candidate);
  };
  for (const candidate of preferred) appendRanked(candidate);
  for (const candidate of selected) appendRanked(candidate);
  for (const candidate of sorted) appendRanked(candidate);
  return ranked;
};
