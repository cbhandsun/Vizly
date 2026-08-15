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
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalAxisRepair';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { runFinalAxisTransaction } from './baseReactFlowDisplayFinalAxisTransaction';
import { finalizeFailClosedDisplayTransaction } from './baseReactFlowDisplayFinalTransaction';
import { repairResidualOuterPortTransactionWithHardGate } from './baseReactFlowDisplayOuterPortTransaction';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';

export const runBaseReactFlowFullRouteTerminalPhase = (
  context: BaseReactFlowFullRouteContext,
  strictCandidate: Edge[],
): Edge[] => {
  const { repairNodes, inputSignature } = context;
  const terminalValidationSnapshot = createDisplayTerminalValidationSnapshot(repairNodes);
  const finalBoundedTerminalReport = getDisplayTerminalValidationReport(
    strictCandidate,
    terminalValidationSnapshot,
  );
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
  const finalAttachedReport = getDisplayHardQualityGateReport(
    finalAttachedCandidate,
    repairNodes,
    'polished',
  );
  const directAxisReport = directAxisCandidate === finalAttachedCandidate
    ? finalAttachedReport
    : getDisplayHardQualityGateReport(
      directAxisCandidate,
      repairNodes,
      'polished',
    );
  if (
    directAxisCandidate !== finalAttachedCandidate
    && directAxisReport.hardClean
  ) {
    return markBaseDisplayFinalized(directAxisCandidate, inputSignature);
  }
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
  const baselineTerminalReport = getDisplayTerminalValidationReport(
    finalTerminalBaselineCandidate,
    terminalValidationSnapshot,
  );
  const candidateTerminalReport = getDisplayTerminalValidationReport(
    finalAxisAnchoredCandidate,
    terminalValidationSnapshot,
  );
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
  const finalTerminalTransactionReport = getDisplayTerminalValidationReport(
    finalTerminalTransactionCandidate,
    terminalValidationSnapshot,
  );
  const finalAttachedTransactionCandidate = finalTerminalTransactionReport.allAttached
    ? finalTerminalTransactionCandidate
    : repairDetachedTerminalsWithBoundedPortRoles(
      finalTerminalTransactionCandidate,
      repairNodes,
      12,
    );
  const finalAttachedTransactionReport = getDisplayHardQualityGateReport(
    finalAttachedTransactionCandidate,
    repairNodes,
    'polished',
  );
  if (finalAttachedTransactionReport.hardClean) {
    return markBaseDisplayFinalized(finalAttachedTransactionCandidate, inputSignature);
  }
  const finalOrthogonalTransactionCandidate = compactDisplayEdgePaths(
    repairEndpointOrthogonalPaths(finalAttachedTransactionCandidate, repairNodes),
  );
  if (finalOrthogonalTransactionCandidate !== finalAttachedTransactionCandidate) {
    const finalOrthogonalTransactionReport = getDisplayHardQualityGateReport(
      finalOrthogonalTransactionCandidate,
      repairNodes,
      'polished',
    );
    if (finalOrthogonalTransactionReport.hardClean) {
      return markBaseDisplayFinalized(finalOrthogonalTransactionCandidate, inputSignature);
    }
  }
  const finalAxisTransaction = runFinalAxisTransaction({
    attachedCandidate: finalAttachedTransactionCandidate,
    orthogonalCandidate: finalOrthogonalTransactionCandidate,
    attachedReport: finalAttachedTransactionReport,
    repairNodes,
    inputSignature,
  });
  if (finalAxisTransaction.finalized) return finalAxisTransaction.finalized;
  const finalAxisFallbackTransactionCandidate = finalAxisTransaction.anchoredFallback;
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
    return markBaseDisplayFinalized(finalOuterPortCandidate, inputSignature);
  }
  return finalizeFailClosedDisplayTransaction(
    finalFallbackTransactionCandidate,
    repairNodes,
    inputSignature,
  );
};
