import type { Edge } from '@xyflow/react';

import {
  createBaseReactFlowFullRouteEdges,
  type BaseReactFlowDisplayEdgesArgs,
} from './baseReactFlowDisplayFullRoutePipeline';
import {
  computeBaseDisplayInputSignature,
  isBaseDisplayFinalized,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';
import {
  createBaseReactFlowDisplayExactReport,
  finalizeBaseReactFlowDisplayEdges,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';
import {
  chooseFinalObstacleAwarePolishCandidate,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import {
  repairBaseReactFlowFinalCommercialDetours,
  repairBaseReactFlowFinalEndpointOrder,
} from './baseReactFlowDisplayFinalEndpointOrder';
import { startDisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import { repairCrossedSpineWithOuterSkirt } from './baseReactFlowDisplayCrossedSpineSkirtRepair';
import { repairBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyClosure';
import { commitDisplayEdgesForRenderMode } from './baseReactFlowDisplayRenderPipeline';
import { repairOppositeHemisphereTerminalBacktracks } from '../../strategies/shared/edgeSharedTrunkSynthesis';
import { repairBoundedReverseParallelOverlaps } from './baseReactFlowDisplayReverseParallelOverlapClosure';
import { repairResidualOppositeInteriorLaneOverlaps } from './baseReactFlowDisplayReverseParallelRepair';
import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepair';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';

export type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
export { repairBoundedReverseParallelOverlaps } from './baseReactFlowDisplayReverseParallelOverlapClosure';
export {
  baseReactFlowDisplayHardQualityIsClean,
  computeBaseReactFlowDisplayEdgeEpoch,
} from './baseReactFlowDisplayQualityGates';
export { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
export {
  repairBaseReactFlowMeasuredDisplayEdges,
  repairBaseReactFlowMeasuredDisplayEdgesWithReport,
} from './baseReactFlowDisplayMeasuredRepair';
export { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';

export const createBaseReactFlowDisplayEdges = (
  args: BaseReactFlowDisplayEdgesArgs,
): Edge[] => {
  const inputSignature = computeBaseDisplayInputSignature({
    nodes: args.nodes,
    edges: args.edges,
    enableSmartEdges: args.enableSmartEdges,
    smartEdgePadding: args.smartEdgePadding,
    isLargeGraph: args.isLargeGraph,
  });
  if (!args.skipFinalizedReuse && isBaseDisplayFinalized(args.edges, inputSignature)) {
    return args.edges;
  }
  const repairNodes = withDisplayAbsolutePositions(
    args.nodes,
    new Map(args.nodes.map(node => [node.id, node] as const)),
  );
  let exactReport: BaseReactFlowDisplayExactReport | undefined;
  const routedEdges = createBaseReactFlowFullRouteEdges({
    ...args,
    createPreDisplayFinalEdges: (preDisplayArgs) => {
      let boundedReport: BaseDisplayBoundedCandidateReport | undefined;
      const boundedEdges = createBaseReactFlowPreDisplayFinalEdges({
        ...preDisplayArgs,
        onBoundedCandidate: (report) => {
          boundedReport = report;
          preDisplayArgs.onBoundedCandidate?.(report);
        },
      });
      if (boundedReport) {
        exactReport = createBaseReactFlowDisplayExactReport(
          boundedEdges,
          args.nodes,
          repairNodes,
          boundedReport,
        );
      }
      return boundedEdges;
    },
  });
  const finalizerTimer = startDisplayRoutingPhaseTrace({
    phase: 'finalizer',
    candidateCount: routedEdges.length,
    onTrace: args.onPhaseTrace,
  });
  const preFinalizerEdges = repairCrossedSpineWithOuterSkirt(routedEdges, repairNodes);
  const preFinalizerReport = getDisplayHardQualityGateReport(
    preFinalizerEdges,
    repairNodes,
    'polished',
  );
  const canReusePreFinalizer = preFinalizerReport.hardClean
    && countRenderUnsafeEndpointStubs(preFinalizerEdges) === 0;
  const finalizedEdges = isBaseDisplayFinalized(preFinalizerEdges, inputSignature)
    || canReusePreFinalizer
    ? preFinalizerEdges
      : finalizeBaseReactFlowDisplayEdges(
        preFinalizerEdges,
        args.nodes,
        preFinalizerEdges === routedEdges ? exactReport : undefined,
        args.onPhaseTrace,
      );
  finalizerTimer.finish('accepted', finalizedEdges.length);
  const finalOrderTimer = startDisplayRoutingPhaseTrace({
    phase: 'hard-gate',
    candidateCount: finalizedEdges.length,
    onTrace: args.onPhaseTrace,
  });
  const hemisphereRawEdges = repairOppositeHemisphereTerminalBacktracks(
    finalizedEdges,
    repairNodes,
  );
  const hemisphereSafeEdges = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    finalizedEdges,
    hemisphereRawEdges,
  );
  const finalEvaluation = createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  const finalOrderEdges = hemisphereSafeEdges.length < 2
    ? hemisphereSafeEdges
    : repairBaseReactFlowFinalEndpointOrder(
      hemisphereSafeEdges,
      repairNodes,
      {
        preferredEdges: args.edges,
        onPhaseTrace: args.onPhaseTrace,
        evaluation: finalEvaluation,
      },
    );
  let commercialClosureReady = false;
  const commercialEdges = repairBaseReactFlowFinalCommercialDetours(
    finalOrderEdges,
    repairNodes,
    {
      preferredEdges: args.edges,
      evaluation: finalEvaluation,
      onFinalEvaluation: evaluation => {
        commercialClosureReady = evaluation.closureReady;
      },
    },
  );
  const safetyClosureTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-safety-closure',
    candidateCount: commercialEdges.length,
    onTrace: args.onPhaseTrace,
  });
  const finalEdges = commercialClosureReady
    ? commercialEdges
    : (() => {
      const crossedSpineClosedEdges = repairCrossedSpineWithOuterSkirt(
        commercialEdges,
        repairNodes,
      );
      const reverseOverlapClosedEdges = repairBoundedReverseParallelOverlaps(
        crossedSpineClosedEdges,
        repairNodes,
        Math.min(64, Math.max(8, crossedSpineClosedEdges.length * 4)),
      );
      const detachedOverlapClosedEdges = separateDetachedParallelOverlaps(
        reverseOverlapClosedEdges,
        repairNodes,
        16,
        DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
      );
      const interiorReverseOverlapClosedEdges = repairResidualOppositeInteriorLaneOverlaps(
        detachedOverlapClosedEdges,
        repairNodes,
        Math.min(64, Math.max(16, detachedOverlapClosedEdges.length * 4)),
      );
      const finalEdgesBeforeHardClosure = repairCrossedSpineWithOuterSkirt(
        interiorReverseOverlapClosedEdges,
        repairNodes,
      );
      return repairBaseReactFlowFinalSafetyClosure(
        finalEdgesBeforeHardClosure,
        repairNodes,
        { evaluation: finalEvaluation },
      );
    })();
  const postSafetyCommercialEdges = commercialClosureReady
    ? finalEdges
    : repairBaseReactFlowFinalCommercialDetours(
      finalEdges,
      repairNodes,
      {
        preferredEdges: args.edges,
        evaluation: finalEvaluation,
        skipLoopShortcut: true,
      },
    );
  safetyClosureTimer.finish(
    commercialClosureReady ? 'skip' : 'accepted',
    postSafetyCommercialEdges === commercialEdges ? 0 : postSafetyCommercialEdges.length,
  );
  finalOrderTimer.finish('accepted', postSafetyCommercialEdges.length);
  return commitDisplayEdgesForRenderMode({
    finalQualityEdges: postSafetyCommercialEdges,
    rawEdges: args.edges,
    enableSmartEdges: args.enableSmartEdges,
    smartEdgePadding: args.smartEdgePadding,
    isLargeGraph: args.isLargeGraph,
    inputSignature,
    nodes: repairNodes,
  });
};
