import type { Edge } from '@xyflow/react';

export type RankedDisplayTerminalPortCandidate = Readonly<{
  candidateEdge: Edge;
  declaredAxisMismatches: number;
  obstacleHits: number;
  order: number;
}>;

export const createDisplayTerminalPortCandidateBuckets = (
  isValid: (edge: Edge) => boolean,
) => {
  const candidateEdges: Edge[] = [];
  const handleOnlyCandidateEdges: Edge[] = [];
  const insetNudgeCandidateEdges: Edge[] = [];
  const append = (bucket: Edge[], candidateEdge: Edge) => {
    if (isValid(candidateEdge)) bucket.push(candidateEdge);
  };
  return {
    candidateEdges,
    handleOnlyCandidateEdges,
    insetNudgeCandidateEdges,
    appendCandidate: (edge: Edge) => append(candidateEdges, edge),
    appendPriorityCandidate: (edge: Edge) => append(handleOnlyCandidateEdges, edge),
    appendInsetNudgeCandidate: (edge: Edge) => append(insetNudgeCandidateEdges, edge),
  };
};

export const rankDisplayTerminalPortCandidates = (
  candidateEdges: Edge[],
  countDeclaredAxisMismatches: (edge: Edge) => number,
  countObstacleHits: (edge: Edge) => number,
  prioritizeDeclaredAxisCompletion: boolean,
): RankedDisplayTerminalPortCandidate[] => candidateEdges
  .map((candidateEdge, order) => ({
    candidateEdge,
    order,
    declaredAxisMismatches: countDeclaredAxisMismatches(candidateEdge),
    obstacleHits: countObstacleHits(candidateEdge),
  }))
  .sort((first, second) => (
    (prioritizeDeclaredAxisCompletion
      ? first.declaredAxisMismatches - second.declaredAxisMismatches
      : 0)
    || first.obstacleHits - second.obstacleHits
    || first.order - second.order
  ));

export const displayTerminalPortCandidateIsBetter = (
  candidate: Pick<RankedDisplayTerminalPortCandidate, 'declaredAxisMismatches' | 'obstacleHits'>,
  acceptedDeclaredAxisMismatches: number,
  acceptedObstacleHits: number,
  prioritizeDeclaredAxisCompletion: boolean,
): boolean => prioritizeDeclaredAxisCompletion
  ? candidate.declaredAxisMismatches < acceptedDeclaredAxisMismatches
    || (
      candidate.declaredAxisMismatches === acceptedDeclaredAxisMismatches
      && candidate.obstacleHits < acceptedObstacleHits
    )
  : candidate.obstacleHits < acceptedObstacleHits;

export const displayTerminalPortCandidateIsComplete = (
  candidate: Pick<RankedDisplayTerminalPortCandidate, 'declaredAxisMismatches' | 'obstacleHits'>,
  prioritizeDeclaredAxisCompletion: boolean,
): boolean => candidate.obstacleHits === 0
  && (!prioritizeDeclaredAxisCompletion || candidate.declaredAxisMismatches === 0);
