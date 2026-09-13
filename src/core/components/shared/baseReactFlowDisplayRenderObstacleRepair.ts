import type { Edge, Node } from '@xyflow/react';

import type { DisplaySoftQualityOptions } from './baseReactFlowDisplayEvaluation';
import {
  createDisplayObstacleRepairDiagnostics,
  repairDisplayObstacleHits,
} from './baseReactFlowDisplayObstacleRepair';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export const repairDisplayObstacleHitsWithTrace = <T extends Edge[]>({
  edges,
  nodes,
  layoutDirection,
  options,
  onPhaseTrace,
}: {
  edges: T;
  nodes: Node[];
  layoutDirection: string;
  options: DisplaySoftQualityOptions;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): T => {
  const timer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
      phase: 'seed-interactive-finish-obstacle',
      candidateCount: edges.length,
      onTrace: onPhaseTrace,
    })
    : null;
  const diagnostics = createDisplayObstacleRepairDiagnostics();
  const repaired = repairDisplayObstacleHits(
    edges,
    nodes,
    layoutDirection,
    { ...options, diagnostics },
  );
  timer?.finish(
    repaired === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, repaired),
    {
      candidateCount: diagnostics.generatedCandidateCount,
      evaluationCount: diagnostics.evaluatedCandidateCount,
      workItemCount: diagnostics.processedEdgeCount + diagnostics.quickAcceptedCount,
      budgetCount: diagnostics.initialObstacleHits,
      underBudgetCount: diagnostics.finalObstacleHits,
      maximumCandidateCount: diagnostics.scoredCandidateCount,
    },
  );
  return repaired;
};
