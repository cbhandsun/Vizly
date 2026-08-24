import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairLocalDoglegArtifacts } from '../../strategies/shared/edgeLocalDoglegRepair';
import { repairSharedEndpointPortOrderCrossings } from '../../strategies/shared/edgeSharedEndpointPortOrderRepair';
import { markBaseDisplayFinalized } from './baseReactFlowDisplayEdgeCore';
import { chooseFinalTerminalTransactionCandidate } from './baseReactFlowDisplayEvaluation';
import { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayFinalEndpointOrder';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';

export const finalizeFailClosedDisplayTransaction = <T extends Edge[]>(
  fallbackCandidate: T,
  repairNodes: Node[],
  inputSignature: string,
  options?: Readonly<{
    deferCompoundRepair?: boolean;
    onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  }>,
): T => {
  const startStage = (
    phase: Extract<
      Parameters<typeof startDisplayRoutingPhaseTrace>[0]['phase'],
      | 'terminal-fail-closed-normalize'
      | 'terminal-fail-closed-overlap'
      | 'terminal-fail-closed-local'
      | 'terminal-fail-closed-strict'
      | 'terminal-fail-closed-selection'
      | 'terminal-fail-closed-micro'
      | 'terminal-fail-closed-gate'
    >,
    candidateCount: number,
  ) => startDisplayRoutingPhaseTrace({
    phase,
    candidateCount,
    onTrace: options?.onPhaseTrace,
  });
  // Collinear waypoints can conceal a continuous overlap from segment-based repair. Normalize the
  // transaction baseline first so every repair and the final hard gate inspect the rendered shape.
  const normalizeTimer = startStage(
    'terminal-fail-closed-normalize',
    fallbackCandidate.length,
  );
  const compactedFallback = compactDisplayEdgePaths(fallbackCandidate) as T;
  const sharedEndpointCandidate = repairSharedEndpointPortOrderCrossings(
    compactedFallback,
    repairNodes,
  ) as T;
  normalizeTimer.finish(
    sharedEndpointCandidate === fallbackCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(fallbackCandidate, sharedEndpointCandidate),
  );
  const overlapTimer = startStage(
    'terminal-fail-closed-overlap',
    sharedEndpointCandidate.length,
  );
  const detachedCandidate = separateDetachedParallelOverlaps(
    sharedEndpointCandidate,
    repairNodes,
    16,
  ) as T;
  overlapTimer.finish(
    detachedCandidate === sharedEndpointCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(sharedEndpointCandidate, detachedCandidate),
  );
  const localTimer = startStage('terminal-fail-closed-local', detachedCandidate.length);
  const localCandidate = repairLocalDoglegArtifacts(
    detachedCandidate,
    repairNodes,
  ) as T;
  localTimer.finish(
    localCandidate === detachedCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(detachedCandidate, localCandidate),
  );
  const strictTimer = startStage('terminal-fail-closed-strict', localCandidate.length);
  const residualStrictCandidate = repairFinalResidualStrictCrossings(
    localCandidate,
    repairNodes,
  ) as T;
  strictTimer.finish(
    residualStrictCandidate === localCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(localCandidate, residualStrictCandidate),
  );
  const selectionTimer = startStage(
    'terminal-fail-closed-selection',
    residualStrictCandidate.length,
  );
  const selectedCandidate = chooseFinalTerminalTransactionCandidate(
    repairNodes,
    sharedEndpointCandidate,
    detachedCandidate,
    localCandidate,
    residualStrictCandidate,
  ) as T;
  selectionTimer.finish(
    selectedCandidate === sharedEndpointCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(sharedEndpointCandidate, selectedCandidate),
  );
  const microTimer = startStage('terminal-fail-closed-micro', selectedCandidate.length);
  const microCandidate = repairDisplayMicroArtifacts(
    selectedCandidate,
    () => createBaseReactFlowDisplayMicroSafetyContext(selectedCandidate, repairNodes),
    undefined,
    { allowCompoundRepairs: options?.deferCompoundRepair !== true },
  ) as T;
  const selectedMicroCandidate = chooseFinalTerminalTransactionCandidate(
    repairNodes,
    selectedCandidate,
    microCandidate,
  ) as T;
  const closedCandidate = finalSameSideTrueTrunksDoNotRegress(
    selectedCandidate,
    selectedMicroCandidate,
    repairNodes,
  )
    ? selectedMicroCandidate
    : selectedCandidate;
  microTimer.finish(
    closedCandidate === selectedCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(selectedCandidate, closedCandidate),
  );
  const gateTimer = startStage('terminal-fail-closed-gate', closedCandidate.length);
  const report = getDisplayHardQualityGateReport(
    closedCandidate,
    repairNodes,
    'polished',
  );
  gateTimer.finish(report.hardClean ? 'accepted' : 'fallback');

  return report.hardClean
    ? markBaseDisplayFinalized(closedCandidate, inputSignature)
    : closedCandidate;
};
