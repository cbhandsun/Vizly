import type { Edge, Node } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeConversions';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';

export const baseReactFlowIdentifierListsMatch = (
  first: readonly string[],
  second: readonly string[],
): boolean => (
  first.length === second.length
  && first.every((identifier, index) => identifier === second[index])
);

export const baseReactFlowTopologyAffectedEdgeCount = (
  changedEdgeIds: readonly string[],
  eligibleEdgeIds: readonly string[],
): number => new Set([...changedEdgeIds, ...eligibleEdgeIds]).size;

export const baseReactFlowRoutingChangeSetMatches = (
  verified: BaseReactFlowRoutingChangeSet,
  requested: BaseReactFlowRoutingChangeSet,
): boolean => (
  verified.reason === requested.reason
  && verified.classification === requested.classification
  && verified.topologyChanged === requested.topologyChanged
  && verified.geometryChanged === requested.geometryChanged
  && baseReactFlowIdentifierListsMatch(verified.changedNodeIds, [...requested.changedNodeIds].sort())
  && baseReactFlowIdentifierListsMatch(verified.changedEdgeIds, [...requested.changedEdgeIds].sort())
);

export const baseReactFlowReportHasOnlyObstacleDefects = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => (
  report.obstacleHits > 0
  && report.terminalsAnchored
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.strictCrossings === 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.hairpins === 0
);

export const baseReactFlowReportHasOnlyStrictDefects = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => (
  report.obstacleHits === 0
  && report.terminalsAnchored
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.strictCrossings > 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.hairpins === 0
);

export const preservesBaseReactFlowIncrementalBoundary = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  mutableIds: ReadonlySet<string>,
): boolean => (
  baselineEdges.length === candidateEdges.length
  && candidateEdges.every((edge, index) => (
    mutableIds.has(edge.id) || edge === baselineEdges[index]
  ))
);

/** Lock only the transaction's mutable routes. Frozen precompiled edges may
 * omit runtime lock flags; materializing those flags would replace their
 * identities and invalidate an otherwise legal incremental candidate.
 * Preserve the candidate's frozen entries so boundary checks still detect
 * any unauthorized changes made before this step.
 */
export const lockBaseReactFlowIncrementalComputedPaths = (
  edges: Edge[],
  nodes: Node[],
  mutableIds: ReadonlySet<string>,
): Edge[] => {
  const mutableEdges = edges.filter(edge => mutableIds.has(edge.id));
  if (mutableEdges.length === 0) return edges;
  const lockedById = new Map(
    lockFinalDisplayComputedPaths(mutableEdges, nodes).map(edge => [edge.id, edge]),
  );
  return edges.map(edge => lockedById.get(edge.id) ?? edge);
};

export const repairBaseReactFlowIncrementalClearance = ({
  edges, nodes, baselineEdges, mutableIds, clearanceIds, hardReport,
}: {
  edges: Edge[];
  nodes: Node[];
  baselineEdges: Edge[];
  mutableIds: ReadonlySet<string>;
  clearanceIds: ReadonlySet<string>;
  hardReport: (edges: Edge[]) => BaseDisplayBoundedCandidateReport;
}): Edge[] => repairBusinessNodeClearanceRisks(edges, nodes, {
  eligibleEdgeIds: clearanceIds,
  minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  validateCandidate: ({ candidateEdges }) => {
    if (!preservesBaseReactFlowIncrementalBoundary(baselineEdges, candidateEdges, mutableIds)) {
      return false;
    }
    const report = hardReport(candidateEdges);
    return report.hardClean || baseReactFlowReportHasOnlyStrictDefects(report);
  },
});

export const baseReactFlowIncrementalEdgesHaveNodeClearance = (
  edges: readonly Edge[],
  nodes: Node[],
  eligibleIds: ReadonlySet<string>,
  minimumClearance = COMMERCIAL_BUSINESS_NODE_CLEARANCE,
): boolean => edges.every(edge => (
  !eligibleIds.has(edge.id)
  || createNodeClearanceEvaluationContext(nodes, edge).score(
    getDisplayComputedPath(edge),
    minimumClearance,
  ) <= 0.5
));
