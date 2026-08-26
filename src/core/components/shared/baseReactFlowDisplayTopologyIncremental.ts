import type { Edge, Node } from '@xyflow/react';

import type { RoutingPatch } from '../../routing/routingPatch';
import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';
import {
  createBaseReactFlowFastDisplayEdges,
  lockFinalDisplayComputedPaths,
} from './baseReactFlowDisplayEdgeCore';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { findBaseReactFlowStrictContextEdgePromotions } from './baseReactFlowDisplayIncrementalPromotion';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import {
  baseReactFlowIncrementalEdgesHaveNodeClearance as topologyEdgesHaveClearance,
  baseReactFlowReportHasOnlyStrictDefects as reportHasOnlyStrictDefects,
  preservesBaseReactFlowIncrementalBoundary as preservesTopologyBoundary,
} from './baseReactFlowDisplayIncrementalContracts';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';

export const MAX_BASE_REACT_FLOW_TOPOLOGY_INCREMENTAL_CHANGES = 8;

export type BaseReactFlowTopologyIncrementalKind =
  | 'edge-add'
  | 'edge-remove'
  | 'port-policy';

export type BaseReactFlowTopologyIncrementalProjection = Readonly<{
  kind: BaseReactFlowTopologyIncrementalKind;
  edges: Edge[];
  changedPresentEdgeIds: string[];
  removedEdgeIds: string[];
  incidentContextEdgeIds: string[];
}>;

export type BaseReactFlowTopologyIncrementalCandidate = Readonly<{
  edges: Edge[];
  eligibleEdgeIds: string[];
}>;

export type BaseReactFlowTopologyIncrementalRouteOutcome = Readonly<{
  edges: Edge[] | null;
  eligibleEdgeIds: string[];
  hardReport?: BaseDisplayBoundedCandidateReport;
}>;

const ROUTING_DATA_KEYS = new Set([
  'computedPath',
  'elkPath',
  'treeRouting',
  'algorithm',
  '_layoutEpoch',
  'layoutPathLocked',
  '_layoutPathLocked',
  'runtimeHandleLock',
  '_runtimeHandleLock',
  '__baseDisplayFinalizedSignature',
  'stablePathQuality',
  'isTreeBus',
  'sharedTrunkAware',
  'sharedTrunkSynthesized',
  'overextendedTargetTrunkCorridorReclaimed',
  'useElkRouting',
  'layoutRoutingCandidate',
  'h',
  'waypoints',
]);

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const uniqueItemsById = <T extends { id: string }>(items: readonly T[]): Map<string, T> | null => {
  const result = new Map<string, T>();
  for (const item of items) {
    if (typeof item.id !== 'string' || item.id.length === 0 || result.has(item.id)) return null;
    result.set(item.id, item);
  }
  return result;
};

const edgesHaveValidEndpoints = (
  edges: readonly Edge[],
  nodeIds: ReadonlySet<string>,
): boolean => edges.every(edge => (
  typeof edge.source === 'string'
  && edge.source.length > 0
  && typeof edge.target === 'string'
  && edge.target.length > 0
  && nodeIds.has(edge.source)
  && nodeIds.has(edge.target)
));

const sameIdentifiers = (first: readonly string[], second: readonly string[]): boolean => (
  first.length === second.length
  && first.every((identifier, index) => identifier === second[index])
);

const clearTopologyMutableRoutingState = (edge: Edge): Edge => {
  const sourceData = asRecord(edge.data);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourceData)) {
    if (!ROUTING_DATA_KEYS.has(key)) data[key] = value;
  }
  const originalType = typeof sourceData.originalType === 'string'
    && sourceData.originalType.length > 0
    ? sourceData.originalType
    : undefined;
  return {
    ...edge,
    ...(String(edge.type || '').toLowerCase() === 'stablepath'
      ? { type: originalType ?? 'advanced-smart-step' }
      : {}),
    data,
  };
};

const projectTrustedBaselineEdge = ({
  baselineEdge,
  baselinePatch,
  baselineSourceEdge,
  nextSourceEdge,
}: {
  baselineEdge: Edge;
  baselinePatch: RoutingPatch;
  baselineSourceEdge: Edge;
  nextSourceEdge: Edge;
}): Edge | null => {
  if (nextSourceEdge === baselineSourceEdge) return baselineEdge;
  const projectedPatches = sanitizeBaseReactFlowTrustedDisplayPatches(
    [nextSourceEdge],
    [baselinePatch],
  );
  return projectedPatches
    ? mergeBaseReactFlowDisplayEdgePatches([nextSourceEdge], projectedPatches)?.[0] ?? null
    : null;
};

const resolveTopologyKind = ({
  additions,
  removals,
  changedExisting,
  reason,
}: {
  additions: readonly string[];
  removals: readonly string[];
  changedExisting: readonly string[];
  reason: BaseReactFlowRoutingChangeSet['reason'];
}): BaseReactFlowTopologyIncrementalKind | null => {
  if (
    reason === 'edge-add'
    && additions.length > 0
    && removals.length === 0
    && changedExisting.length === 0
  ) return 'edge-add';
  if (
    reason === 'edge-remove'
    && removals.length > 0
    && additions.length === 0
    && changedExisting.length === 0
  ) return 'edge-remove';
  if (
    reason === 'port-policy'
    && changedExisting.length > 0
    && additions.length === 0
    && removals.length === 0
  ) return 'port-policy';
  return null;
};

/**
 * Projects a trusted routing-only baseline onto the next topology by edge id.
 * Unsupported or ambiguous topology transactions fail closed before routing.
 */
export const createBaseReactFlowTopologyIncrementalProjection = ({
  baselineNodes,
  baselineSourceEdges,
  baselineEdges,
  baselinePatches,
  nextNodes,
  nextEdges,
  changeSet,
}: {
  baselineNodes: readonly Node[];
  baselineSourceEdges: Edge[];
  baselineEdges: Edge[];
  baselinePatches: RoutingPatch[];
  nextNodes: readonly Node[];
  nextEdges: Edge[];
  changeSet: BaseReactFlowRoutingChangeSet;
}): BaseReactFlowTopologyIncrementalProjection | null => {
  if (
    changeSet.classification !== 'topology'
    || !changeSet.topologyChanged
    || !changeSet.geometryChanged
    || changeSet.changedNodeIds.length !== 0
    || changeSet.changedEdgeIds.length === 0
    || changeSet.changedEdgeIds.length > MAX_BASE_REACT_FLOW_TOPOLOGY_INCREMENTAL_CHANGES
  ) return null;

  const baselineNodeById = uniqueItemsById(baselineNodes);
  const nextNodeById = uniqueItemsById(nextNodes);
  const baselineSourceById = uniqueItemsById(baselineSourceEdges);
  const baselineEdgeById = uniqueItemsById(baselineEdges);
  const nextEdgeById = uniqueItemsById(nextEdges);
  if (
    !baselineNodeById
    || !nextNodeById
    || !baselineSourceById
    || !baselineEdgeById
    || !nextEdgeById
    || baselineSourceEdges.length !== baselineEdges.length
    || baselineSourceEdges.length !== baselinePatches.length
    || !edgesHaveValidEndpoints(baselineSourceEdges, new Set(baselineNodeById.keys()))
    || !edgesHaveValidEndpoints(nextEdges, new Set(nextNodeById.keys()))
  ) return null;

  const patchById = new Map<string, RoutingPatch>();
  for (let index = 0; index < baselineSourceEdges.length; index += 1) {
    const sourceEdge = baselineSourceEdges[index];
    const routedEdge = baselineEdges[index];
    const patch = baselinePatches[index];
    if (
      !sourceEdge
      || !routedEdge
      || !patch
      || routedEdge.id !== sourceEdge.id
      || routedEdge.source !== sourceEdge.source
      || routedEdge.target !== sourceEdge.target
      || patch.id !== sourceEdge.id
      || patch.source !== sourceEdge.source
      || patch.target !== sourceEdge.target
    ) return null;
    patchById.set(sourceEdge.id, patch);
  }

  const additions = [...nextEdgeById.keys()]
    .filter(edgeId => !baselineSourceById.has(edgeId))
    .sort();
  const removals = [...baselineSourceById.keys()]
    .filter(edgeId => !nextEdgeById.has(edgeId))
    .sort();
  const changedExisting = changeSet.changedEdgeIds
    .filter(edgeId => baselineSourceById.has(edgeId) && nextEdgeById.has(edgeId))
    .sort();
  const actualChangedIds = [...additions, ...removals, ...changedExisting].sort();
  if (!sameIdentifiers(actualChangedIds, [...changeSet.changedEdgeIds].sort())) return null;
  const kind = resolveTopologyKind({
    additions,
    removals,
    changedExisting,
    reason: changeSet.reason,
  });
  if (!kind) return null;

  for (const [edgeId, nextEdge] of nextEdgeById) {
    const previous = baselineSourceById.get(edgeId);
    if (!previous || additions.includes(edgeId)) continue;
    if (previous.source !== nextEdge.source || previous.target !== nextEdge.target) return null;
  }

  const changedPresentIds = new Set([...additions, ...changedExisting]);
  const changedEndpointIds = new Set<string>();
  for (const edgeId of changeSet.changedEdgeIds) {
    const previous = baselineSourceById.get(edgeId);
    const next = nextEdgeById.get(edgeId);
    if (previous) {
      changedEndpointIds.add(previous.source);
      changedEndpointIds.add(previous.target);
    }
    if (next) {
      changedEndpointIds.add(next.source);
      changedEndpointIds.add(next.target);
    }
  }

  const projectedEdges: Edge[] = [];
  for (const nextEdge of nextEdges) {
    if (changedPresentIds.has(nextEdge.id)) {
      projectedEdges.push(clearTopologyMutableRoutingState(nextEdge));
      continue;
    }
    const baselineSourceEdge = baselineSourceById.get(nextEdge.id);
    const baselineEdge = baselineEdgeById.get(nextEdge.id);
    const baselinePatch = patchById.get(nextEdge.id);
    if (!baselineSourceEdge || !baselineEdge || !baselinePatch) return null;
    const projected = projectTrustedBaselineEdge({
      baselineEdge,
      baselinePatch,
      baselineSourceEdge,
      nextSourceEdge: nextEdge,
    });
    if (!projected) return null;
    projectedEdges.push(projected);
  }

  const incidentContextEdgeIds = nextEdges
    .filter(edge => (
      !changedPresentIds.has(edge.id)
      && (changedEndpointIds.has(edge.source) || changedEndpointIds.has(edge.target))
    ))
    .map(edge => edge.id)
    .sort();

  return {
    kind,
    edges: projectedEdges,
    changedPresentEdgeIds: [...changedPresentIds].sort(),
    removedEdgeIds: removals,
    incidentContextEdgeIds,
  };
};

/** Routes only edges introduced by, or explicitly changed in, the transaction. */
export const createBaseReactFlowTopologyIncrementalCandidate = ({
  projection,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  displayEdgeEpoch,
}: {
  projection: BaseReactFlowTopologyIncrementalProjection;
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  displayEdgeEpoch: number;
}): BaseReactFlowTopologyIncrementalCandidate | null => {
  if (projection.changedPresentEdgeIds.length === 0) {
    return projection.kind === 'edge-remove'
      ? { edges: projection.edges, eligibleEdgeIds: [] }
      : null;
  }
  const changedIds = new Set(projection.changedPresentEdgeIds);
  const sourceEdges = projection.edges.filter(edge => changedIds.has(edge.id));
  if (sourceEdges.length !== changedIds.size) return null;
  const routableSourceEdges = sourceEdges.map(edge => ({
    ...edge,
    type: 'stablePath',
  }));
  const routedById = new Map(
    createBaseReactFlowFastDisplayEdges({
      edges: routableSourceEdges,
      nodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph: false,
      displayEdgeEpoch,
    }).map(edge => [edge.id, edge] as const),
  );
  if (routedById.size !== changedIds.size) return null;
  const candidateEdges = projection.edges.map(edge => routedById.get(edge.id) ?? edge);
  return {
    edges: lockFinalDisplayComputedPaths(candidateEdges, nodes),
    eligibleEdgeIds: [...changedIds].sort(),
  };
};

/**
 * Runs one bounded topology-local transaction. Any unresolved hard defect is
 * returned as a safe miss so the Worker can execute its full route in-job.
 */
export const createBaseReactFlowTopologyIncrementalDisplayEdges = ({
  projection,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  displayEdgeEpoch,
  onRejectedReport,
}: {
  projection: BaseReactFlowTopologyIncrementalProjection;
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  displayEdgeEpoch: number;
  onRejectedReport?: (report: BaseDisplayBoundedCandidateReport) => void;
}): BaseReactFlowTopologyIncrementalRouteOutcome => {
  const candidate = createBaseReactFlowTopologyIncrementalCandidate({
    projection,
    nodes,
    enableSmartEdges,
    smartEdgePadding,
    displayEdgeEpoch,
  });
  if (!candidate) return { edges: null, eligibleEdgeIds: [] };
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
  const eligibleIds = new Set(candidate.eligibleEdgeIds);
  let candidateEdges = candidate.edges;
  let hardReport = evaluation.hardReport(candidateEdges);
  if (reportHasOnlyStrictDefects(hardReport)) {
    const strictPromotions = findBaseReactFlowStrictContextEdgePromotions({
      edges: candidateEdges,
      mutableEdgeIds: eligibleIds,
      contextEdgeIds: candidateEdges
        .filter(edge => !eligibleIds.has(edge.id))
        .map(edge => edge.id),
    });
    if (strictPromotions === null) return { edges: null, eligibleEdgeIds: [] };
    for (const edgeId of strictPromotions) eligibleIds.add(edgeId);
    const strictRepaired = repairFinalResidualStrictCrossings(candidateEdges, nodes);
    if (preservesTopologyBoundary(projection.edges, strictRepaired, eligibleIds)) {
      candidateEdges = lockFinalDisplayComputedPaths(strictRepaired, nodes);
    }
    hardReport = evaluation.hardReport(candidateEdges);
  }
  if (hardReport.hardClean && eligibleIds.size > 0) {
    const clearanceRepaired = repairBusinessNodeClearanceRisks(candidateEdges, nodes, {
      eligibleEdgeIds: eligibleIds,
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      validateCandidate: ({ candidateEdges: nextEdges }) => (
        preservesTopologyBoundary(projection.edges, nextEdges, eligibleIds)
        && evaluation.hardReport(nextEdges).hardClean
      ),
    });
    if (preservesTopologyBoundary(projection.edges, clearanceRepaired, eligibleIds)) {
      candidateEdges = lockFinalDisplayComputedPaths(clearanceRepaired, nodes);
    }
    hardReport = evaluation.hardReport(candidateEdges);
  }
  const accepted = hardReport.hardClean
    && topologyEdgesHaveClearance(candidateEdges, nodes, eligibleIds)
    && preservesTopologyBoundary(projection.edges, candidateEdges, eligibleIds);
  if (!accepted) onRejectedReport?.(hardReport);
  return {
    edges: accepted ? candidateEdges : null,
    eligibleEdgeIds: accepted ? [...eligibleIds].sort() : [],
    ...(accepted ? { hardReport } : {}),
  };
};
