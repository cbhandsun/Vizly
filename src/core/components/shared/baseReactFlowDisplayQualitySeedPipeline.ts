import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import {
  repairEndpointLaneCrossings,
  type EndpointLaneRepairMetrics,
} from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { repairLocalDoglegArtifacts } from '../../strategies/shared/edgeLocalDoglegRepair';
import {
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
} from '../../strategies/shared/edgeRoutingPipeline';
import { buildQualityInputSnapshot } from '../../strategies/shared/edgePathQualityInputSnapshot';
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
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseName,
  type DisplayRoutingPhaseMetrics,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

type QualitySeedCandidateChooser<T extends Edge[]> = (...candidates: T[]) => T;

export const chooseDistinctQualitySeedCandidate = <T extends Edge[]>(
  candidates: readonly T[],
  choose: QualitySeedCandidateChooser<T>,
): T => {
  const seenSignatures = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    const signature = buildQualityInputSnapshot(candidate).signature;
    if (seenSignatures.has(signature)) return false;
    seenSignatures.add(signature);
    return true;
  });
  return choose(...uniqueCandidates);
};

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

  return chooseDistinctQualitySeedCandidate([
    normalizedEdges,
    endpointEdges,
    trunkEdges,
    localEdges,
    detachedEdges,
    endpointDetachedEdges,
    targetEntryEdges,
    strictBypassEdges,
  ], chooseFewestStrictCrossings);
};

const INTERACTIVE_DETACHED_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 1,
  maxHitBudget: 3,
  maxQualityEvaluations: 96,
  maxResidualPasses: 1,
  qualityOnly: true,
};

const DEFERRED_GLOBAL_CANDIDATE_EDGE_THRESHOLD = 24;
const DEFERRED_GLOBAL_CANDIDATE_EDGE_BUDGET = 12;

const runInteractiveSeedPhase = (
  phase: DisplayRoutingPhaseName,
  edges: Edge[],
  transform: (candidate: Edge[]) => Edge[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
  readMetrics?: () => DisplayRoutingPhaseMetrics,
): Edge[] => {
  const timer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase,
        candidateCount: edges.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const result = transform(edges);
  const changedEdgeCount = countChangedRoutingItems(edges, result);
  timer?.finish(
    changedEdgeCount === 0 ? 'skip' : 'accepted',
    changedEdgeCount,
    readMetrics?.(),
  );
  return result;
};

export const getInteractiveGlobalCandidateEdgeBudget = (
  edgeCount: number,
  deferOuterObstacleRepair: boolean,
): number | undefined => (
  deferOuterObstacleRepair && edgeCount > DEFERRED_GLOBAL_CANDIDATE_EDGE_THRESHOLD
    ? DEFERRED_GLOBAL_CANDIDATE_EDGE_BUDGET
    : undefined
);

const createInteractiveDisplayQualityEdges = (
  normalizedEdges: Edge[],
  repairNodes: Node[],
  layoutDirection: string,
  maxGlobalCandidateEdges?: number,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): Edge[] => {
  const endpointEdges = runInteractiveSeedPhase(
    'seed-interactive-endpoint-seed',
    normalizedEdges,
    candidate => repairEndpointOrthogonalPaths(candidate, repairNodes),
    onPhaseTrace,
  );
  const sharedTargetEdges = runInteractiveSeedPhase(
    'seed-interactive-trunk-seed',
    endpointEdges,
    candidate => synthesizeSharedEndpointTrunks(candidate, { nodes: repairNodes }),
    onPhaseTrace,
  );
  const localEdges = runInteractiveSeedPhase(
    'seed-interactive-local-seed',
    sharedTargetEdges,
    candidate => repairLocalDoglegArtifacts(candidate, repairNodes),
    onPhaseTrace,
  );
  const strictAwareEdges = runInteractiveSeedPhase(
    'seed-interactive-crossing-repair',
    localEdges,
    candidate => repairEndpointOrthogonalPaths(
      repairSharedTrunkAwareCrossings(candidate, repairNodes),
      repairNodes,
    ),
    onPhaseTrace,
  );
  let endpointLaneMetrics: EndpointLaneRepairMetrics = {
    candidateCount: 0,
    evaluationCount: 0,
    scannedSegmentCount: 0,
  };
  const endpointLaneEdges = runInteractiveSeedPhase(
    'seed-interactive-lane-repair',
    strictAwareEdges,
    candidate => repairEndpointLaneCrossings(candidate, repairNodes, {
      onMetrics: metrics => { endpointLaneMetrics = metrics; },
    }),
    onPhaseTrace,
    () => endpointLaneMetrics,
  );
  const globalEdges = runInteractiveSeedPhase(
    'seed-interactive-global-route',
    endpointLaneEdges,
    candidate => repairEndpointOrthogonalPaths(
      reduceEdgeCrossingsWithWaypoints(candidate, repairNodes, layoutDirection, {
        onlyNodeRiskEdges: true,
        maxCandidateEdges: maxGlobalCandidateEdges,
      }),
      repairNodes,
    ),
    onPhaseTrace,
  );
  const localPolishedEdges = runInteractiveSeedPhase(
    'seed-interactive-local-polish',
    globalEdges,
    candidate => repairLocalDoglegArtifacts(candidate, repairNodes),
    onPhaseTrace,
  );
  const detachedEdges = runInteractiveSeedPhase(
    'seed-interactive-detached-repair',
    localPolishedEdges,
    candidate => separateDetachedParallelOverlaps(
      candidate,
      repairNodes,
      16,
      INTERACTIVE_DETACHED_OVERLAP_REPAIR_OPTIONS,
    ),
    onPhaseTrace,
  );
  const endpointDetachedEdges = runInteractiveSeedPhase(
    'seed-interactive-endpoint-final',
    detachedEdges,
    candidate => repairEndpointOrthogonalPaths(candidate, repairNodes),
    onPhaseTrace,
  );

  return chooseDistinctQualitySeedCandidate([
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
  ], chooseFewestStrictCrossings);
};

export const createBaseReactFlowInteractiveDisplayEdges = ({
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
  deferOuterObstacleRepair = false,
  onPhaseTrace,
}: {
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  deferOuterObstacleRepair?: boolean;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): Edge[] => {
  const inputSignature = computeBaseDisplayInputSignature({
    nodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  if (isBaseDisplayFinalized(edges, inputSignature)) return edges;

  const normalizeTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-normalize',
        candidateCount: edges.length,
        onTrace: onPhaseTrace,
      })
    : null;
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
  normalizeTimer?.finish(
    normalizedEdges === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, normalizedEdges),
    { scannedNodeCount: nodes.length },
  );
  const interactiveEdges = createInteractiveDisplayQualityEdges(
    normalizedEdges,
    repairNodes,
    layoutDirection,
    getInteractiveGlobalCandidateEdgeBudget(
      normalizedEdges.length,
      deferOuterObstacleRepair,
    ),
    onPhaseTrace,
  );

  const finishTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-finish',
        candidateCount: interactiveEdges.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const finishedEdges = finishInteractiveDisplayEdgesForRenderMode({
    finalQualityEdges: interactiveEdges,
    rawEdges: edges,
    enableSmartEdges,
    smartEdgePadding,
    layoutDirection,
    repairNodes,
    inputSignature,
    deferOuterObstacleRepair,
    onPhaseTrace,
  });
  const finishChangedEdgeCount = countChangedRoutingItems(interactiveEdges, finishedEdges);
  finishTimer?.finish(
    finishChangedEdgeCount === 0 ? 'skip' : 'accepted',
    finishChangedEdgeCount,
  );
  return finishedEdges;
};
