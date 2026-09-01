import type { Edge } from '@xyflow/react';

import type { EdgePathQualityScore } from './edgePathQualityGeometry';
import {
  businessNodeClearanceHardQualityDoesNotRegress,
  withBusinessNodeClearancePath,
} from './edgeBusinessNodeClearanceCandidateCommit';
import { createEdgePathQualityEvaluationContext } from './edgeStrictCrossingGuard';
import type { RoutingObstacleEvaluationContext } from './edgeRoutingObstacleEvaluation';
import { getEdgePath } from './edgeRoutingPathGeometry';

type Point = { x: number; y: number };

export interface BusinessNodeClearanceCandidateValidation {
  baselineEdges: Edge[];
  baselineRoutingObstacleHits: number;
  baselineQuality: EdgePathQualityScore;
  candidateEdges: Edge[];
  candidateRoutingObstacleHits: number;
  candidateQuality: EdgePathQualityScore;
  changedEdgeIndex: number;
}

export const selectAcceptedBusinessNodeClearanceCandidate = ({
  allowTransientStrictCrossing,
  baselineEdges,
  baselineObstacleHits,
  baselineQuality,
  edge,
  edgeIndex,
  obstacleContext,
  qualityContext,
  rankedCandidates,
  validateCandidate,
}: Readonly<{
  allowTransientStrictCrossing: boolean;
  baselineEdges: Edge[];
  baselineObstacleHits: number;
  baselineQuality: EdgePathQualityScore;
  edge: Edge;
  edgeIndex: number;
  obstacleContext: Pick<RoutingObstacleEvaluationContext, 'countEndpointNodeTraversalHits'>;
  qualityContext: ReturnType<typeof createEdgePathQualityEvaluationContext>;
  rankedCandidates: Iterable<Readonly<{ candidate: Point[]; hits: number }>>;
  validateCandidate?: (context: BusinessNodeClearanceCandidateValidation) => boolean;
}>): Edge[] | null => {
  const baselineEndpointHits = obstacleContext.countEndpointNodeTraversalHits(getEdgePath(edge));
  for (const rankedCandidate of rankedCandidates) {
    // Clearance excludes the terminals, but a detour must not cross their interiors.
    const candidateEndpointHits = obstacleContext.countEndpointNodeTraversalHits(
      rankedCandidate.candidate,
    );
    if (candidateEndpointHits > baselineEndpointHits) continue;
    const candidateEdges = baselineEdges.slice();
    candidateEdges[edgeIndex] = withBusinessNodeClearancePath(
      edge,
      rankedCandidate.candidate,
    );
    const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
    if (!businessNodeClearanceHardQualityDoesNotRegress(
      baselineQuality,
      candidateQuality,
      allowTransientStrictCrossing,
    )) continue;
    if (validateCandidate && !validateCandidate({
      baselineEdges,
      baselineRoutingObstacleHits: baselineObstacleHits + baselineEndpointHits,
      baselineQuality,
      candidateEdges,
      candidateRoutingObstacleHits: rankedCandidate.hits + candidateEndpointHits,
      candidateQuality,
      changedEdgeIndex: edgeIndex,
    })) continue;
    return candidateEdges;
  }
  return null;
};
