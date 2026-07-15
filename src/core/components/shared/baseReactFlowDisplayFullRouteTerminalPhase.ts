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
  const finalAxisAnchoredCandidate = anchorComputedDisplayEdgeEndpoints(
    finalAttachedCandidate,
    repairNodes,
  );
  const finalAttachedQuality = calculateEdgePathQualityScore(finalAttachedCandidate);
  const finalAxisAnchoredQuality = calculateEdgePathQualityScore(finalAxisAnchoredCandidate);
  const baselineTerminalReport = getDisplayTerminalValidationReport(
    finalAttachedCandidate,
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
    : finalAttachedCandidate;
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
  return finalizeFailClosedDisplayTransaction(
    finalFallbackTransactionCandidate,
    repairNodes,
    inputSignature,
  );
};
