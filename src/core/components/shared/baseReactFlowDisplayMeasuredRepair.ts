import type { Edge, Node } from '@xyflow/react';

import {
  anchorComputedDisplayEdgeEndpoints,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { repairDisplayObstacleHits } from './baseReactFlowDisplayObstacleRepair';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  repairResidualDisplayOverlaps,
} from './baseReactFlowDisplayOverlapRepair';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import { repairTerminalHandleAxisCrossings } from './baseReactFlowTerminalAxisRepair';
import { repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import {
  chooseFinalObstacleAwarePolishCandidate,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
import {
  displayEdgesHaveNodeAttachedTerminals,
  keepNodeAnchoredTerminalCandidates,
} from './baseReactFlowTerminalAxisRepair';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS } from './baseReactFlowDisplayRenderPipeline';
import { getBaseReactFlowMeasuredRepairNeeds } from './baseReactFlowDisplayMeasuredRepairPlan';
import { repairSharedPortAndTinyTerminalLanes } from './baseReactFlowDisplaySharedPortLaneRepair';

export type BaseReactFlowMeasuredDisplayInitialEvaluation = Readonly<{
  edges: Edge[];
  inputNodes: Node[];
  repairNodes: Node[];
  report: BaseDisplayBoundedCandidateReport;
}>;

export type BaseReactFlowMeasuredDisplayRepairOutcome = Readonly<{
  edges: Edge[];
  report: BaseDisplayBoundedCandidateReport;
}>;

const sameEdgeReferences = (first: Edge[], second: Edge[]): boolean => (
  first === second
  || (
    first.length === second.length
    && first.every((edge, index) => edge === second[index])
  )
);

export const repairBaseReactFlowMeasuredDisplayEdgesWithReport = (
  edges: Edge[],
  nodes: Node[],
  initialEvaluation?: BaseReactFlowMeasuredDisplayInitialEvaluation,
): BaseReactFlowMeasuredDisplayRepairOutcome => {
  const trustedInitialEvaluation = initialEvaluation?.edges === edges
    && initialEvaluation.inputNodes === nodes
    ? initialEvaluation
    : undefined;
  const repairNodes = trustedInitialEvaluation?.repairNodes ?? withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const reportFor = (
    candidate: Edge[],
    previousEdges?: Edge[],
    previousReport?: BaseDisplayBoundedCandidateReport,
  ): BaseDisplayBoundedCandidateReport => (
    previousEdges
      && previousReport
      && sameEdgeReferences(candidate, previousEdges)
      ? previousReport
      : getDisplayHardQualityGateReport(candidate, repairNodes, 'polished')
  );
  const outcomeFor = (
    candidate: Edge[],
    previousEdges?: Edge[],
    previousReport?: BaseDisplayBoundedCandidateReport,
  ): BaseReactFlowMeasuredDisplayRepairOutcome => ({
    edges: candidate,
    report: reportFor(candidate, previousEdges, previousReport),
  });
  if (edges.length === 0 || nodes.length === 0) {
    return outcomeFor(
      edges,
      trustedInitialEvaluation?.edges,
      trustedInitialEvaluation?.report,
    );
  }
  const compacted = compactDisplayEdgePaths(repairTerminalBoundaryStairs(
    anchorComputedDisplayEdgeEndpoints(edges, repairNodes),
    repairNodes,
  ));
  let current = compacted;
  const compactedReport = reportFor(
    compacted,
    edges,
    trustedInitialEvaluation?.report,
  );
  let currentReport = compactedReport;
  if (currentReport.hardClean) return outcomeFor(current, current, currentReport);

  const layoutDirection = String((compacted[0]?.data as any)?.layoutDirection || 'TB');
  const stageCandidates: Edge[][] = [];
  const acceptStage = (candidate: Edge[]): boolean => {
    const nextReport = reportFor(candidate, current, currentReport);
    if (!sameEdgeReferences(candidate, current)) stageCandidates.push(candidate);
    current = candidate;
    currentReport = nextReport;
    return nextReport.hardClean;
  };

  if (
    currentReport.quality.reverseOverlap > 0
    || currentReport.quality.unexplainedRelatedOverlap > 0
    || currentReport.quality.tinyInteriorDoglegs > 0
  ) {
    if (acceptStage(repairSharedPortAndTinyTerminalLanes(current, repairNodes, 8))) {
      return outcomeFor(current, current, currentReport);
    }
  }

  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).obstacle) {
    if (acceptStage(repairDisplayObstacleHits(
      current,
      repairNodes,
      layoutDirection,
      DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
    ))) return outcomeFor(current, current, currentReport);
  }
  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).overlap) {
    if (acceptStage(repairResidualDisplayOverlaps(
      current,
      repairNodes,
      DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
      DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
    ))) return outcomeFor(current, current, currentReport);
  }
  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).strict) {
    if (acceptStage(repairFinalResidualStrictCrossings(current, repairNodes))) {
      return outcomeFor(current, current, currentReport);
    }
  }
  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).terminal) {
    const beforeTerminal = current;
    if (acceptStage(repairTerminalHandleAxisCrossings(current, repairNodes))) {
      return outcomeFor(current, current, currentReport);
    }
    if (
      !sameEdgeReferences(current, beforeTerminal)
      && getBaseReactFlowMeasuredRepairNeeds(currentReport).strict
    ) {
      if (acceptStage(compactDisplayEdgePaths(
        repairFinalResidualStrictCrossings(current, repairNodes),
      ))) return outcomeFor(current, current, currentReport);
    }
  }

  const fastRepaired = repairFastDisplayHardSafety(compacted, repairNodes);
  const fastAnchoredRepaired = keepNodeAnchoredTerminalCandidates(
    fastRepaired,
    compacted,
    repairNodes,
  );
  const fastStrictRepaired = compactDisplayEdgePaths(
    repairFinalResidualStrictCrossings(fastAnchoredRepaired, repairNodes),
  );
  const fastStrictReport = reportFor(fastStrictRepaired);
  if (fastStrictReport.hardClean) {
    return outcomeFor(fastStrictRepaired, fastStrictRepaired, fastStrictReport);
  }

  const selected = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    compacted,
    ...stageCandidates,
    fastRepaired,
    fastAnchoredRepaired,
    fastStrictRepaired,
  );
  const anchoredSelected = compactDisplayEdgePaths(
    anchorComputedDisplayEdgeEndpoints(selected, repairNodes),
  );
  const anchoredSelectedReport = reportFor(
    anchoredSelected,
    compacted,
    compactedReport,
  );
  if (displayEdgesHaveNodeAttachedTerminals(anchoredSelected, repairNodes)) {
    return outcomeFor(anchoredSelected, anchoredSelected, anchoredSelectedReport);
  }
  return outcomeFor(compacted, compacted, compactedReport);
};

export const repairBaseReactFlowMeasuredDisplayEdges = (
  edges: Edge[],
  nodes: Node[],
  initialEvaluation?: BaseReactFlowMeasuredDisplayInitialEvaluation,
): Edge[] => repairBaseReactFlowMeasuredDisplayEdgesWithReport(
  edges,
  nodes,
  initialEvaluation,
).edges;
