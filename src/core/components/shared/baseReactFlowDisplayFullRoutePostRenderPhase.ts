import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  createDisplayMicroCleanupDiagnostics,
  displayMicroCleanupSafetyDoesNotRegress,
  repairDisplayMicroArtifacts,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  calculateEdgePathQualityScore,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { markBaseDisplayFinalized } from './baseReactFlowDisplayEdgeCore';
import {
  finishDisplaySoftQuality,
} from './baseReactFlowDisplayObstacleRepair';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  repairResidualDisplayOverlaps,
} from './baseReactFlowDisplayOverlapRepair';
import {
  chooseFinalObstacleAwarePolishCandidate,
  hasHardDisplayOverlapRisk,
  keepPerEdgeObstacleNonRegressingCandidates,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayFinalEndpointOrder';
import {
  commitDisplayEdgesForRenderMode,
  finalizeDisplayEdgesForRenderMode,
} from './baseReactFlowDisplayRenderPipeline';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import {
  createDisplayRoutingDefectStagePlan,
  createDisplayRoutingDefectPlan,
  displayRoutingDefectStageIsScheduled,
  displayRoutingQualityNeedsMicroRepair,
  displayRoutingQualityNeedsTerminalRepair,
} from './baseReactFlowDisplayRoutingDefectPlan';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import { repairTerminalEndpointStrictCrossingStubs } from './baseReactFlowDisplayStrictTerminalRepair';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';

type PostRenderPoint = { x: number; y: number };

type PostRenderSegment = {
  edgeIndex: number;
  segmentIndex: number;
  a: PostRenderPoint;
  b: PostRenderPoint;
  horizontal: boolean;
  vertical: boolean;
};

const POST_RENDER_EPS = 1;
const POST_RENDER_NEAR_PARALLEL_EPS = 2;
const POST_RENDER_PARALLEL_OVERLAP_MIN = 24;
const POST_RENDER_LANE_OFFSETS = [24, -24, 40, -40] as const;
const POST_RENDER_NEAR_ORTHOGONAL_EPS = 4;

const readPostRenderPath = (edge: Edge): PostRenderPoint[] => {
  const path = (edge.data as { computedPath?: unknown } | undefined)?.computedPath;
  if (!Array.isArray(path)) return [];
  return path.flatMap(point => {
    if (!point || typeof point !== 'object') return [];
    const candidate = point as { x?: unknown; y?: unknown };
    return typeof candidate.x === 'number' && Number.isFinite(candidate.x)
      && typeof candidate.y === 'number' && Number.isFinite(candidate.y)
      ? [{ x: candidate.x, y: candidate.y }]
      : [];
  });
};

const compactPostRenderPath = (path: PostRenderPoint[]): PostRenderPoint[] => {
  const compacted: PostRenderPoint[] = [];
  for (const point of path) {
    const previous = compacted.at(-1);
    if (previous && Math.abs(previous.x - point.x) <= POST_RENDER_EPS
      && Math.abs(previous.y - point.y) <= POST_RENDER_EPS) continue;
    compacted.push(point);
  }
  return compacted;
};

const withPostRenderPath = (edge: Edge, path: PostRenderPoint[]): Edge => ({
  ...edge,
  data: {
    ...(edge.data || {}),
    computedPath: compactPostRenderPath(path),
  },
});

const postRenderSegments = (edges: Edge[]): PostRenderSegment[] => edges.flatMap((edge, edgeIndex) => {
  const path = readPostRenderPath(edge);
  const segments: PostRenderSegment[] = [];
  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    const a = path[segmentIndex];
    const b = path[segmentIndex + 1];
    const horizontal = Math.abs(a.y - b.y) <= POST_RENDER_EPS
      && Math.abs(a.x - b.x) > POST_RENDER_EPS;
    const vertical = Math.abs(a.x - b.x) <= POST_RENDER_EPS
      && Math.abs(a.y - b.y) > POST_RENDER_EPS;
    if (horizontal || vertical) {
      segments.push({ edgeIndex, segmentIndex, a, b, horizontal, vertical });
    }
  }
  return segments;
});

const postRenderParallelOverlapLength = (
  first: PostRenderSegment,
  second: PostRenderSegment,
): number => {
  if (first.horizontal !== second.horizontal || first.vertical !== second.vertical) return 0;
  if (first.horizontal && Math.abs(first.a.y - second.a.y) > POST_RENDER_NEAR_PARALLEL_EPS) return 0;
  if (first.vertical && Math.abs(first.a.x - second.a.x) > POST_RENDER_NEAR_PARALLEL_EPS) return 0;
  return first.horizontal
    ? Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
      - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x))
    : Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
      - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y));
};

const pointsAlmostEqual = (first: PostRenderPoint, second: PostRenderPoint): boolean => (
  Math.abs(first.x - second.x) <= POST_RENDER_EPS
  && Math.abs(first.y - second.y) <= POST_RENDER_EPS
);

const isProtectedPostRenderSharedStem = (
  edges: Edge[],
  first: PostRenderSegment,
  second: PostRenderSegment,
): boolean => {
  const firstEdge = edges[first.edgeIndex];
  const secondEdge = edges[second.edgeIndex];
  if (!firstEdge || !secondEdge) return false;
  if (firstEdge.source === secondEdge.source && first.segmentIndex === 0 && second.segmentIndex === 0) {
    return pointsAlmostEqual(first.a, second.a)
      && postRenderParallelOverlapLength(first, second) > 0;
  }
  const firstPath = readPostRenderPath(firstEdge);
  const secondPath = readPostRenderPath(secondEdge);
  if (
    firstEdge.target === secondEdge.target
    && first.segmentIndex === firstPath.length - 2
    && second.segmentIndex === secondPath.length - 2
  ) {
    return pointsAlmostEqual(first.b, second.b)
      && postRenderParallelOverlapLength(first, second) > 0;
  }
  return false;
};

const postRenderNearParallelOverlapScore = (edges: Edge[]): number => {
  const segments = postRenderSegments(edges);
  let score = 0;
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      const overlap = postRenderParallelOverlapLength(first, second);
      if (
        overlap >= POST_RENDER_PARALLEL_OVERLAP_MIN
        && !isProtectedPostRenderSharedStem(edges, first, second)
      ) {
        score += overlap;
      }
    }
  }
  return score;
};

const shiftPostRenderSegmentLane = (
  edge: Edge,
  segmentIndex: number,
  horizontal: boolean,
  offset: number,
): Edge | null => {
  const path = readPostRenderPath(edge);
  if (segmentIndex < 0 || segmentIndex >= path.length - 1) return null;
  const nextPath = path.map(point => ({ ...point }));
  if (horizontal) {
    nextPath[segmentIndex].y += offset;
    nextPath[segmentIndex + 1].y += offset;
  } else {
    nextPath[segmentIndex].x += offset;
    nextPath[segmentIndex + 1].x += offset;
  }
  return withPostRenderPath(edge, nextPath);
};

export const repairPostRenderEndpointOrthogonalPaths = (
  edges: Edge[],
  _nodes: readonly ReactFlowNode[],
  _isHardClean: (candidate: Edge[]) => boolean,
): Edge[] => {
  const candidate = edges.map(edge => {
    const path = readPostRenderPath(edge);
    if (path.length < 2) return edge;
    let changed = false;
    const nextPath = path.map(point => ({ ...point }));
    for (let index = 0; index < nextPath.length - 1; index += 1) {
      const current = nextPath[index];
      const next = nextPath[index + 1];
      const dx = Math.abs(current.x - next.x);
      const dy = Math.abs(current.y - next.y);
      if (
        dx > 0
        && dx <= POST_RENDER_NEAR_ORTHOGONAL_EPS
        && dy > POST_RENDER_NEAR_ORTHOGONAL_EPS
      ) {
        next.x = current.x;
        changed = true;
      } else if (
        dy > 0
        && dy <= POST_RENDER_NEAR_ORTHOGONAL_EPS
        && dx > POST_RENDER_NEAR_ORTHOGONAL_EPS
      ) {
        next.y = current.y;
        changed = true;
      }
    }
    return changed ? withPostRenderPath(edge, nextPath) : edge;
  });
  return computeBaseReactFlowDisplayOutputRouteSignature(candidate)
      === computeBaseReactFlowDisplayOutputRouteSignature(edges)
    ? edges
    : candidate;
};

export const repairPostRenderNearParallelOverlaps = (
  edges: Edge[],
  isHardClean: (candidate: Edge[]) => boolean,
): Edge[] => {
  let bestEdges = edges;
  let bestScore = postRenderNearParallelOverlapScore(edges);
  if (bestScore < POST_RENDER_PARALLEL_OVERLAP_MIN) return edges;
  const segments = postRenderSegments(edges);
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      const overlap = postRenderParallelOverlapLength(first, second);
      if (
        overlap < POST_RENDER_PARALLEL_OVERLAP_MIN
        || isProtectedPostRenderSharedStem(edges, first, second)
      ) continue;
      for (const moved of [second, first]) {
        for (const offset of POST_RENDER_LANE_OFFSETS) {
          const movedEdge = shiftPostRenderSegmentLane(
            edges[moved.edgeIndex],
            moved.segmentIndex,
            moved.horizontal,
            offset,
          );
          if (!movedEdge) continue;
          const candidate = edges.map((edge, index) => (
            index === moved.edgeIndex ? movedEdge : edge
          ));
          if (!isHardClean(candidate)) continue;
          const score = postRenderNearParallelOverlapScore(candidate);
          if (score < bestScore) {
            bestEdges = candidate;
            bestScore = score;
            if (bestScore < POST_RENDER_PARALLEL_OVERLAP_MIN) return bestEdges;
          }
        }
      }
    }
  }
  return bestEdges;
};

export type BaseReactFlowFullRoutePostRenderResult =
  | { kind: 'finalized'; edges: Edge[] }
  | {
      kind: 'continue';
      edges: Edge[];
      quality: EdgePathQualityScore;
      skipInitialStrictOverlapRepair: boolean;
    };

export const shouldDeferFullRenderPolishForStrictTrunkClosure = (
  edges: Edge[],
  nodes: BaseReactFlowFullRouteContext['repairNodes'],
  qualityReport: BaseDisplayBoundedCandidateReport,
): boolean => (
  // Small hard-overlap routes are handed to the dedicated overlap/strict
  // closure below. Full render polish cannot close those defects atomically
  // and is otherwise commonly computed only to be rejected by the hard gate.
  (edges.length <= 24 && hasHardDisplayOverlapRisk(qualityReport.quality))
  || (
    qualityReport.quality.strictCrossings > 0
    && auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks.length > 0
  )
);

export const shouldUseBoundedPostRenderResidualRepair = (
  useBoundedLargeRepair: boolean,
  mustCloseHardOverlapFirst: boolean,
): boolean => useBoundedLargeRepair || mustCloseHardOverlapFirst;

export const runBaseReactFlowFullRoutePostRenderPhase = (
  context: BaseReactFlowFullRouteContext,
  finalQualityEdges: Edge[],
  qualityReport: BaseDisplayBoundedCandidateReport,
): BaseReactFlowFullRoutePostRenderResult => {
  const {
    routeSeedEdges,
    repairNodes,
    renderNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    layoutDirection,
    inputSignature,
    qualityBudget,
    useBoundedLargeRepair,
    onPhaseTrace,
  } = context;
  if (qualityReport.hardClean) {
    const directCommitTimer = startDisplayRoutingPhaseTrace({
      phase: 'post-render-finalize',
      candidateCount: finalQualityEdges.length,
      onTrace: onPhaseTrace,
    });
    const committedEdges = commitDisplayEdgesForRenderMode({
      finalQualityEdges,
      rawEdges: routeSeedEdges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      inputSignature,
      nodes: renderNodes,
    });
    const orthogonalCommittedEdges = repairPostRenderEndpointOrthogonalPaths(
      committedEdges,
      renderNodes,
      candidate => context.evaluationSession.hardReport(candidate).hardClean,
    );
    const visuallySeparatedEdges = repairPostRenderNearParallelOverlaps(
      orthogonalCommittedEdges,
      candidate => context.evaluationSession.hardReport(candidate).hardClean,
    );
    directCommitTimer.finish(
      visuallySeparatedEdges === committedEdges ? 'skip' : 'accepted',
      visuallySeparatedEdges === committedEdges ? 0 : visuallySeparatedEdges.length,
    );
    startDisplayRoutingPhaseTrace({
      phase: 'post-render-soft-closure',
      candidateCount: committedEdges.length,
      onTrace: onPhaseTrace,
    }).finish('skip');
    return { kind: 'finalized', edges: visuallySeparatedEdges };
  }
  const finalizeTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-finalize',
    candidateCount: finalQualityEdges.length,
    onTrace: onPhaseTrace,
  });
  const deferFullRenderPolish = shouldDeferFullRenderPolishForStrictTrunkClosure(
    finalQualityEdges,
    repairNodes,
    qualityReport,
  );
  const finalizedEdges = deferFullRenderPolish
    ? finalQualityEdges
    : (() => {
      const rawFinalizedEdges = finalizeDisplayEdgesForRenderMode({
        finalQualityEdges,
        rawEdges: routeSeedEdges,
        repairNodes,
        renderNodes,
        enableSmartEdges,
        smartEdgePadding,
        isLargeGraph,
        layoutDirection,
        inputSignature,
        qualityBudget,
      });
      const obstacleSafeFinalizedEdges = keepPerEdgeObstacleNonRegressingCandidates(
        finalQualityEdges,
        rawFinalizedEdges,
        repairNodes,
      );
      const selectedFinalizedEdges = chooseFinalObstacleAwarePolishCandidate(
        repairNodes,
        finalQualityEdges,
        obstacleSafeFinalizedEdges,
        rawFinalizedEdges,
      );
      return finalSameSideTrueTrunksDoNotRegress(
        finalQualityEdges,
        selectedFinalizedEdges,
        repairNodes,
      )
        ? selectedFinalizedEdges
        : finalQualityEdges;
    })();
  finalizeTimer.finish(
    deferFullRenderPolish
      ? 'fallback'
      : finalizedEdges === finalQualityEdges ? 'skip' : 'accepted',
    finalizedEdges === finalQualityEdges ? 0 : finalizedEdges.length,
  );
  const softClosureTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-soft-closure',
    candidateCount: finalizedEdges.length,
    onTrace: onPhaseTrace,
  });
  const softClosurePhaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordSoftClosurePhaseTrace = onPhaseTrace
    ? (trace: DisplayRoutingPhaseTrace) => softClosurePhaseTrace.push(trace)
    : undefined;
  const microTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-micro',
    candidateCount: finalizedEdges.length,
    onTrace: recordSoftClosurePhaseTrace,
  });
  const finalizedQuality = calculateEdgePathQualityScore(finalizedEdges);
  const needsPostFinalizeMicroRepair = displayRoutingQualityNeedsMicroRepair(
    finalizedQuality,
  ) || displayRoutingQualityNeedsTerminalRepair(finalizedQuality);
  const postFinalizeMicroDiagnostics = createDisplayMicroCleanupDiagnostics();
  const postFinalizeMicroCleaned = needsPostFinalizeMicroRepair
    ? (() => {
      const microSafetyContext = createBaseReactFlowDisplayMicroSafetyContext(
        finalizedEdges,
        repairNodes,
      );
      const candidate = repairDisplayMicroArtifacts(
        finalizedEdges,
        microSafetyContext,
        postFinalizeMicroDiagnostics,
        { allowCompoundRepairs: false },
      );
      return displayMicroCleanupSafetyDoesNotRegress(
        microSafetyContext.baseline,
        microSafetyContext.evaluate(candidate),
      )
        ? candidate
        : finalizedEdges;
    })()
    : finalizedEdges;
  const postFinalizeResidualCleaned = postFinalizeMicroCleaned;
  const postFinalizeQuality = postFinalizeResidualCleaned === finalizedEdges
    ? finalizedQuality
    : calculateEdgePathQualityScore(postFinalizeResidualCleaned);
  microTimer.finish(
    postFinalizeResidualCleaned === finalizedEdges ? 'skip' : 'accepted',
    postFinalizeResidualCleaned === finalizedEdges ? 0 : postFinalizeResidualCleaned.length,
    {
      candidateCount: postFinalizeMicroDiagnostics.generatedCandidateCount,
      evaluationCount: postFinalizeMicroDiagnostics.evaluatedCandidateCount,
      cacheHitCount: postFinalizeMicroDiagnostics.cacheHitCount
        + postFinalizeMicroDiagnostics.pairCacheHitCount,
      scannedEdgePairCount: postFinalizeMicroDiagnostics.scannedEdgePairCount,
      scannedSegmentCount: postFinalizeMicroDiagnostics.scannedSegmentCount,
    },
  );
  // Soft obstacle/visual search is costly and cannot close strict overlap
  // defects atomically. Let the dedicated bounded overlap/strict phases close
  // those defects first instead of spending seconds on a candidate that the
  // hard gate must reject.
  const mustCloseHardOverlapFirst = hasHardDisplayOverlapRisk(postFinalizeQuality);
  const softQualityTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-soft-quality',
    candidateCount: postFinalizeResidualCleaned.length,
    onTrace: recordSoftClosurePhaseTrace,
  });
  const postFinalizeObstacleCleaned = (finalizedEdges.length <= 24 && mustCloseHardOverlapFirst)
    || (isLargeGraph && qualityBudget.mode === 'fast')
    ? postFinalizeResidualCleaned
    : finishDisplaySoftQuality(
      postFinalizeResidualCleaned,
      repairNodes,
      layoutDirection,
      qualityBudget.finalSoft,
      recordSoftClosurePhaseTrace,
    );
  softQualityTimer.finish(
    postFinalizeObstacleCleaned === postFinalizeResidualCleaned ? 'skip' : 'accepted',
    postFinalizeObstacleCleaned === postFinalizeResidualCleaned
      ? 0
      : postFinalizeObstacleCleaned.length,
  );
  const postFinalizeObstacleQuality = calculateEdgePathQualityScore(postFinalizeObstacleCleaned);
  const postRenderStagePlan = createDisplayRoutingDefectStagePlan(
    postFinalizeObstacleQuality,
  );
  const residualScheduled = displayRoutingDefectStageIsScheduled(
    postRenderStagePlan,
    'post-render-residual',
  );
  const residualTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-residual',
    candidateCount: residualScheduled ? postFinalizeObstacleCleaned.length : 0,
    onTrace: recordSoftClosurePhaseTrace,
  });
  const useBoundedPostRenderResidualRepair = shouldUseBoundedPostRenderResidualRepair(
    useBoundedLargeRepair,
    mustCloseHardOverlapFirst,
  );
  const preResidualOutputSignature = recordSoftClosurePhaseTrace
    ? computeBaseReactFlowDisplayOutputRouteSignature(postFinalizeObstacleCleaned)
    : null;
  const finalPostSoftResidualCleaned = residualScheduled
    ? repairResidualDisplayOverlaps(
      postFinalizeObstacleCleaned,
      repairNodes,
      useBoundedPostRenderResidualRepair
        ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
      useBoundedPostRenderResidualRepair
        ? DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
      {
        parentPhase: 'post-render-residual',
        onPhaseTrace: recordSoftClosurePhaseTrace,
      },
    )
    : postFinalizeObstacleCleaned;
  const postResidualOutputSignature = recordSoftClosurePhaseTrace
    ? computeBaseReactFlowDisplayOutputRouteSignature(finalPostSoftResidualCleaned)
    : null;
  const residualGeometryChanged = finalPostSoftResidualCleaned !== postFinalizeObstacleCleaned
    || (
      preResidualOutputSignature !== null
      && postResidualOutputSignature !== null
      && preResidualOutputSignature !== postResidualOutputSignature
    );
  residualTimer.finish(
    residualGeometryChanged ? 'accepted' : 'skip',
    residualGeometryChanged ? finalPostSoftResidualCleaned.length : 0,
    residualScheduled ? undefined : {
      evaluationCount: 0,
      cacheHitCount: 0,
      scannedNodeCount: 0,
      scannedSegmentCount: 0,
      scannedEdgePairCount: 0,
    },
  );
  const terminalGateTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-terminal-gate',
    candidateCount: finalPostSoftResidualCleaned.length,
    onTrace: recordSoftClosurePhaseTrace,
  });
  const finalPostSoftQuality = calculateEdgePathQualityScore(finalPostSoftResidualCleaned);
  const terminalDefectPlan = createDisplayRoutingDefectPlan(
    context.evaluationSession.hardReport(finalPostSoftResidualCleaned),
  );
  const earlyTerminalStrictCandidate = terminalDefectPlan.needsStrictCrossingRepair
    ? repairTerminalEndpointStrictCrossingStubs(finalPostSoftResidualCleaned, repairNodes)
    : finalPostSoftResidualCleaned;
  const earlyTerminalReadableCandidate = terminalDefectPlan.needsTerminalRepair
    ? repairTerminalBoundaryStairs(earlyTerminalStrictCandidate, repairNodes)
    : earlyTerminalStrictCandidate;
  const earlyTerminalHairpinCandidate = terminalDefectPlan.needsMicroRepair
    ? repairResidualHairpinBridges(earlyTerminalReadableCandidate, repairNodes)
    : earlyTerminalReadableCandidate;
  if (context.evaluationSession.hardReport(earlyTerminalHairpinCandidate).hardClean) {
    terminalGateTimer.finish('accepted', earlyTerminalHairpinCandidate.length);
    softClosureTimer.finish('accepted', earlyTerminalHairpinCandidate.length);
    softClosurePhaseTrace.forEach(trace => onPhaseTrace?.(trace));
    return {
      kind: 'finalized',
      edges: markBaseDisplayFinalized(earlyTerminalHairpinCandidate, inputSignature),
    };
  }
  terminalGateTimer.finish('fallback');
  softClosureTimer.finish('fallback');
  softClosurePhaseTrace.forEach(trace => onPhaseTrace?.(trace));
  return {
    kind: 'continue',
    edges: finalPostSoftResidualCleaned,
    quality: finalPostSoftQuality,
    skipInitialStrictOverlapRepair: mustCloseHardOverlapFirst
      && finalPostSoftResidualCleaned === postFinalizeObstacleCleaned,
  };
};
