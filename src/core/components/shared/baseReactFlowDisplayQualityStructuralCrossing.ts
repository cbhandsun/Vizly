import type { Edge, Node } from '@xyflow/react';

import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { repairReverseFlowBypassCrossings } from '../../strategies/shared/edgeReverseFlowBypassRepair';
import { repairSharedTrunkAwareCrossings } from '../../strategies/shared/edgeRoutingPipeline';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseName,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

type StructuralCrossingPhase = Extract<
  DisplayRoutingPhaseName,
  | 'quality-crossing-structural-reverse-initial'
  | 'quality-crossing-structural-shared-initial'
  | 'quality-crossing-structural-reverse-final'
  | 'quality-crossing-structural-shared-final'
  | 'quality-crossing-structural-endpoint-lane'
>;

interface RepairQualityStructuralCrossingsOptions {
  edges: Edge[];
  nodes: Node[];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}

export const repairBaseReactFlowQualityStructuralCrossings = ({
  edges,
  nodes,
  onPhaseTrace,
}: RepairQualityStructuralCrossingsOptions): Edge[] => {
  const stage = (
    phase: StructuralCrossingPhase,
    baseline: Edge[],
    repair: () => Edge[],
  ): Edge[] => {
    const timer = startDisplayRoutingPhaseTrace({
      phase,
      parentPhase: 'quality-crossing-structural',
      candidateCount: baseline.length,
      onTrace: onPhaseTrace,
    });
    const candidate = repair();
    timer.finish(
      candidate === baseline ? 'skip' : 'accepted',
      countChangedRoutingItems(baseline, candidate),
    );
    return candidate;
  };

  const reverseInitial = stage(
    'quality-crossing-structural-reverse-initial',
    edges,
    () => repairEndpointOrthogonalPaths(
      repairReverseFlowBypassCrossings(edges, nodes),
      nodes,
    ),
  );
  const sharedInitial = stage(
    'quality-crossing-structural-shared-initial',
    reverseInitial,
    () => repairEndpointOrthogonalPaths(
      repairSharedTrunkAwareCrossings(reverseInitial, nodes),
      nodes,
    ),
  );
  const reverseFinal = stage(
    'quality-crossing-structural-reverse-final',
    sharedInitial,
    () => repairEndpointOrthogonalPaths(
      repairReverseFlowBypassCrossings(sharedInitial, nodes),
      nodes,
    ),
  );
  const sharedFinal = stage(
    'quality-crossing-structural-shared-final',
    reverseFinal,
    () => repairEndpointOrthogonalPaths(
      repairSharedTrunkAwareCrossings(reverseFinal, nodes),
      nodes,
    ),
  );
  return stage(
    'quality-crossing-structural-endpoint-lane',
    sharedFinal,
    () => repairEndpointLaneCrossings(sharedFinal, nodes),
  );
};
