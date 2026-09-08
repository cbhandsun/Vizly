import type { Edge } from '@xyflow/react';
import { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';
import { baseReactFlowDisplayOutputRouteSignatureMatches } from './baseReactFlowDisplayCache';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { baseReactFlowIncrementalDisplayCommitIsSafe } from './baseReactFlowDisplayIncrementalCommitGate';
import { createBaseReactFlowTopologyIncrementalProjection } from './baseReactFlowDisplayTopologyIncremental';
import {
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';
import type { DisplayEdgesWorkerResolvedIncrementalRouteRequest,
  DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import { startDisplayRoutingPhaseTrace, type DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import { computeBaseReactFlowDisplayInputIdentityBundle } from './baseReactFlowDisplayInputIdentity';
import { createBaseReactFlowRoutingAffectedClosure, createBaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';
import { baseReactFlowRoutingChangeSetMatches } from './baseReactFlowDisplayIncrementalContracts';

/** One collective stability candidate; no per-edge search or weaker fallback gate. */
export const preserveDisplayTopologyFallbackRoutes = (
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest,
  response: DisplayEdgesWorkerResponse,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): DisplayEdgesWorkerResponse => {
  if (request.changeSet.classification !== 'topology' || response.hardClean !== true
    || response.fallbackLevel !== 'full' || !response.edges
    || !['full-route', 'full-route-repaired'].includes(response.routeResolution ?? '')) return response;
  const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({ ...request,
    nodes: request.baselineNodes, edges: request.baselineSourceEdges });
  const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle(request);
  if (baselineIdentity.cacheSignature !== request.baselineInputSignature
    || baselineIdentity.geometryDigest !== request.baselineInputGeometryDigest
    || nextIdentity.cacheSignature !== request.nextInputSignature
    || nextIdentity.geometryDigest !== request.nextInputGeometryDigest) return response;
  const patches = sanitizeBaseReactFlowTrustedDisplayPatches(request.baselineSourceEdges, request.baselinePatches);
  if (!patches) return response;
  const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(request.baselineSourceEdges, patches);
  if (!baselineEdges || !baseReactFlowDisplayOutputRouteSignatureMatches(
    baselineEdges, request.baselineOutputRouteSignature,
  )) return response;
  const changeSet = createBaseReactFlowRoutingChangeSet({ previousNodes: request.baselineNodes,
    previousEdges: request.baselineSourceEdges, nextNodes: request.nodes, nextEdges: request.edges,
    reasonHint: request.changeSet.reason });
  if (!baseReactFlowRoutingChangeSetMatches(changeSet, request.changeSet)) return response;
  const closure = createBaseReactFlowRoutingAffectedClosure({ changeSet,
    previousNodes: request.baselineNodes, nextNodes: request.nodes, baselineEdges, nextEdges: request.edges });
  const projection = createBaseReactFlowTopologyIncrementalProjection({
    baselineNodes: request.baselineNodes, baselineSourceEdges: request.baselineSourceEdges,
    baselineEdges, baselinePatches: patches, nextNodes: request.nodes,
    nextEdges: request.edges, changeSet: request.changeSet,
  });
  if (!projection) return response;
  const mutable = new Set([...request.mutableEdgeIds, ...closure.mutableEdgeIds, ...projection.changedPresentEdgeIds]);
  const preferred = new Map(projection.edges.map(edge => [edge.id, edge] as const));
  let restoredCount = 0;
  const candidate: Edge[] = response.edges.map(edge => {
    const previous = preferred.get(edge.id);
    if (mutable.has(edge.id) || !previous || doBaseReactFlowDisplayRoutesMatchExactly([edge], [previous])) return edge;
    restoredCount += 1;
    return previous;
  });
  if (restoredCount === 0 || restoredCount > 64) return response;
  const timer = startDisplayRoutingPhaseTrace({ phase: 'quality', candidateCount: 1, onTrace: onPhaseTrace });
  const nodes = withDisplayAbsolutePositions(request.nodes, new Map(request.nodes.map(node => [node.id, node] as const)));
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
  const initialReport = evaluation.hardReport(response.edges);
  const hardReport = evaluation.hardReport(candidate);
  if (!initialReport.hardClean || !hardReport.hardClean
    || hardReport.quality.totalLength > initialReport.quality.totalLength + 1e-6
    || hardReport.quality.bends > initialReport.quality.bends
    || hardReport.quality.backtrackPenalty > initialReport.quality.backtrackPenalty
    || hardReport.quality.detourPenalty > initialReport.quality.detourPenalty
    || (hardReport.quality.crossingCost ?? 0) > (initialReport.quality.crossingCost ?? 0)) {
    timer.finish('rejected', 0);
    return response;
  }
  const stableResponse = { ...response, edges: candidate, hardReport };
  const accepted = baseReactFlowIncrementalDisplayCommitIsSafe({
    sourceEdges: request.edges, initialEdges: response.edges, response: stableResponse, nodes,
    eligibleEdgeIds: new Set(candidate.map(edge => edge.id)),
  });
  timer.finish(accepted ? 'accepted' : 'rejected', accepted ? restoredCount : 0);
  return accepted ? stableResponse : response;
};
