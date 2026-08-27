import type { Edge, Node } from '@xyflow/react';

import { repairCrossedSpineWithOuterSkirt } from './baseReactFlowDisplayCrossedSpineSkirtRepair';
import {
  finalizeBaseReactFlowDisplayEdgesWithReport,
  type BaseReactFlowDisplayFinalizerOutcome,
} from './baseReactFlowDisplayFinalizer';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';

/**
 * Closes the exact route that is about to be rendered. Strict-crossing repair
 * runs before the terminal transaction because a graph-wide hard gate must not
 * reject a safe paired-port change merely due to an independent crossing.
 */
export const closeBaseReactFlowDisplayFinalHardContract = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
  evaluation?: BaseReactFlowFinalEndpointEvaluation,
): BaseReactFlowDisplayFinalizerOutcome<T> => {
  const baselineReport = evaluation?.hardReport(edges)
    ?? getDisplayHardQualityGateReport(edges, nodes, 'polished');
  if (baselineReport.hardClean) return { edges, report: baselineReport };

  const strictClosedEdges = repairCrossedSpineWithOuterSkirt(edges, nodes) as T;
  const strictClosedReport = strictClosedEdges === edges
    ? baselineReport
    : evaluation?.hardReport(strictClosedEdges)
      ?? getDisplayHardQualityGateReport(strictClosedEdges, nodes, 'polished');
  if (strictClosedReport.hardClean) {
    return { edges: strictClosedEdges, report: strictClosedReport };
  }

  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    strictClosedEdges,
    nodes,
    undefined,
    onPhaseTrace,
    false,
    true,
    evaluation,
  );
  return finalized.report.hardClean
    ? finalized
    : { edges: strictClosedEdges, report: strictClosedReport };
};
