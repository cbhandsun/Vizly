import type { Edge } from '@xyflow/react';
import { edgeTerminalHandleChangeIsAllowed } from '../../routing/utils/edgeTerminalPolicy';
import { createDisplayReverseLayoutFrame } from './baseReactFlowDisplayReverseLayoutFrame';
import { doesDisplayCandidateMatchSourceGraph } from './baseReactFlowDisplayCandidateValidation';
import { getExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import { completeDisplayWorkerResponse } from './baseReactFlowDisplayWorkerSessionResponse';
import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeConversions';
import { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';
import { finalizeBaseReactFlowExactCommercialClearance } from './baseReactFlowDisplayFinalCommercialClearanceTransaction';
import { baseReactFlowDisplayCommercialQualityDoesNotRegress } from './baseReactFlowDisplayCommercialQuality';
import type {
  DisplayEdgesWorkerRepairValidateOrRouteRequest,
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

type Compute = (request: Exclude<DisplayEdgesWorkerRequest, DisplayEdgesWorkerRepairValidateOrRouteRequest>) => DisplayEdgesWorkerResponse;

/** Normalize only uniform reversed layout transactions, not display or incremental jobs. */
export const routeDisplayReverseLayout = (
  request: DisplayEdgesWorkerRepairValidateOrRouteRequest,
  stagedCandidate: Edge[],
  compute: Compute,
): DisplayEdgesWorkerResponse | null => {
  if (request.stopAfterObstacleFailure) return null;
  const frame = createDisplayReverseLayoutFrame(request.nodes, request.edges);
  if (!frame || getExactDisplayHardReport(stagedCandidate, request.nodes).hardClean) return null;
  // There is deliberately no inputIdentity here: a temporary coordinate frame
  // cannot write a Worker session or issue a commit receipt for the real graph.
  const canonical = compute({
    operation: 'route', requestId: request.requestId, nodes: frame.nodes, edges: frame.edges,
    enableSmartEdges: request.enableSmartEdges, smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph, displayEdgeEpoch: request.displayEdgeEpoch, qualityMode: request.qualityMode,
  });
  if (!canonical.hardClean || !canonical.edges || canonical.requestId !== request.requestId
    || (canonical.routeResolution !== 'full-route' && canonical.routeResolution !== 'full-route-repaired')
    || !doesDisplayCandidateMatchSourceGraph(request.edges, canonical.edges)) return null;
  const restored = frame.restoreEdges(canonical.edges);
  if (!restored) return null;
  const originalNodes = withDisplayAbsolutePositions(request.nodes, new Map(request.nodes.map(node => [node.id, node])));
  const locked = lockFinalDisplayComputedPaths(restored, originalNodes);
  if (locked.some((edge, index) => {
    const source = request.edges[index];
    return !source || !edgeTerminalHandleChangeIsAllowed(source, 'source', edge.sourceHandle, { allowRuntimeHandleChange: true })
      || !edgeTerminalHandleChangeIsAllowed(source, 'target', edge.targetHandle, { allowRuntimeHandleChange: true });
  })) return null;
  const restoredHardReport = getExactDisplayHardReport(locked, originalNodes);
  if (!restoredHardReport.hardClean) return null;
  const commerciallyFinalized = finalizeBaseReactFlowExactCommercialClearance({
    exactBaseline: {
      requestId: request.requestId,
      edges: locked,
      hardClean: true,
      hardReport: restoredHardReport,
      routeResolution: canonical.routeResolution,
    },
    repairNodes: originalNodes,
  });
  const finalEdges = commerciallyFinalized.edges;
  if (!commerciallyFinalized.hardClean || !finalEdges
    || !baseReactFlowDisplayCommercialQualityDoesNotRegress(canonical.edges, finalEdges)
    || finalEdges.some((edge, index) => {
      const source = request.edges[index];
      return !source
        || !edgeTerminalHandleChangeIsAllowed(
          source,
          'source',
          edge.sourceHandle,
          { allowRuntimeHandleChange: true },
        )
        || !edgeTerminalHandleChangeIsAllowed(
          source,
          'target',
          edge.targetHandle,
          { allowRuntimeHandleChange: true },
        );
    })) return null;
  // This is a Worker-owned full-route result, not an external persistent
  // candidate. Reflection preserves the full-route structural contract; audit
  // the materialized original geometry independently, then issue its receipt.
  // Never copy authority or routing patches from the temporary coordinate frame.
  const phaseTrace = [...(canonical.phaseTrace ?? [])];
  return completeDisplayWorkerResponse({ request, phaseTrace, response: {
    requestId: request.requestId,
    edges: finalEdges,
    hardClean: true,
    hardReport: commerciallyFinalized.hardReport,
    routeResolution: canonical.routeResolution, phaseTrace,
  },
  });
};
