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
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';

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
    const terminalRoleBudget = Math.min(512, Math.max(64, current.length * 12));
    if (acceptStage(compactDisplayEdgePaths(
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        current,
        repairNodes,
        terminalRoleBudget,
      ),
    ))) return outcomeFor(current, current, currentReport);
    if (acceptStage(repairTerminalHandleAxisCrossings(current, repairNodes))) {
      return outcomeFor(current, current, currentReport);
    }
    if (
      currentReport.quality.reverseOverlap > 0
      || currentReport.quality.unexplainedRelatedOverlap > 0
      || currentReport.quality.tinyInteriorDoglegs > 0
      || currentReport.quality.hairpins > 0
    ) {
      if (acceptStage(repairSharedPortAndTinyTerminalLanes(current, repairNodes, 12))) {
        return outcomeFor(current, current, currentReport);
      }
    }
    if (getBaseReactFlowMeasuredRepairNeeds(currentReport).overlap) {
      if (acceptStage(repairResidualDisplayOverlaps(
        current,
        repairNodes,
        DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
        DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
      ))) return outcomeFor(current, current, currentReport);
    }
    const terminalSafeCandidate = keepNodeAnchoredTerminalCandidates(
      repairFastDisplayHardSafety(current, repairNodes),
      current,
      repairNodes,
    );
    if (acceptStage(terminalSafeCandidate)) {
      return outcomeFor(current, current, currentReport);
    }
    if (getBaseReactFlowMeasuredRepairNeeds(currentReport).terminal) {
      if (acceptStage(compactDisplayEdgePaths(
        repairAxisMismatchedTerminalsWithBoundedPortRoles(
          current,
          repairNodes,
          terminalRoleBudget,
        ),
      ))) return outcomeFor(current, current, currentReport);
    }
    for (let closurePass = 0; closurePass < 2; closurePass += 1) {
      const passStart = current;
      if (getBaseReactFlowMeasuredRepairNeeds(currentReport).overlap) {
        if (acceptStage(repairResidualDisplayOverlaps(
          current,
          repairNodes,
          DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
          DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
        ))) return outcomeFor(current, current, currentReport);
      }
      const closureSafeCandidate = keepNodeAnchoredTerminalCandidates(
        repairFastDisplayHardSafety(current, repairNodes),
        current,
        repairNodes,
      );
      if (acceptStage(closureSafeCandidate)) {
        return outcomeFor(current, current, currentReport);
      }
      if (getBaseReactFlowMeasuredRepairNeeds(currentReport).terminal) {
        if (acceptStage(compactDisplayEdgePaths(
          repairAxisMismatchedTerminalsWithBoundedPortRoles(
            current,
            repairNodes,
            terminalRoleBudget,
          ),
        ))) return outcomeFor(current, current, currentReport);
      }
      if (sameEdgeReferences(current, passStart)) break;
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

  const fastRepaired = repairFastDisplayHardSafety(current, repairNodes);
  const fastAnchoredRepaired = keepNodeAnchoredTerminalCandidates(
    fastRepaired,
    current,
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
  if (
    displayEdgesHaveNodeAttachedTerminals(anchoredSelected, repairNodes)
    && (
      anchoredSelectedReport.quality.strictCrossings > 0
      || anchoredSelectedReport.quality.hairpins > 0
      || anchoredSelectedReport.quality.tinyInteriorDoglegs > 0
      || anchoredSelectedReport.quality.unexplainedRelatedOverlap > 0
    )
  ) {
    const loopClosed = repairDisplayLoopShortcuts(
      anchoredSelected,
      repairNodes,
      128,
    );
    const fastClosed = repairFastDisplayHardSafety(loopClosed, repairNodes);
    const microClosed = repairDisplayMicroArtifacts(
      fastClosed,
      createBaseReactFlowDisplayMicroSafetyContext(fastClosed, repairNodes),
    );
    const residualClosed = repairSharedPortAndTinyTerminalLanes(
      microClosed,
      repairNodes,
      Math.min(32, Math.max(8, anchoredSelected.length)),
    );
    const residualClosedReport = reportFor(residualClosed);
    if (residualClosedReport.hardClean) {
      return outcomeFor(residualClosed, residualClosed, residualClosedReport);
    }
    const baselineQuality = anchoredSelectedReport.quality;
    const residualQuality = residualClosedReport.quality;
    const hardDefectsDoNotRegress = residualClosedReport.obstacleHits <= anchoredSelectedReport.obstacleHits
      && Number(!residualClosedReport.terminalsAttached) <= Number(!anchoredSelectedReport.terminalsAttached)
      && Number(!residualClosedReport.terminalsAnchored) <= Number(!anchoredSelectedReport.terminalsAnchored)
      && residualQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
      && residualQuality.strictCrossings <= baselineQuality.strictCrossings
      && residualQuality.reverseOverlap <= baselineQuality.reverseOverlap
      && residualQuality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
      && residualQuality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
      && residualQuality.shortEndpointStubs <= baselineQuality.shortEndpointStubs
      && residualQuality.tinyInteriorDoglegs <= baselineQuality.tinyInteriorDoglegs
      && residualQuality.hairpins <= baselineQuality.hairpins;
    const hardDefectsImprove = residualClosedReport.obstacleHits < anchoredSelectedReport.obstacleHits
      || Number(!residualClosedReport.terminalsAttached) < Number(!anchoredSelectedReport.terminalsAttached)
      || Number(!residualClosedReport.terminalsAnchored) < Number(!anchoredSelectedReport.terminalsAnchored)
      || residualQuality.nonOrthogonalSegments < baselineQuality.nonOrthogonalSegments
      || residualQuality.strictCrossings < baselineQuality.strictCrossings
      || residualQuality.reverseOverlap < baselineQuality.reverseOverlap
      || residualQuality.unrelatedOverlap < baselineQuality.unrelatedOverlap
      || residualQuality.unexplainedRelatedOverlap < baselineQuality.unexplainedRelatedOverlap
      || residualQuality.shortEndpointStubs < baselineQuality.shortEndpointStubs
      || residualQuality.tinyInteriorDoglegs < baselineQuality.tinyInteriorDoglegs
      || residualQuality.hairpins < baselineQuality.hairpins;
    if (hardDefectsDoNotRegress && hardDefectsImprove) {
      return outcomeFor(residualClosed, residualClosed, residualClosedReport);
    }
  }
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
