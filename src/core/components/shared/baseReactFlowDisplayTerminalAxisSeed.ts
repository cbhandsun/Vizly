import type { Edge, Node } from '@xyflow/react';

import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import { startDisplayRoutingPhaseTrace, type DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import { repairTerminalHandleAxisCrossings } from './baseReactFlowTerminalAxisRepair';

export const repairBaseReactFlowTerminalAxisSeed = ({
  edges,
  nodes,
  onPhaseTrace,
}: {
  edges: Edge[];
  nodes: Node[];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): Edge[] => {
  const timer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-terminal-axis',
        candidateCount: edges.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const quality = calculateEdgePathQualityScore(edges);
  const repaired = quality.strictCrossings > 0
    || quality.reverseOverlap > 0
    || quality.unrelatedOverlap > 0
    || quality.unexplainedRelatedOverlap > 0
    ? repairTerminalHandleAxisCrossings(edges, nodes)
    : edges;
  timer?.finish(repaired === edges ? 'skip' : 'accepted', repaired === edges ? 0 : repaired.length);
  return repaired;
};
