import type { Edge, Node } from '@xyflow/react';

import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { repairResidualDisplayOverlaps } from './baseReactFlowDisplayOverlapRepair';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';

export type BaseReactFlowResidualOverlapClosure<T extends Edge[]> = Readonly<{
  edges: T;
  report: BaseDisplayBoundedCandidateReport;
}>;

const reportOnlyHasRelatedOverlapDefect = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => {
  const quality = report.quality;
  return !report.hardClean
    && report.obstacleHits === 0
    && report.terminalsAttached
    && report.terminalsAnchored
    && quality.unexplainedRelatedOverlap > 0
    && quality.nonOrthogonalSegments === 0
    && quality.strictCrossings === 0
    && quality.reverseOverlap === 0
    && quality.unrelatedOverlap === 0
    && quality.shortEndpointStubs === 0
    && quality.tinyInteriorDoglegs === 0
    && quality.hairpins === 0;
};

/**
 * Closes a final exact related-lane overlap without re-entering the full route
 * search. The overlap repair may move one endpoint lane, so the transaction is
 * committed only after a bounded axis re-anchor and an exact full-graph gate.
 */
export const repairBaseReactFlowResidualOverlapAxisClosure = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  baselineReport: BaseDisplayBoundedCandidateReport,
): BaseReactFlowResidualOverlapClosure<T> => {
  if (!reportOnlyHasRelatedOverlapDefect(baselineReport)) {
    return { edges, report: baselineReport };
  }
  const overlapRepaired = repairResidualDisplayOverlaps(
    edges,
    nodes,
  ) as T;
  if (overlapRepaired === edges) return { edges, report: baselineReport };
  const overlapReport = getDisplayHardQualityGateReport(
    overlapRepaired,
    nodes,
    'polished',
  );
  if (overlapReport.hardClean) {
    return { edges: overlapRepaired, report: overlapReport };
  }
  if (
    !overlapReport.terminalsAttached
    || overlapReport.obstacleHits > 0
    || overlapReport.quality.unexplainedRelatedOverlap > 0
  ) return { edges, report: baselineReport };
  const axisRepaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(
    overlapRepaired,
    nodes,
    Math.min(96, Math.max(32, overlapRepaired.length * 2)),
  ) as T;
  if (axisRepaired === overlapRepaired) return { edges, report: baselineReport };
  const axisReport = getDisplayHardQualityGateReport(axisRepaired, nodes, 'polished');
  return axisReport.hardClean
    ? { edges: axisRepaired, report: axisReport }
    : { edges, report: baselineReport };
};
