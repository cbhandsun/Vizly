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
import { DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS } from './baseReactFlowDisplayRenderPipeline';
import { getBaseReactFlowMeasuredRepairNeeds } from './baseReactFlowDisplayMeasuredRepairPlan';
import { repairSharedPortAndTinyTerminalLanes } from './baseReactFlowDisplaySharedPortLaneRepair';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import {
  createBaseDisplayHardGateMemo,
  type BaseDisplayHardGateMemo,
} from './baseReactFlowDisplayHardGateMemo';
import type {
  BaseReactFlowEvaluationMetrics,
  BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import { getChangedBaseReactFlowDisplayRoutingIndexes } from './baseReactFlowDisplayRoutingTransaction';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseMetrics,
  type DisplayRoutingPhaseName,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export type BaseReactFlowMeasuredDisplayInitialEvaluation = Readonly<{
  edges: Edge[];
  inputNodes: Node[];
  repairNodes: Node[];
  report: BaseDisplayBoundedCandidateReport;
  evaluation?: BaseReactFlowFinalEndpointEvaluation;
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

const isStrictDominatedMeasuredReport = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => report.terminalsAttached
  && report.obstacleHits === 0
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.strictCrossings > 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0;

export const repairBaseReactFlowMeasuredDisplayEdgesWithReport = (
  edges: Edge[],
  nodes: Node[],
  initialEvaluation?: BaseReactFlowMeasuredDisplayInitialEvaluation,
  deferStrictDominatedResult = false,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
  allowCompoundResidualClosure = true,
  stopAfterObstacleFailure = false,
): BaseReactFlowMeasuredDisplayRepairOutcome => {
  const trustedInitialEvaluation = initialEvaluation?.edges === edges
    && initialEvaluation.inputNodes === nodes
    ? initialEvaluation
    : undefined;
  const repairNodes = trustedInitialEvaluation?.repairNodes ?? withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const sharedEvaluation = trustedInitialEvaluation?.evaluation?.nodes === repairNodes
    ? trustedInitialEvaluation.evaluation
    : undefined;
  let hardGateMemo: BaseDisplayHardGateMemo | undefined;
  const getLocalHardGateMemo = (): BaseDisplayHardGateMemo => {
    hardGateMemo ??= createBaseDisplayHardGateMemo(
      repairNodes,
      createDisplayTerminalValidationSnapshot(repairNodes),
    );
    return hardGateMemo;
  };
  if (trustedInitialEvaluation) {
    if (sharedEvaluation) {
      sharedEvaluation.rememberHardReport(edges, trustedInitialEvaluation.report);
    } else {
      getLocalHardGateMemo().rememberReport(edges, trustedInitialEvaluation.report);
    }
  }
  const reportFor = (
    candidate: Edge[],
    previousEdges?: Edge[],
    previousReport?: BaseDisplayBoundedCandidateReport,
  ): BaseDisplayBoundedCandidateReport => (
    previousEdges
      && previousReport
      && sameEdgeReferences(candidate, previousEdges)
      ? previousReport
      : sharedEvaluation && previousEdges
        ? sharedEvaluation.hardReportChanged(
          previousEdges,
          candidate,
          getChangedBaseReactFlowDisplayRoutingIndexes(previousEdges, candidate),
        )
        : sharedEvaluation?.hardReport(candidate)
          ?? getLocalHardGateMemo().getReport(candidate, repairNodes, 'polished')
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
  const normalizeTimer = startDisplayRoutingPhaseTrace({
    phase: 'measured-repair-normalize',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const compacted = compactDisplayEdgePaths(repairTerminalBoundaryStairs(
    anchorComputedDisplayEdgeEndpoints(edges, repairNodes),
    repairNodes,
  ));
  normalizeTimer.finish(
    sameEdgeReferences(compacted, edges) ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, compacted),
  );
  let current = compacted;
  const compactedReport = reportFor(
    compacted,
    edges,
    trustedInitialEvaluation?.report,
  );
  let currentReport = compactedReport;
  if (currentReport.hardClean) return outcomeFor(current, current, currentReport);
  if (deferStrictDominatedResult && isStrictDominatedMeasuredReport(currentReport)) {
    return outcomeFor(current, current, currentReport);
  }

  const layoutDirection = typeof compacted[0]?.data?.layoutDirection === 'string'
    ? compacted[0].data.layoutDirection
    : 'TB';
  const stageCandidates: Edge[][] = [];
  const acceptStage = (candidate: Edge[]): boolean => {
    const nextReport = reportFor(candidate, current, currentReport);
    if (!sameEdgeReferences(candidate, current)) stageCandidates.push(candidate);
    current = candidate;
    currentReport = nextReport;
    return nextReport.hardClean;
  };
  type MeasuredStagePhase = Extract<
    DisplayRoutingPhaseName,
    | 'measured-repair-lanes'
    | 'measured-repair-obstacle'
    | 'measured-repair-overlap'
    | 'measured-repair-strict'
    | 'measured-repair-terminal'
    | 'measured-repair-fallback'
  >;
  const readEvaluationMetrics = (): BaseReactFlowEvaluationMetrics => (
    sharedEvaluation?.readMetrics()
      ?? hardGateMemo?.readMetrics()
      ?? { evaluationCount: 0, cacheHitCount: 0, scannedNodeCount: 0, scannedEdgePairCount: 0 }
  );
  const diffMetrics = (
    before: BaseReactFlowEvaluationMetrics,
    after: BaseReactFlowEvaluationMetrics,
  ): DisplayRoutingPhaseMetrics => ({
    evaluationCount: Math.max(0, after.evaluationCount - before.evaluationCount),
    cacheHitCount: Math.max(0, after.cacheHitCount - before.cacheHitCount),
    scannedNodeCount: Math.max(0, after.scannedNodeCount - before.scannedNodeCount),
    scannedEdgePairCount: Math.max(
      0,
      after.scannedEdgePairCount - before.scannedEdgePairCount,
    ),
  });
  const runStage = (
    phase: MeasuredStagePhase,
    createCandidate: () => Edge[],
  ): boolean => {
    const baseline = current;
    const metricsBefore = readEvaluationMetrics();
    const timer = startDisplayRoutingPhaseTrace({
      phase,
      candidateCount: baseline.length,
      onTrace: onPhaseTrace,
    });
    const hardClean = acceptStage(createCandidate());
    timer.finish(
      hardClean ? 'accepted' : sameEdgeReferences(baseline, current) ? 'skip' : 'fallback',
      countChangedRoutingItems(baseline, current),
      diffMetrics(metricsBefore, readEvaluationMetrics()),
    );
    return hardClean;
  };

  if (
    currentReport.quality.reverseOverlap > 0
    || currentReport.quality.unexplainedRelatedOverlap > 0
    || currentReport.quality.tinyInteriorDoglegs > 0
  ) {
    if (runStage('measured-repair-lanes', () => (
      repairSharedPortAndTinyTerminalLanes(current, repairNodes, 8)
    ))) {
      return outcomeFor(current, current, currentReport);
    }
  }

  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).obstacle) {
    const obstacleHardClean = runStage('measured-repair-obstacle', () => repairDisplayObstacleHits(
      current,
      repairNodes,
      layoutDirection,
      DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
    ));
    if (obstacleHardClean) return outcomeFor(current, current, currentReport);
    if (stopAfterObstacleFailure && currentReport.obstacleHits > 0) {
      return outcomeFor(current, current, currentReport);
    }
    if (deferStrictDominatedResult && isStrictDominatedMeasuredReport(currentReport)) {
      return outcomeFor(current, current, currentReport);
    }
  }
  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).overlap) {
    const overlapHardClean = runStage('measured-repair-overlap', () => repairResidualDisplayOverlaps(
      current,
      repairNodes,
      DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
      DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
    ));
    if (overlapHardClean) return outcomeFor(current, current, currentReport);
  }
  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).strict) {
    const strictHardClean = runStage('measured-repair-strict', () => (
      repairFinalResidualStrictCrossings(current, repairNodes)
    ));
    if (strictHardClean) {
      return outcomeFor(current, current, currentReport);
    }
  }
  if (getBaseReactFlowMeasuredRepairNeeds(currentReport).terminal) {
    const beforeTerminal = current;
    const terminalRoleBudget = Math.min(512, Math.max(64, current.length * 12));
    if (runStage('measured-repair-terminal', () => compactDisplayEdgePaths(
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        current,
        repairNodes,
        terminalRoleBudget,
      ),
    ))) return outcomeFor(current, current, currentReport);
    if (runStage('measured-repair-terminal', () => (
      repairTerminalHandleAxisCrossings(current, repairNodes)
    ))) {
      return outcomeFor(current, current, currentReport);
    }
    if (
      currentReport.quality.reverseOverlap > 0
      || currentReport.quality.unexplainedRelatedOverlap > 0
      || currentReport.quality.tinyInteriorDoglegs > 0
      || currentReport.quality.hairpins > 0
    ) {
      if (runStage('measured-repair-terminal', () => (
        repairSharedPortAndTinyTerminalLanes(current, repairNodes, 12)
      ))) {
        return outcomeFor(current, current, currentReport);
      }
    }
    if (getBaseReactFlowMeasuredRepairNeeds(currentReport).overlap) {
      if (runStage('measured-repair-terminal', () => repairResidualDisplayOverlaps(
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
    if (runStage('measured-repair-terminal', () => terminalSafeCandidate)) {
      return outcomeFor(current, current, currentReport);
    }
    if (getBaseReactFlowMeasuredRepairNeeds(currentReport).terminal) {
      if (runStage('measured-repair-terminal', () => compactDisplayEdgePaths(
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
        if (runStage('measured-repair-terminal', () => repairResidualDisplayOverlaps(
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
      if (runStage('measured-repair-terminal', () => closureSafeCandidate)) {
        return outcomeFor(current, current, currentReport);
      }
      if (getBaseReactFlowMeasuredRepairNeeds(currentReport).terminal) {
        if (runStage('measured-repair-terminal', () => compactDisplayEdgePaths(
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
      if (runStage('measured-repair-terminal', () => compactDisplayEdgePaths(
        repairFinalResidualStrictCrossings(current, repairNodes),
      ))) return outcomeFor(current, current, currentReport);
    }
  }

  const fallbackTimer = startDisplayRoutingPhaseTrace({
    phase: 'measured-repair-fallback',
    candidateCount: current.length,
    onTrace: onPhaseTrace,
  });
  const fallbackBaseline = current;
  const fallbackMetricsBefore = readEvaluationMetrics();
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
  fallbackTimer.finish(
    fastStrictReport.hardClean ? 'accepted' : 'fallback',
    countChangedRoutingItems(fallbackBaseline, fastStrictRepaired),
    diffMetrics(fallbackMetricsBefore, readEvaluationMetrics()),
  );
  if (fastStrictReport.hardClean) {
    return outcomeFor(fastStrictRepaired, fastStrictRepaired, fastStrictReport);
  }

  const selectionTimer = startDisplayRoutingPhaseTrace({
    phase: 'measured-repair-selection',
    candidateCount: stageCandidates.length + 4,
    onTrace: onPhaseTrace,
  });
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
  selectionTimer.finish(
    sameEdgeReferences(anchoredSelected, compacted) ? 'skip' : 'accepted',
    countChangedRoutingItems(compacted, anchoredSelected),
  );
  if (
    allowCompoundResidualClosure
    && displayEdgesHaveNodeAttachedTerminals(anchoredSelected, repairNodes)
    && (
      anchoredSelectedReport.quality.strictCrossings > 0
      || anchoredSelectedReport.quality.hairpins > 0
      || anchoredSelectedReport.quality.tinyInteriorDoglegs > 0
      || anchoredSelectedReport.quality.unexplainedRelatedOverlap > 0
    )
  ) {
    const residualTimer = startDisplayRoutingPhaseTrace({
      phase: 'measured-repair-residual',
      candidateCount: anchoredSelected.length,
      onTrace: onPhaseTrace,
    });
    const residualMetricsBefore = readEvaluationMetrics();
    const loopClosed = repairDisplayLoopShortcuts(
      anchoredSelected,
      repairNodes,
      128,
      strictCandidate => repairFastDisplayHardSafety(
        repairAxisMismatchedTerminalsWithBoundedPortRoles(
          repairFinalResidualStrictCrossings(strictCandidate, repairNodes),
          repairNodes,
          16,
        ),
        repairNodes,
      ),
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
      residualTimer.finish(
        'accepted',
        countChangedRoutingItems(anchoredSelected, residualClosed),
        diffMetrics(residualMetricsBefore, readEvaluationMetrics()),
      );
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
      residualTimer.finish(
        'accepted',
        countChangedRoutingItems(anchoredSelected, residualClosed),
        diffMetrics(residualMetricsBefore, readEvaluationMetrics()),
      );
      return outcomeFor(residualClosed, residualClosed, residualClosedReport);
    }
    residualTimer.finish(
      'rejected',
      countChangedRoutingItems(anchoredSelected, residualClosed),
      diffMetrics(residualMetricsBefore, readEvaluationMetrics()),
    );
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
