import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointOrderMetrics,
  type SameSideEndpointTrunkIdentity,
} from './edgeFinalSameSideEndpointOrderRepair';
import { createEdgePathQualityEvaluationContext } from './edgeStrictCrossingGuard';
import {
  EPS,
  buildObstacleMap,
  hardQualityDoesNotRegress,
  totalObstacleHits,
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
): Edge[] | null => {
  const baselineOrder = auditFinalSameSideEndpointOrder(current, nodes);
  const candidateOrder = auditFinalSameSideEndpointOrder(candidate.edges, nodes);
  if (!improvement(baselineOrder, candidateOrder)) return null;
  if (candidateOrder.invalidEndpointCount > baselineOrder.invalidEndpointCount) return null;
  if (!preservesTrueTrunks(baselineOrder.legalSharedTrunks, candidateOrder.legalSharedTrunks)) {
    return null;
  }
  const quality = createEdgePathQualityEvaluationContext(current);
  const baselineQuality = quality.evaluate(current);
  const candidateQuality = quality.evaluateChanged(
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
  const obstacles = buildObstacleMap(nodes);
  if (totalObstacleHits(candidate.edges, obstacles) > totalObstacleHits(current, obstacles)) {
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
