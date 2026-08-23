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
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';

export const finalizeFailClosedDisplayTransaction = <T extends Edge[]>(
  fallbackCandidate: T,
  repairNodes: Node[],
  inputSignature: string,
  options?: Readonly<{ deferCompoundRepair?: boolean }>,
): T => {
  // Collinear waypoints can conceal a continuous overlap from segment-based repair. Normalize the
  // transaction baseline first so every repair and the final hard gate inspect the rendered shape.
  const compactedFallback = compactDisplayEdgePaths(fallbackCandidate) as T;
  const sharedEndpointCandidate = repairSharedEndpointPortOrderCrossings(
    compactedFallback,
    repairNodes,
  ) as T;
  const detachedCandidate = separateDetachedParallelOverlaps(
    sharedEndpointCandidate,
    repairNodes,
    16,
  ) as T;
  const localCandidate = repairLocalDoglegArtifacts(
    detachedCandidate,
    repairNodes,
  ) as T;
  const residualStrictCandidate = repairFinalResidualStrictCrossings(
    localCandidate,
    repairNodes,
  ) as T;
  const selectedCandidate = chooseFinalTerminalTransactionCandidate(
    repairNodes,
    sharedEndpointCandidate,
    detachedCandidate,
    localCandidate,
    residualStrictCandidate,
  ) as T;
  const microCandidate = repairDisplayMicroArtifacts(
    selectedCandidate,
    createBaseReactFlowDisplayMicroSafetyContext(selectedCandidate, repairNodes),
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
  const report = getDisplayHardQualityGateReport(
    closedCandidate,
    repairNodes,
    'polished',
  );

  return report.hardClean
    ? markBaseDisplayFinalized(closedCandidate, inputSignature)
    : closedCandidate;
};
