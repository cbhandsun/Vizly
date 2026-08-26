import type { Edge } from '@xyflow/react';

import type { RoutingPatch } from '../../routing/routingPatch';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import { baseReactFlowTopologyAffectedEdgeCount } from './baseReactFlowDisplayIncrementalContracts';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';
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
  onRejectedReport,
}: {
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest;
  baselineEdges: Edge[];
  baselinePatches: RoutingPatch[];
  changeSet: BaseReactFlowRoutingChangeSet;
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
