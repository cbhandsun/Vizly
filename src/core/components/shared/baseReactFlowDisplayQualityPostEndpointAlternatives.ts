import type { Edge, Node } from '@xyflow/react';

import {
  createDisplayMicroCleanupDiagnostics,
  repairDisplayMicroArtifacts,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  createLocalDoglegRepairDiagnostics,
  type LocalDoglegRepairDiagnostics,
} from '../../strategies/shared/edgeLocalDoglegRepair';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import {
  shouldMaterializePostEndpointLocalAlternative,
  shouldMaterializeQualityMicroAlternative,
} from './baseReactFlowDisplayQualityPolishSupport';

type QualityPostEndpointAlternatives = Readonly<{
  endpointAfterLocalCandidate: Edge[];
  localCandidate: Edge[];
  microPolishCandidate: Edge[];
}>;

/** Materializes only post-endpoint repair families justified by current defects. */
export const createDisplayQualityPostEndpointAlternatives = ({
  endpointPolishCandidate,
  repairNodes,
  repairDoglegs,
  useBoundedLargeRepair,
  onPhaseTrace,
}: Readonly<{
  endpointPolishCandidate: Edge[];
  repairNodes: Node[];
  repairDoglegs: (edges: Edge[], diagnostics?: LocalDoglegRepairDiagnostics) => Edge[];
  useBoundedLargeRepair: boolean;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}>): QualityPostEndpointAlternatives => {
  const endpointPolishQuality = calculateEdgePathQualityScore(endpointPolishCandidate);
  const microTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-micro',
        candidateCount: endpointPolishCandidate.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const microDiagnostics = createDisplayMicroCleanupDiagnostics();
  const needsMicroAlternative = shouldMaterializeQualityMicroAlternative(
    useBoundedLargeRepair,
    endpointPolishQuality,
  );
  const microPolishCandidate = needsMicroAlternative
    ? repairDisplayMicroArtifacts(
        endpointPolishCandidate,
        undefined,
        microDiagnostics,
        { allowCompoundRepairs: false },
      )
    : endpointPolishCandidate;
  microTimer?.finish(
    microPolishCandidate === endpointPolishCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(endpointPolishCandidate, microPolishCandidate),
    {
      candidateCount: microDiagnostics.generatedCandidateCount,
      evaluationCount: microDiagnostics.evaluatedCandidateCount,
      cacheHitCount: microDiagnostics.cacheHitCount + microDiagnostics.pairCacheHitCount,
      scannedEdgePairCount: microDiagnostics.scannedEdgePairCount,
      scannedSegmentCount: microDiagnostics.scannedSegmentCount,
    },
  );

  const localTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-local-after-endpoint',
        candidateCount: endpointPolishCandidate.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const localDiagnostics = createLocalDoglegRepairDiagnostics();
  const needsLocalAlternative = shouldMaterializePostEndpointLocalAlternative(
    useBoundedLargeRepair,
    endpointPolishQuality,
  );
  const localCandidate = needsLocalAlternative
    ? repairDoglegs(endpointPolishCandidate, localDiagnostics)
    : endpointPolishCandidate;
  localTimer?.finish(
    localCandidate === endpointPolishCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(endpointPolishCandidate, localCandidate),
    {
      candidateCount: localDiagnostics.candidateCount,
      evaluationCount: localDiagnostics.qualityEvaluationCount,
      cacheHitCount: localDiagnostics.cacheHitCount
        + localDiagnostics.deduplicatedCandidateCount,
    },
  );

  const endpointTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-endpoint-after-local',
        candidateCount: localCandidate.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const endpointAfterLocalCandidate = needsLocalAlternative
    ? repairEndpointOrthogonalPaths(localCandidate, repairNodes)
    : localCandidate;
  endpointTimer?.finish(
    endpointAfterLocalCandidate === localCandidate ? 'skip' : 'accepted',
    countChangedRoutingItems(localCandidate, endpointAfterLocalCandidate),
  );

  return { endpointAfterLocalCandidate, localCandidate, microPolishCandidate };
};
