import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { repairLocalDoglegArtifacts } from '../../strategies/shared/edgeLocalDoglegRepair';
import {
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
} from '../../strategies/shared/edgeRoutingPipeline';
import {
  chooseFewestStrictCrossings,
  countStrictEdgeCrossings,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  repairSharedTargetEntryCrossings,
  synthesizeSharedEndpointTrunks,
} from '../../strategies/shared/edgeSharedTrunkSynthesis';
import {
  computeBaseDisplayInputSignature,
  isBaseDisplayFinalized,
  normalizeBaseEdge,
  synthesizeStableFallbackPath,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { repairStrictBypassesIfNeeded } from './baseReactFlowDisplayObstacleRepair';
import { DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepair';
import { finishInteractiveDisplayEdgesForRenderMode } from './baseReactFlowDisplayRenderPipeline';

export const createFastDisplayQualityEdges = (
  normalizedEdges: Edge[],
  repairNodes: Node[],
): Edge[] => {
  const endpointEdges = repairEndpointOrthogonalPaths(normalizedEdges, repairNodes);
  const trunkEdges = synthesizeSharedEndpointTrunks(endpointEdges, { nodes: repairNodes });
  const localEdges = repairLocalDoglegArtifacts(trunkEdges, repairNodes);
  const detachedEdges = separateDetachedParallelOverlaps(
    localEdges,
    repairNodes,
    16,
    DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  const endpointDetachedEdges = repairEndpointOrthogonalPaths(detachedEdges, repairNodes);
  const targetEntryEdges = repairSharedTargetEntryCrossings(endpointDetachedEdges);
  const strictBypassEdges = countStrictEdgeCrossings(targetEntryEdges) === 0
    ? targetEntryEdges
    : repairEndpointOrthogonalPaths(repairStrictBypassesIfNeeded(targetEntryEdges, repairNodes), repairNodes);

  return chooseFewestStrictCrossings(
    normalizedEdges,
    endpointEdges,
    trunkEdges,
    localEdges,
    detachedEdges,
    endpointDetachedEdges,
    targetEntryEdges,
    strictBypassEdges,
  );
};

const INTERACTIVE_DETACHED_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 1,
  maxHitBudget: 3,
  maxQualityEvaluations: 96,
  maxResidualPasses: 1,
  qualityOnly: true,
};

const createInteractiveDisplayQualityEdges = (
  normalizedEdges: Edge[],
  repairNodes: Node[],
  layoutDirection: string,
): Edge[] => {
  const endpointEdges = repairEndpointOrthogonalPaths(normalizedEdges, repairNodes);
  const sharedTargetEdges = synthesizeSharedEndpointTrunks(endpointEdges, { nodes: repairNodes });
  const localEdges = repairLocalDoglegArtifacts(sharedTargetEdges, repairNodes);
  const strictAwareEdges = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(localEdges, repairNodes),
    repairNodes,
  );
  const endpointLaneEdges = repairEndpointLaneCrossings(strictAwareEdges, repairNodes);
  const globalEdges = repairEndpointOrthogonalPaths(
    reduceEdgeCrossingsWithWaypoints(endpointLaneEdges, repairNodes, layoutDirection, {
      onlyNodeRiskEdges: true,
    }),
    repairNodes,
  );
  const localPolishedEdges = repairLocalDoglegArtifacts(globalEdges, repairNodes);
  const detachedEdges = separateDetachedParallelOverlaps(
    localPolishedEdges,
    repairNodes,
    16,
    INTERACTIVE_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  const endpointDetachedEdges = repairEndpointOrthogonalPaths(detachedEdges, repairNodes);

  return chooseFewestStrictCrossings(
    normalizedEdges,
    endpointEdges,
    sharedTargetEdges,
    localEdges,
    strictAwareEdges,
    endpointLaneEdges,
    globalEdges,
    localPolishedEdges,
    detachedEdges,
    endpointDetachedEdges,
  );
};

export const createBaseReactFlowInteractiveDisplayEdges = ({
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
  deferOuterObstacleRepair = false,
}: {
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  deferOuterObstacleRepair?: boolean;
}): Edge[] => {
  const inputSignature = computeBaseDisplayInputSignature({
    nodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  if (isBaseDisplayFinalized(edges, inputSignature)) return edges;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const repairNodes = withDisplayAbsolutePositions(nodes, nodeById);
  const normalizedEdges = compactDisplayEdgePaths(
    edges.map((rawEdge) => normalizeBaseEdge({
      edge: rawEdge,
      nodeById,
      displayEdgeEpoch,
    })).map((edge) => synthesizeStableFallbackPath({ edge, nodeById })),
  );
  const layoutDirection = typeof normalizedEdges[0]?.data?.layoutDirection === 'string'
    ? normalizedEdges[0].data.layoutDirection
    : 'TB';
  const interactiveEdges = createInteractiveDisplayQualityEdges(
    normalizedEdges,
    repairNodes,
    layoutDirection,
  );

  return finishInteractiveDisplayEdgesForRenderMode({
    finalQualityEdges: interactiveEdges,
    rawEdges: edges,
    enableSmartEdges,
    smartEdgePadding,
    layoutDirection,
    repairNodes,
    inputSignature,
    deferOuterObstacleRepair,
  });
};
