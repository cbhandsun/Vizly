import type { Edge } from '@xyflow/react';

import { repairOppositeHemisphereTerminalBacktracks } from '../../strategies/shared/edgeSharedTrunkSynthesis';
import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import {
  buildBaseReactFlowAlternateHardClosureCandidate,
  displayAlternateHardClosureCandidateIsReady,
} from './baseReactFlowDisplayAlternateHardClosure';
import { buildBaseReactFlowEmergencyObstacleCandidate } from './baseReactFlowDisplayEmergencyHardClosure';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import {
  chooseFinalObstacleAwarePolishCandidate,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  diffBaseReactFlowEvaluationMetrics,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  repairBaseReactFlowFinalCommercialDetours,
  repairBaseReactFlowFinalEndpointOrder,
} from './baseReactFlowDisplayFinalEndpointOrder';
import { closeBaseReactFlowDisplayFinalHardContract } from './baseReactFlowDisplayFinalHardContract';
import { repairBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyClosure';
import {
  finalizeBaseReactFlowDisplayEdges,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';
import { repairCrossedSpineWithOuterSkirt } from './baseReactFlowDisplayCrossedSpineSkirtRepair';
import { DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepair';
import { repairResidualOppositeInteriorLaneOverlaps } from './baseReactFlowDisplayReverseParallelRepair';
import { repairBoundedReverseParallelOverlaps } from './baseReactFlowDisplayReverseParallelOverlapClosure';
import { commitDisplayEdgesForRenderMode } from './baseReactFlowDisplayRenderPipeline';
import { startDisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type { BaseReactFlowDisplayEdgesArgs } from './baseReactFlowDisplayFullRouteTypes';
import { isBaseDisplayFinalized } from './baseReactFlowDisplayEdgeCore';

/**
 * Closes the final display contract after the full-route seed has completed.
 * This is Worker-owned routing logic; renderers only consume its committed
 * geometry and never repeat these repairs on the main thread.
 */
export const closeBaseReactFlowFinalDisplayRoute = ({
  args,
  routedEdges,
  repairNodes,
  inputSignature,
  exactReport,
}: {
  args: BaseReactFlowDisplayEdgesArgs;
  routedEdges: Edge[];
  repairNodes: import('@xyflow/react').Node[];
  inputSignature: string;
  exactReport?: BaseReactFlowDisplayExactReport;
}): Edge[] => {
  const evaluationSession = args.evaluationSession
    ?? createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  const finalizerTimer = startDisplayRoutingPhaseTrace({
    phase: 'finalizer',
    candidateCount: routedEdges.length,
    onTrace: args.onPhaseTrace,
  });
  const finalizerMetricsBefore = evaluationSession.readMetrics();
  const preFinalizerEdges = repairCrossedSpineWithOuterSkirt(routedEdges, repairNodes);
  const preFinalizerReport = evaluationSession.hardReport(preFinalizerEdges);
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
  finalizerTimer.finish(
    'accepted',
    finalizedEdges.length,
    diffBaseReactFlowEvaluationMetrics(
      finalizerMetricsBefore,
      evaluationSession.readMetrics(),
    ),
  );

  const finalOrderTimer = startDisplayRoutingPhaseTrace({
    phase: 'hard-gate',
    candidateCount: finalizedEdges.length,
    onTrace: args.onPhaseTrace,
  });
  const finalOrderMetricsBefore = evaluationSession.readMetrics();
  const hemisphereRawEdges = repairOppositeHemisphereTerminalBacktracks(
    finalizedEdges,
    repairNodes,
  );
  const hemisphereSafeEdges = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    finalizedEdges,
    hemisphereRawEdges,
  );
  const finalOrderEdges = hemisphereSafeEdges.length < 2
    ? hemisphereSafeEdges
    : repairBaseReactFlowFinalEndpointOrder(
      hemisphereSafeEdges,
      repairNodes,
      {
        preferredEdges: args.edges,
        onPhaseTrace: args.onPhaseTrace,
        evaluation: evaluationSession,
      },
    );
  let commercialClosureReady = false;
  const commercialEdges = repairBaseReactFlowFinalCommercialDetours(
    finalOrderEdges,
    repairNodes,
    {
      preferredEdges: args.edges,
      evaluation: evaluationSession,
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
      return repairBaseReactFlowFinalSafetyClosure(
        repairCrossedSpineWithOuterSkirt(interiorReverseOverlapClosedEdges, repairNodes),
        repairNodes,
        {
          evaluation: evaluationSession,
          onPhaseTrace: args.onPhaseTrace,
          traceParentPhase: 'final-safety-closure',
        },
      );
    })();
  const postSafetyCommercialEdges = commercialClosureReady
    ? finalEdges
    : repairBaseReactFlowFinalCommercialDetours(
      finalEdges,
      repairNodes,
      {
        preferredEdges: args.edges,
        evaluation: evaluationSession,
        skipLoopShortcut: true,
      },
    );
  const committedRenderCandidate = commitDisplayEdgesForRenderMode({
    finalQualityEdges: postSafetyCommercialEdges,
    rawEdges: args.edges,
    enableSmartEdges: args.enableSmartEdges,
    smartEdgePadding: args.smartEdgePadding,
    isLargeGraph: args.isLargeGraph,
    inputSignature,
    nodes: repairNodes,
  });
  const emergencyObstacleCandidate = buildBaseReactFlowEmergencyObstacleCandidate(
    committedRenderCandidate,
    repairNodes,
  );
  const finalHardOutcome = closeBaseReactFlowDisplayFinalHardContract(
    emergencyObstacleCandidate,
    repairNodes,
    args.onPhaseTrace,
  );
  let renderReadyEdges = [
    finalHardOutcome.edges,
    committedRenderCandidate,
  ].find(candidate => displayAlternateHardClosureCandidateIsReady(candidate, repairNodes));
  if (!renderReadyEdges) {
    renderReadyEdges = buildBaseReactFlowAlternateHardClosureCandidate({
      args,
      repairNodes,
      primaryCandidate: finalHardOutcome.edges,
    }) ?? committedRenderCandidate;
  }
  safetyClosureTimer.finish(
    commercialClosureReady ? 'skip' : 'accepted',
    renderReadyEdges === commercialEdges ? 0 : renderReadyEdges.length,
  );
  finalOrderTimer.finish(
    'accepted',
    renderReadyEdges.length,
    diffBaseReactFlowEvaluationMetrics(
      finalOrderMetricsBefore,
      evaluationSession.readMetrics(),
    ),
  );
  return renderReadyEdges;
};

export type { BaseDisplayBoundedCandidateReport };
