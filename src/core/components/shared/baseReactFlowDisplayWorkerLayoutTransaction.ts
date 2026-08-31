import type { Edge } from '@xyflow/react';
import { routeDisplayReverseLayout } from './baseReactFlowDisplayReverseLayoutRoute';

import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDisplayCachePatches,
} from './baseReactFlowDisplayRoutingTransaction';
import type {
  DisplayEdgesWorkerRepairValidateOrRouteRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

type ComputeWorkerResponse = (
  request: Exclude<
    import('./baseReactFlowDisplayWorkerProtocol').DisplayEdgesWorkerRequest,
    DisplayEdgesWorkerRepairValidateOrRouteRequest
  >,
) => DisplayEdgesWorkerResponse;

const resolvePersistentCandidate = (
  sourceEdges: Edge[],
  edges: Edge[] | undefined,
  patches: import('../../routing/routingPatch').RoutingPatch[] | undefined,
): Edge[] | null => {
  if (edges) return edges;
  const safePatches = patches
    ? sanitizeBaseReactFlowDisplayCachePatches(sourceEdges, patches)
    : null;
  return safePatches
    ? mergeBaseReactFlowDisplayEdgePatches(sourceEdges, safePatches)
    : null;
};

/** Normalize reversed layout jobs; retain the existing repair/validation flow otherwise. */
export const runDisplayWorkerLayoutRepairTransaction = (
  request: DisplayEdgesWorkerRepairValidateOrRouteRequest,
  compute: ComputeWorkerResponse,
): DisplayEdgesWorkerResponse => {
  const stagedCandidate = resolvePersistentCandidate(
    request.edges,
    request.candidateEdges,
    request.candidatePatches,
  );
  const fallbackCandidate = resolvePersistentCandidate(
    request.edges,
    request.fallbackCandidateEdges,
    request.fallbackCandidatePatches,
  );
  if (!stagedCandidate || !fallbackCandidate) {
    return { requestId: request.requestId, error: 'display-edge-worker-invalid-request' };
  }
  const reversed = routeDisplayReverseLayout(request, stagedCandidate, compute);
  if (reversed) return reversed;
  const repaired = compute({
    operation: 'repair',
    requestId: request.requestId,
    edges: stagedCandidate,
    nodes: request.nodes,
    inputIdentity: request.inputIdentity,
    repairMode: 'bounded',
    stopAfterObstacleFailure: request.stopAfterObstacleFailure === true,
  });
  if (
    request.stopAfterObstacleFailure === true
    && repaired.hardClean === false
    && (repaired.hardReport?.obstacleHits ?? 0) > 0
  ) return repaired;

  return compute({
    operation: 'validate-or-route',
    requestId: request.requestId,
    edges: request.edges,
    nodes: request.nodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
    displayEdgeEpoch: request.displayEdgeEpoch,
    qualityMode: request.qualityMode,
    inputIdentity: request.inputIdentity,
    candidateEdges: repaired.hardClean === true && repaired.edges
      ? repaired.edges
      : fallbackCandidate,
    candidateSource: request.candidateSource,
  });
};
