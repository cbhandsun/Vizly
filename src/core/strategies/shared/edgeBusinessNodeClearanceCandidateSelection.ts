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

export const selectAcceptedBusinessNodeClearanceCandidate = ({
  allowTransientStrictCrossing,
  baselineEdges,
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
  baselineQuality: EdgePathQualityScore;
  edge: Edge;
  edgeIndex: number;
  obstacleContext: Pick<RoutingObstacleEvaluationContext, 'countEndpointNodeTraversalHits'>;
  qualityContext: ReturnType<typeof createEdgePathQualityEvaluationContext>;
  rankedCandidates: Iterable<Readonly<{ candidate: Point[] }>>;
  validateCandidate?: (context: Readonly<{
    baselineEdges: Edge[];
    candidateEdges: Edge[];
    changedEdgeIndex: number;
  }>) => boolean;
}>): Edge[] | null => {
  const baselineEndpointHits = obstacleContext.countEndpointNodeTraversalHits(getEdgePath(edge));
  for (const rankedCandidate of rankedCandidates) {
    // Clearance excludes the terminals, but a detour must not cross their interiors.
    if (obstacleContext.countEndpointNodeTraversalHits(rankedCandidate.candidate)
      > baselineEndpointHits) continue;
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
      candidateEdges,
      changedEdgeIndex: edgeIndex,
    })) continue;
    return candidateEdges;
  }
  return null;
};
