import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointOrderMetrics,
  type SameSideEndpointTrunkIdentity,
} from './edgeFinalSameSideEndpointOrderRepair';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';
import {
  EPS,
  buildObstacleMap,
  countEdgeObstacleHits,
  hardQualityDoesNotRegress,
  totalObstacleHits,
  type Rect,
} from './edgeSharedEndpointPortOrderGeometry';

export type FinalEndpointTopologyCandidateValidation = Readonly<{
  baselineEdges: readonly Edge[];
  candidateEdges: readonly Edge[];
  changedEdgeIndexes: readonly number[];
  baselineOrder: SameSideEndpointOrderMetrics;
  candidateOrder: SameSideEndpointOrderMetrics;
}>;

export type FinalEndpointTopologyRepairOptions = Readonly<{
  validateCandidate?: (context: FinalEndpointTopologyCandidateValidation) => boolean;
  groupFilter?: (group: SameSideEndpointOrderMetrics['groups'][number]) => boolean;
}>;

type Candidate = Readonly<{
  edges: Edge[];
  changedEdgeIndexes: readonly number[];
}>;

export type FinalEndpointTopologyBaselineEvaluation = Readonly<{
  baselineEdges: Edge[];
  nodes: ReactFlowNode[];
  baselineOrder: SameSideEndpointOrderMetrics;
  quality: EdgePathQualityEvaluationContext;
  baselineQuality: EdgePathQualityScore;
  obstacles: Map<string, Rect>;
  baselineObstacleHits: number;
}>;

export const createFinalEndpointTopologyBaselineEvaluation = (
  baselineEdges: Edge[],
  nodes: ReactFlowNode[],
  baselineOrder = auditFinalSameSideEndpointOrder(baselineEdges, nodes),
): FinalEndpointTopologyBaselineEvaluation => {
  const quality = createEdgePathQualityEvaluationContext(baselineEdges);
  const obstacles = buildObstacleMap(nodes);
  return {
    baselineEdges,
    nodes,
    baselineOrder,
    quality,
    baselineQuality: quality.evaluate(baselineEdges),
    obstacles,
    baselineObstacleHits: totalObstacleHits(baselineEdges, obstacles),
  };
};

const preservesTrueTrunks = (
  baseline: readonly SameSideEndpointTrunkIdentity[],
  candidate: readonly SameSideEndpointTrunkIdentity[],
): boolean => baseline.every(trunk => candidate.some(next => (
  next.nodeId === trunk.nodeId
  && next.role === trunk.role
  && next.side === trunk.side
  && trunk.edgeIds.every(edgeId => next.edgeIds.includes(edgeId))
  && next.commonStemLength >= trunk.commonStemLength - EPS
)));

export const acceptFinalEndpointTopologyCandidate = (
  current: Edge[],
  candidate: Candidate,
  nodes: ReactFlowNode[],
  options: FinalEndpointTopologyRepairOptions,
  improvement: (
    baseline: SameSideEndpointOrderMetrics,
    candidateOrder: SameSideEndpointOrderMetrics,
  ) => boolean,
  allowedBacktrackIncrease = 0,
  reusable?: FinalEndpointTopologyBaselineEvaluation,
): Edge[] | null => {
  const evaluation = reusable?.baselineEdges === current && reusable.nodes === nodes
    ? reusable
    : createFinalEndpointTopologyBaselineEvaluation(current, nodes);
  const baselineOrder = evaluation.baselineOrder;
  const candidateOrder = auditFinalSameSideEndpointOrder(candidate.edges, nodes);
  if (!improvement(baselineOrder, candidateOrder)) return null;
  if (candidateOrder.invalidEndpointCount > baselineOrder.invalidEndpointCount) return null;
  if (!preservesTrueTrunks(baselineOrder.legalSharedTrunks, candidateOrder.legalSharedTrunks)) {
    return null;
  }
  const baselineQuality = evaluation.baselineQuality;
  const candidateQuality = evaluation.quality.evaluateChanged(
    candidate.edges,
    candidate.changedEdgeIndexes,
  );
  if (candidateQuality.strictCrossings > baselineQuality.strictCrossings) return null;
  if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality)) {
    const onlyBoundedBacktrackRegressed = allowedBacktrackIncrease > 0
      && candidateQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
      && candidateQuality.reverseOverlap <= baselineQuality.reverseOverlap
      && candidateQuality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
      && candidateQuality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
      && candidateQuality.shortEndpointStubs <= baselineQuality.shortEndpointStubs
      && candidateQuality.tinyInteriorDoglegs <= baselineQuality.tinyInteriorDoglegs
      && candidateQuality.hairpins <= baselineQuality.hairpins
      && candidateQuality.backtrackPenalty
        <= baselineQuality.backtrackPenalty + allowedBacktrackIncrease;
    if (!onlyBoundedBacktrackRegressed) return null;
  }
  const changedIndexes = [...new Set(candidate.changedEdgeIndexes)];
  const candidateObstacleHits = changedIndexes.every(index => (
    Number.isInteger(index) && index >= 0 && index < candidate.edges.length
  ))
    ? changedIndexes.reduce((total, index) => (
        total
        + countEdgeObstacleHits(candidate.edges[index], evaluation.obstacles)
        - countEdgeObstacleHits(current[index], evaluation.obstacles)
      ), evaluation.baselineObstacleHits)
    : totalObstacleHits(candidate.edges, evaluation.obstacles);
  if (candidateObstacleHits > evaluation.baselineObstacleHits) {
    return null;
  }
  if (options.validateCandidate) {
    try {
      if (!options.validateCandidate({
        baselineEdges: current,
        candidateEdges: candidate.edges,
        changedEdgeIndexes: candidate.changedEdgeIndexes,
        baselineOrder,
        candidateOrder,
      })) return null;
    } catch {
      return null;
    }
  }
  return candidate.edges;
};
