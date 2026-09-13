import type { Edge, Node } from '@xyflow/react';

import { startDisplayRoutingPhaseTrace, type DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import {
  createDisplayTerminalAxisRepairDiagnostics,
  repairTerminalHandleAxisCrossings,
} from './baseReactFlowTerminalAxisRepair';

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
  const diagnostics = createDisplayTerminalAxisRepairDiagnostics();
  const repaired = repairTerminalHandleAxisCrossings(edges, nodes, diagnostics);
  timer?.finish(
    repaired === edges ? 'skip' : 'accepted',
    repaired === edges ? 0 : repaired.length,
    {
      candidateCount: diagnostics.candidateCount,
      evaluationCount: diagnostics.qualityEvaluationCount,
      maximumCandidateCount: diagnostics.maximumCandidateCount,
      passCount: diagnostics.passCount,
      processedEdgeCount: diagnostics.processedEdgeCount,
      workItemCount: diagnostics.processedEdgeCount,
    },
  );
  return repaired;
};
