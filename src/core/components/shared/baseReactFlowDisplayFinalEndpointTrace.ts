import type { SameSideEndpointTrunkIdentity } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import type { BaseReactFlowFinalEndpointOrderOptions } from './baseReactFlowDisplayFinalEndpointGate';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export const exactTrueTrunkSignature = (
  trunks: readonly SameSideEndpointTrunkIdentity[],
): string => JSON.stringify(trunks.map(trunk => [
  trunk.nodeId,
  trunk.role,
  trunk.side,
  [...trunk.edgeIds].sort(),
  Math.round(trunk.commonStemLength * 1_000) / 1_000,
]).sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second))));

export const traceSkippedFinalEndpointPhases = (
  candidateCount: number,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
  includeSeed = false,
  parentPhase?: BaseReactFlowFinalEndpointOrderOptions['traceParentPhase'],
): void => {
  const phases = [
    'final-endpoint-topology',
    'final-endpoint-order',
    'final-endpoint-closure',
  ] as const;
  for (const phase of includeSeed ? ['final-endpoint-seed', ...phases] as const : phases) {
    startDisplayRoutingPhaseTrace({
      phase,
      ...(parentPhase ? { parentPhase } : {}),
      candidateCount,
      onTrace: onPhaseTrace,
    }).finish('skip');
  }
};
