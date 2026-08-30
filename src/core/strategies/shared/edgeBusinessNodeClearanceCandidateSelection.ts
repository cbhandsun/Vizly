import type { Edge } from '@xyflow/react';

import type { EdgePathQualityScore } from './edgePathQualityGeometry';
import {
  businessNodeClearanceHardQualityDoesNotRegress,
  withBusinessNodeClearancePath,
} from './edgeBusinessNodeClearanceCandidateCommit';
import { createEdgePathQualityEvaluationContext } from './edgeStrictCrossingGuard';

type Point = { x: number; y: number };

export const selectAcceptedBusinessNodeClearanceCandidate = ({
  allowTransientStrictCrossing,
  baselineEdges,
  baselineQuality,
  edge,
  edgeIndex,
  qualityContext,
  rankedCandidates,
  validateCandidate,
}: Readonly<{
  allowTransientStrictCrossing: boolean;
  baselineEdges: Edge[];
  baselineQuality: EdgePathQualityScore;
  edge: Edge;
  edgeIndex: number;
  qualityContext: ReturnType<typeof createEdgePathQualityEvaluationContext>;
  rankedCandidates: Iterable<Readonly<{ candidate: Point[] }>>;
  validateCandidate?: (context: Readonly<{
    baselineEdges: Edge[];
    candidateEdges: Edge[];
    changedEdgeIndex: number;
  }>) => boolean;
}>): Edge[] | null => {
  for (const rankedCandidate of rankedCandidates) {
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
