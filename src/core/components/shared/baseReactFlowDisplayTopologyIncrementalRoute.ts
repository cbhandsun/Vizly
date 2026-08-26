import type { Edge } from '@xyflow/react';

import type { RoutingPatch } from '../../routing/routingPatch';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import {
  baseReactFlowIncrementalEdgesHaveNodeClearance,
  baseReactFlowTopologyAffectedEdgeCount,
} from './baseReactFlowDisplayIncrementalContracts';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { baseReactFlowDisplayOutputRouteSignatureMatches } from './baseReactFlowDisplayCache';
import {
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';
import { createDisplayRoutingIdentity, displayRoutingIdentitiesMatch } from './baseReactFlowDisplayRoutingSession';
import type { DisplayRoutingWorkerSessionState } from './baseReactFlowDisplayWorkerSession';
import {
  createBaseReactFlowTopologyIncrementalDisplayEdges,
  createBaseReactFlowTopologyIncrementalProjection,
} from './baseReactFlowDisplayTopologyIncremental';
import type { DisplayEdgesWorkerResolvedIncrementalRouteRequest } from './baseReactFlowDisplayWorkerProtocol';

export type BaseReactFlowTopologyIncrementalRouteAttempt = Readonly<{
  edges: Edge[] | null;
  affectedEdgeCount: number;
  eligibleEdgeIds: string[];
  hardReport?: BaseDisplayBoundedCandidateReport;
}>;

export const createBaseReactFlowTopologyIncrementalRoute = ({
  request,
  baselineEdges,
  baselinePatches,
  changeSet,
  exactNextSession,
  onRejectedReport,
}: {
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest;
  baselineEdges: Edge[];
  baselinePatches: RoutingPatch[];
  changeSet: BaseReactFlowRoutingChangeSet;
  exactNextSession?: DisplayRoutingWorkerSessionState | null;
  onRejectedReport?: (report: BaseDisplayBoundedCandidateReport) => void;
}): BaseReactFlowTopologyIncrementalRouteAttempt => {
  const fallback = (): BaseReactFlowTopologyIncrementalRouteAttempt => ({
    edges: null,
    affectedEdgeCount: changeSet.changedEdgeIds.length,
    eligibleEdgeIds: [],
  });
  const projection = createBaseReactFlowTopologyIncrementalProjection({
    baselineNodes: request.baselineNodes,
    baselineSourceEdges: request.baselineSourceEdges,
    baselineEdges,
    baselinePatches,
    nextNodes: request.nodes,
    nextEdges: request.edges,
    changeSet,
  });
  if (!projection) return fallback();
  const nodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  const replay = createExactTopologySessionReplay({
    projection,
    nodes,
    request,
    exactNextSession,
  });
  if (replay) {
    return {
      edges: replay.edges,
      affectedEdgeCount: baseReactFlowTopologyAffectedEdgeCount(
        changeSet.changedEdgeIds,
        replay.eligibleEdgeIds,
      ),
      eligibleEdgeIds: replay.eligibleEdgeIds,
      hardReport: replay.hardReport,
    };
  }
  const topology = createBaseReactFlowTopologyIncrementalDisplayEdges({
    projection,
    nodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    displayEdgeEpoch: request.displayEdgeEpoch,
    onRejectedReport,
  });
  const affectedEdgeCount = topology.edges
    ? baseReactFlowTopologyAffectedEdgeCount(changeSet.changedEdgeIds, topology.eligibleEdgeIds)
    : changeSet.changedEdgeIds.length;
  return {
    edges: topology.edges,
    affectedEdgeCount,
    eligibleEdgeIds: topology.eligibleEdgeIds,
    ...(topology.hardReport ? { hardReport: topology.hardReport } : {}),
  };
};

const createExactTopologySessionReplay = ({
  projection,
  nodes,
  request,
  exactNextSession,
}: {
  projection: NonNullable<ReturnType<typeof createBaseReactFlowTopologyIncrementalProjection>>;
  nodes: import('@xyflow/react').Node[];
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest;
  exactNextSession?: DisplayRoutingWorkerSessionState | null;
}): Readonly<{
  edges: Edge[];
  eligibleEdgeIds: string[];
  hardReport: BaseDisplayBoundedCandidateReport;
}> | null => {
  if (
    projection.kind !== 'container-change'
    || !exactNextSession
    || !displayRoutingIdentitiesMatch(
      exactNextSession.ref.identity,
      createDisplayRoutingIdentity(
        request.nextInputSignature,
        request.nextInputGeometryDigest,
      ),
    )
  ) return null;
  const patches = sanitizeBaseReactFlowTrustedDisplayPatches(
    request.edges,
    exactNextSession.displayPatches,
  );
  const replayedEdges = patches
    ? mergeBaseReactFlowDisplayEdgePatches(request.edges, patches)
    : null;
  if (
    !replayedEdges
    || !baseReactFlowDisplayOutputRouteSignatureMatches(
      replayedEdges,
      exactNextSession.ref.outputRouteSignature,
    )
  ) return null;

  const replayedById = new Map(replayedEdges.map(edge => [edge.id, edge] as const));
  const contextIds = new Set(projection.incidentContextEdgeIds);
  const eligibleIds = new Set(projection.changedPresentEdgeIds);
  let boundaryViolation = false;
  const candidateEdges = projection.edges.map((baselineEdge) => {
    const replayedEdge = replayedById.get(baselineEdge.id);
    if (!replayedEdge) {
      boundaryViolation = true;
      return baselineEdge;
    }
    if (eligibleIds.has(baselineEdge.id)) return replayedEdge;
    if (doBaseReactFlowDisplayRoutesMatchExactly([baselineEdge], [replayedEdge])) {
      return baselineEdge;
    }
    if (contextIds.has(baselineEdge.id) && eligibleIds.size < 64) {
      eligibleIds.add(baselineEdge.id);
      return replayedEdge;
    }
    boundaryViolation = true;
    return baselineEdge;
  });
  if (boundaryViolation || eligibleIds.size === 0 || eligibleIds.size > 64) return null;

  const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
  const hardReport = evaluation.hardReport(candidateEdges);
  const allEdgeIds = new Set(candidateEdges.map(edge => edge.id));
  if (
    !hardReport.hardClean
    || !baseReactFlowIncrementalEdgesHaveNodeClearance(candidateEdges, nodes, allEdgeIds)
  ) return null;
  return {
    edges: candidateEdges,
    eligibleEdgeIds: [...eligibleIds].sort(),
    hardReport,
  };
};
