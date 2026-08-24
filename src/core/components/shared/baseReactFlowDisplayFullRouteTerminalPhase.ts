import type { Edge } from '@xyflow/react';

import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { repairSharedEndpointPortOrderCrossings } from '../../strategies/shared/edgeSharedEndpointPortOrderRepair';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  anchorComputedDisplayEdgeEndpoints,
  markBaseDisplayFinalized,
} from './baseReactFlowDisplayEdgeCore';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import {
  repairAxisMismatchedTerminalsWithBoundedPortRoles,
  repairDetachedTerminalsWithBoundedPortRoles,
} from './baseReactFlowDisplayTerminalPortRepair';
import {
  chooseFinalTerminalTransactionCandidate,
  countDisplayObstacleHits,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { runFinalAxisTransaction } from './baseReactFlowDisplayFinalAxisTransaction';
import { finalizeFailClosedDisplayTransaction } from './baseReactFlowDisplayFinalTransaction';
import { repairResidualOuterPortTransactionWithHardGate } from './baseReactFlowDisplayOuterPortTransaction';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';
import { diffBaseReactFlowEvaluationMetrics } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { startDisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';

export const runBaseReactFlowFullRouteTerminalPhase = (
  context: BaseReactFlowFullRouteContext,
  strictCandidate: Edge[],
): Edge[] => {
  const {
    repairNodes,
    inputSignature,
    evaluationSession,
    onPhaseTrace,
  } = context;
  const startTerminalStage = (
    phase: Extract<
      Parameters<typeof startDisplayRoutingPhaseTrace>[0]['phase'],
      | 'terminal-attachment-axis'
      | 'terminal-anchor'
      | 'terminal-polish'
      | 'terminal-finalize'
    >,
    candidateCount: number,
  ) => {
    const metricsBefore = evaluationSession.readMetrics();
    const timer = startDisplayRoutingPhaseTrace({
      phase,
      parentPhase: 'terminal',
      candidateCount,
      onTrace: onPhaseTrace,
    });
    return (
      resolution: 'accepted' | 'skip' | 'fallback',
      changedEdgeCount = 0,
    ): void => timer.finish(
      resolution,
      changedEdgeCount,
      diffBaseReactFlowEvaluationMetrics(metricsBefore, evaluationSession.readMetrics()),
    );
  };
  const finishAttachmentAxis = startTerminalStage(
    'terminal-attachment-axis',
    strictCandidate.length,
  );
  const finalBoundedTerminalReport = context.evaluationSession.terminalReport(strictCandidate);
  const finalAttachedCandidate = finalBoundedTerminalReport.allAttached
    ? strictCandidate
    : repairDetachedTerminalsWithBoundedPortRoles(strictCandidate, repairNodes, 24);
  const directAxisCandidate = compactDisplayEdgePaths(
    repairAxisMismatchedTerminalsWithBoundedPortRoles(
      finalAttachedCandidate,
      repairNodes,
      Math.min(128, Math.max(32, finalAttachedCandidate.length * 4)),
    ),
  );
  const finalAttachedReport = context.evaluationSession.hardReport(finalAttachedCandidate);
  const directAxisReport = directAxisCandidate === finalAttachedCandidate
    ? finalAttachedReport
    : context.evaluationSession.hardReport(directAxisCandidate);
  if (
    directAxisCandidate !== finalAttachedCandidate
    && directAxisReport.hardClean
  ) {
    finishAttachmentAxis('accepted', directAxisCandidate.length);
    return markBaseDisplayFinalized(directAxisCandidate, inputSignature);
  }
  finishAttachmentAxis(
    directAxisCandidate === strictCandidate ? 'skip' : 'fallback',
    directAxisCandidate === strictCandidate ? 0 : directAxisCandidate.length,
  );
  const finishAnchor = startTerminalStage('terminal-anchor', finalAttachedCandidate.length);
  const finalTerminalBaselineCandidate = (
    directAxisCandidate !== finalAttachedCandidate
    && directAxisReport.terminalsAttached
    && directAxisReport.terminalsAnchored
    && directAxisReport.obstacleHits <= finalAttachedReport.obstacleHits
    && visualPolishHardQualityDoesNotRegress(
      finalAttachedReport.quality,
      directAxisReport.quality,
    )
  ) ? directAxisCandidate : finalAttachedCandidate;
  const finalAxisAnchoredCandidate = anchorComputedDisplayEdgeEndpoints(
    finalTerminalBaselineCandidate,
    repairNodes,
  );
  const finalAttachedQuality = calculateEdgePathQualityScore(finalTerminalBaselineCandidate);
  const finalAxisAnchoredQuality = calculateEdgePathQualityScore(finalAxisAnchoredCandidate);
  const baselineTerminalReport = context.evaluationSession.terminalReport(
    finalTerminalBaselineCandidate,
  );
  const candidateTerminalReport = context.evaluationSession.terminalReport(finalAxisAnchoredCandidate);
  const baselineAxisMismatchCount = baselineTerminalReport.unanchoredEdgeIndexes.length;
  const candidateAxisMismatchCount = candidateTerminalReport.unanchoredEdgeIndexes.length;
  const finalAxisCandidate = (
    candidateAxisMismatchCount < baselineAxisMismatchCount
    && visualPolishHardQualityDoesNotRegress(finalAttachedQuality, finalAxisAnchoredQuality)
    && countDisplayObstacleHits(finalAxisAnchoredCandidate, repairNodes)
      <= countDisplayObstacleHits(finalAttachedCandidate, repairNodes)
    && candidateTerminalReport.allAttached
  )
    ? finalAxisAnchoredCandidate
    : finalTerminalBaselineCandidate;
  finishAnchor(
    finalAxisCandidate === finalTerminalBaselineCandidate ? 'skip' : 'accepted',
    finalAxisCandidate === finalTerminalBaselineCandidate ? 0 : finalAxisCandidate.length,
  );
  const finishPolish = startTerminalStage('terminal-polish', finalAxisCandidate.length);
  const finalPortRoleCandidate = repairAxisMismatchedTerminalsWithBoundedPortRoles(
    finalAxisCandidate,
    repairNodes,
    16,
  );
  const finalReadablePortRoleCandidate = repairTerminalBoundaryStairs(
    finalPortRoleCandidate,
    repairNodes,
  );
  const finalPostTerminalCandidate = repairSharedEndpointPortOrderCrossings(
    finalReadablePortRoleCandidate,
    repairNodes,
  );
  const finalHairpinBridgeCandidate = repairResidualHairpinBridges(
    finalPostTerminalCandidate,
    repairNodes,
  );
  const finalTerminalTransactionCandidate = chooseFinalTerminalTransactionCandidate(
    repairNodes,
    finalPortRoleCandidate,
    finalReadablePortRoleCandidate,
    finalPostTerminalCandidate,
    finalHairpinBridgeCandidate,
  );
  const finalTerminalTransactionReport = context.evaluationSession.terminalReport(
    finalTerminalTransactionCandidate,
  );
  const finalAttachedTransactionCandidate = finalTerminalTransactionReport.allAttached
    ? finalTerminalTransactionCandidate
    : repairDetachedTerminalsWithBoundedPortRoles(
      finalTerminalTransactionCandidate,
      repairNodes,
      12,
    );
  const finalAttachedTransactionReport = context.evaluationSession.hardReport(
    finalAttachedTransactionCandidate,
  );
  if (finalAttachedTransactionReport.hardClean) {
    finishPolish('accepted', finalAttachedTransactionCandidate.length);
    return markBaseDisplayFinalized(finalAttachedTransactionCandidate, inputSignature);
  }
  finishPolish(
    finalAttachedTransactionCandidate === finalAxisCandidate ? 'skip' : 'fallback',
    finalAttachedTransactionCandidate === finalAxisCandidate
      ? 0
      : finalAttachedTransactionCandidate.length,
  );
  const finishFinalize = startTerminalStage(
    'terminal-finalize',
    finalAttachedTransactionCandidate.length,
  );
  const startFinalizeStage = (
    phase: Extract<
      Parameters<typeof startDisplayRoutingPhaseTrace>[0]['phase'],
      | 'terminal-finalize-orthogonal'
      | 'terminal-finalize-axis'
      | 'terminal-finalize-outer-port'
      | 'terminal-finalize-fail-closed'
    >,
  ) => {
    const metricsBefore = evaluationSession.readMetrics();
    const timer = startDisplayRoutingPhaseTrace({
      phase,
      parentPhase: 'terminal-finalize',
      candidateCount: finalAttachedTransactionCandidate.length,
      onTrace: onPhaseTrace,
    });
    return (
      resolution: 'accepted' | 'skip' | 'fallback',
      changedEdgeCount = 0,
    ): void => timer.finish(
      resolution,
      changedEdgeCount,
      diffBaseReactFlowEvaluationMetrics(metricsBefore, evaluationSession.readMetrics()),
    );
  };
  const finishOrthogonal = startFinalizeStage('terminal-finalize-orthogonal');
  const finalOrthogonalTransactionCandidate = compactDisplayEdgePaths(
    repairEndpointOrthogonalPaths(finalAttachedTransactionCandidate, repairNodes),
  );
  if (finalOrthogonalTransactionCandidate !== finalAttachedTransactionCandidate) {
    const finalOrthogonalTransactionReport = context.evaluationSession.hardReport(
      finalOrthogonalTransactionCandidate,
    );
    if (finalOrthogonalTransactionReport.hardClean) {
      finishOrthogonal('accepted', finalOrthogonalTransactionCandidate.length);
      finishFinalize('accepted', finalOrthogonalTransactionCandidate.length);
      return markBaseDisplayFinalized(finalOrthogonalTransactionCandidate, inputSignature);
    }
  }
  finishOrthogonal(
    finalOrthogonalTransactionCandidate === finalAttachedTransactionCandidate ? 'skip' : 'fallback',
    finalOrthogonalTransactionCandidate === finalAttachedTransactionCandidate
      ? 0
      : finalOrthogonalTransactionCandidate.length,
  );
  const finishAxis = startFinalizeStage('terminal-finalize-axis');
  const finalAxisTransaction = runFinalAxisTransaction({
    attachedCandidate: finalAttachedTransactionCandidate,
    orthogonalCandidate: finalOrthogonalTransactionCandidate,
    attachedReport: finalAttachedTransactionReport,
    repairNodes,
    inputSignature,
  });
  if (finalAxisTransaction.finalized) {
    finishAxis('accepted', finalAttachedTransactionCandidate.length);
    finishFinalize('accepted', finalAttachedTransactionCandidate.length);
    return finalAxisTransaction.finalized;
  }
  finishAxis('fallback');
  const finalAxisFallbackTransactionCandidate = finalAxisTransaction.anchoredFallback;
  const finishOuterPort = startFinalizeStage('terminal-finalize-outer-port');
  const finalFallbackTransactionCandidate = finalAxisFallbackTransactionCandidate
    ?? chooseFinalTerminalTransactionCandidate(
      repairNodes,
      finalTerminalTransactionCandidate,
      finalAttachedTransactionCandidate,
      finalOrthogonalTransactionCandidate,
    );
  const finalOuterPortCandidate = repairResidualOuterPortTransactionWithHardGate(
    finalFallbackTransactionCandidate,
    repairNodes,
    64,
  );
  if (finalOuterPortCandidate !== finalFallbackTransactionCandidate) {
    finishOuterPort('accepted', finalOuterPortCandidate.length);
    finishFinalize('accepted', finalOuterPortCandidate.length);
    return markBaseDisplayFinalized(finalOuterPortCandidate, inputSignature);
  }
  finishOuterPort('skip');
  const finishFailClosed = startFinalizeStage('terminal-finalize-fail-closed');
  const failClosedEdges = finalizeFailClosedDisplayTransaction(
    finalFallbackTransactionCandidate,
    repairNodes,
    inputSignature,
    { deferCompoundRepair: true, onPhaseTrace },
  );
  finishFailClosed('fallback', failClosedEdges.length);
  finishFinalize('fallback', failClosedEdges.length);
  return failClosedEdges;
};
