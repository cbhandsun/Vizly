import type { Edge, Node } from '@xyflow/react';

import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { countStrictEdgeCrossings } from '../../strategies/shared/edgeStrictCrossingGuard';
import { repairBoundedPortAndInternalStrictCrossings } from './baseReactFlowDisplayBoundedStrictRepair';
import { markBaseDisplayFinalized } from './baseReactFlowDisplayEdgeCore';
import { countRenderUnsafeEndpointStubs, repairRenderSafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import { finalStrictDisplaySweep } from './baseReactFlowDisplayStrictSweepRepair';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { chooseSmallestAcceptedDisplayTransaction } from './baseReactFlowDisplayTransaction';

export type FinalAxisTransactionResult<T extends Edge[]> = {
  finalized: T | null;
  anchoredFallback: T | null;
};

export const runFinalAxisTransaction = <T extends Edge[]>({
  orthogonalCandidate,
  attachedReport,
  repairNodes,
  inputSignature,
}: {
  attachedCandidate: T;
  orthogonalCandidate: T;
  attachedReport: BaseDisplayBoundedCandidateReport;
  repairNodes: Node[];
  inputSignature: string;
}): FinalAxisTransactionResult<T> => {
  if (!attachedReport.terminalsAttached || attachedReport.terminalsAnchored) {
    return { finalized: null, anchoredFallback: null };
  }

  const axisCandidate = compactDisplayEdgePaths(
    repairAxisMismatchedTerminalsWithBoundedPortRoles(
      orthogonalCandidate,
      repairNodes,
      Math.min(128, Math.max(32, orthogonalCandidate.length * 4)),
    ) as T,
  );
  if (axisCandidate === orthogonalCandidate) {
    return { finalized: null, anchoredFallback: null };
  }

  const boundedStrictCandidate = countStrictEdgeCrossings(axisCandidate) > 0
    ? repairBoundedPortAndInternalStrictCrossings(axisCandidate, repairNodes, 96) as T
    : axisCandidate;
  const residualStrictCandidate = repairFinalResidualStrictCrossings(
    boundedStrictCandidate,
    repairNodes,
  ) as T;
  const strictSweepCandidate = countStrictEdgeCrossings(residualStrictCandidate) > 0
    ? finalStrictDisplaySweep(residualStrictCandidate, repairNodes) as T
    : residualStrictCandidate;
  const strictCandidate = compactDisplayEdgePaths(
    repairEndpointOrthogonalPaths(strictSweepCandidate, repairNodes) as T,
  );
  const strictReport = getDisplayHardQualityGateReport(
    strictCandidate,
    repairNodes,
    'polished',
  );
  const reanchoredCandidate = strictReport.terminalsAnchored
    ? strictCandidate
    : compactDisplayEdgePaths(
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        strictCandidate,
        repairNodes,
        Math.min(128, Math.max(32, strictCandidate.length * 4)),
      ) as T,
    );
  const reanchoredBoundedStrictCandidate = countStrictEdgeCrossings(reanchoredCandidate) > 0
    ? repairBoundedPortAndInternalStrictCrossings(reanchoredCandidate, repairNodes, 96) as T
    : reanchoredCandidate;
  const reanchoredResidualStrictCandidate = repairFinalResidualStrictCrossings(
    reanchoredBoundedStrictCandidate,
    repairNodes,
  ) as T;
  const reanchoredStrictSweepCandidate = countStrictEdgeCrossings(
    reanchoredResidualStrictCandidate,
  ) > 0
    ? finalStrictDisplaySweep(reanchoredResidualStrictCandidate, repairNodes) as T
    : reanchoredResidualStrictCandidate;
  const committedCandidate = compactDisplayEdgePaths(
    repairEndpointOrthogonalPaths(reanchoredStrictSweepCandidate, repairNodes) as T,
  );
  const committedReport = getDisplayHardQualityGateReport(
    committedCandidate,
    repairNodes,
    'polished',
  );
  const anchoredFallback = committedReport.terminalsAnchored ? committedCandidate : null;
  if (committedReport.hardClean) {
    return {
      finalized: markBaseDisplayFinalized(committedCandidate, inputSignature),
      anchoredFallback,
    };
  }

  const minimalCandidate = chooseSmallestAcceptedDisplayTransaction(
    axisCandidate,
    committedCandidate,
    transaction => getDisplayHardQualityGateReport(
      transaction,
      repairNodes,
      'polished',
    ).hardClean,
    32,
  );
  if (minimalCandidate) {
    const renderSafeCandidate = repairRenderSafeEndpointStubs(minimalCandidate, repairNodes) as T;
    if (
      countRenderUnsafeEndpointStubs(renderSafeCandidate) === 0
      && getDisplayHardQualityGateReport(renderSafeCandidate, repairNodes, 'polished').hardClean
    ) {
      return {
        finalized: markBaseDisplayFinalized(renderSafeCandidate, inputSignature),
        anchoredFallback,
      };
    }
  }

  return { finalized: null, anchoredFallback };
};
