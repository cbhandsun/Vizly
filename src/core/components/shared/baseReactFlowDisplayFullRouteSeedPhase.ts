import type { Edge } from '@xyflow/react';

import {
  computeBaseDisplayInputSignature,
  isBaseDisplayFinalized,
  markBaseDisplayFinalized,
  normalizeBaseEdge,
  synthesizeStableFallbackPath,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayHardQualityGatesAreClean,
} from './baseReactFlowDisplayQualityGates';
import {
  resolveDisplayQualityBudget,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { createFastDisplayQualityEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import { finalizeDisplayEdgesForRenderMode } from './baseReactFlowDisplayRenderPipeline';
import type {
  BaseReactFlowDisplayEdgesArgs,
  BaseReactFlowFullRouteSeedResult,
  BaseReactFlowPreDisplayFinalEdgesFactory,
} from './baseReactFlowDisplayFullRouteTypes';

export const selectBaseReactFlowFullRouteSeedEdges = (
  rawEdges: Edge[],
  preparedBoundedEdges: Edge[] | null,
): Edge[] => preparedBoundedEdges ?? rawEdges;

export const prepareBaseReactFlowFullRouteSeed = ({
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
  reusePreparedGlobalRouting = false,
  skipBoundedAttempt = false,
  skipFinalizedReuse = false,
  createPreDisplayFinalEdges,
}: BaseReactFlowDisplayEdgesArgs & {
  createPreDisplayFinalEdges?: BaseReactFlowPreDisplayFinalEdgesFactory;
}): BaseReactFlowFullRouteSeedResult => {
  const inputSignature = computeBaseDisplayInputSignature({
    nodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  if (!skipFinalizedReuse && isBaseDisplayFinalized(edges, inputSignature)) {
    return { kind: 'finalized', edges };
  }

  let preparedBoundedEdges: Edge[] | null = null;
  if (
    createPreDisplayFinalEdges
    && !skipBoundedAttempt
    && !isLargeGraph
    && edges.length > 24
    && edges.length <= 80
  ) {
    let boundedReport: BaseDisplayBoundedCandidateReport | undefined;
    const boundedFinal = createPreDisplayFinalEdges({
      edges,
      nodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      displayEdgeEpoch,
      skipFullRouteFallback: true,
      onBoundedCandidate: (report) => {
        boundedReport = report;
      },
    });
    const boundedHardClean = boundedReport?.hardClean ?? displayHardQualityGatesAreClean(
      boundedFinal,
      withDisplayAbsolutePositions(nodes, new Map(nodes.map((node) => [node.id, node]))),
    );
    if (boundedHardClean) {
      return {
        kind: 'finalized',
        edges: markBaseDisplayFinalized(boundedFinal, inputSignature),
      };
    }
    preparedBoundedEdges = boundedFinal;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const repairNodes = withDisplayAbsolutePositions(nodes, nodeById);
  // Keep the prepared seed paired with normalized routes through render finalization;
  // otherwise raw locked paths can overwrite obstacle-safe pre-display output.
  const routeSeedEdges = selectBaseReactFlowFullRouteSeedEdges(edges, preparedBoundedEdges);
  const normalizedEdges = routeSeedEdges
    .map((rawEdge) => normalizeBaseEdge({ edge: rawEdge, nodeById, displayEdgeEpoch }))
    .map((edge) => synthesizeStableFallbackPath({ edge, nodeById }));
  const layoutDirection = String((normalizedEdges[0]?.data as any)?.layoutDirection || 'TB');
  const qualityBudget = resolveDisplayQualityBudget(normalizedEdges, repairNodes, isLargeGraph);
  const useBoundedLargeRepair = qualityBudget.mode === 'bounded'
    && (normalizedEdges.length > 24 || repairNodes.length > 36);

  if (qualityBudget.mode === 'fast') {
    return {
      kind: 'finalized',
      edges: finalizeDisplayEdgesForRenderMode({
        finalQualityEdges: createFastDisplayQualityEdges(normalizedEdges, repairNodes),
        rawEdges: routeSeedEdges,
        repairNodes,
        renderNodes: nodes,
        enableSmartEdges,
        smartEdgePadding,
        isLargeGraph,
        layoutDirection,
        inputSignature,
        qualityBudget,
      }),
    };
  }

  const canReusePreparedGlobalRouting = reusePreparedGlobalRouting
    || preparedBoundedEdges !== null
    || (skipBoundedAttempt && (normalizedEdges.length > 24 || repairNodes.length > 40));

  return {
    kind: 'continue',
    context: {
      inputSignature,
      routeSeedEdges,
      normalizedEdges,
      repairNodes,
      renderNodes: nodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      layoutDirection,
      qualityBudget,
      useBoundedLargeRepair,
      canReusePreparedGlobalRouting,
      reusePreparedGlobalRouting,
    },
  };
};
