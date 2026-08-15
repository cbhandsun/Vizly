import type { Edge, Node } from '@xyflow/react';

import { repairCrossedSpineWithOuterSkirt } from './baseReactFlowDisplayCrossedSpineSkirtRepair';
import {
  finalizeBaseReactFlowDisplayEdgesWithReport,
  type BaseReactFlowDisplayFinalizerOutcome,
} from './baseReactFlowDisplayFinalizer';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';

/**
 * Closes the exact route that is about to be rendered. Strict-crossing repair
 * runs before the terminal transaction because a graph-wide hard gate must not
 * reject a safe paired-port change merely due to an independent crossing.
 */
export const closeBaseReactFlowDisplayFinalHardContract = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): BaseReactFlowDisplayFinalizerOutcome<T> => {
  const baselineReport = getDisplayHardQualityGateReport(edges, nodes, 'polished');
  if (baselineReport.hardClean) return { edges, report: baselineReport };

  const strictClosedEdges = repairCrossedSpineWithOuterSkirt(edges, nodes) as T;
  const strictClosedReport = strictClosedEdges === edges
    ? baselineReport
    : getDisplayHardQualityGateReport(strictClosedEdges, nodes, 'polished');
  if (strictClosedReport.hardClean) {
    return { edges: strictClosedEdges, report: strictClosedReport };
  }

  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    strictClosedEdges,
    nodes,
    undefined,
    onPhaseTrace,
  );
  return finalized.report.hardClean
    ? finalized
    : { edges: strictClosedEdges, report: strictClosedReport };
};
