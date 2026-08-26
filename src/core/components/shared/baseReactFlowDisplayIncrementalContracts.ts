import type { Edge, Node } from '@xyflow/react';

import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';

export const baseReactFlowIdentifierListsMatch = (
  first: readonly string[],
  second: readonly string[],
): boolean => (
  first.length === second.length
  && first.every((identifier, index) => identifier === second[index])
);

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
  ) <= 1e-6
));
