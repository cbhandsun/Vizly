import type { Edge, Node } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { getEdgePath } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairOverextendedTargetTrunkCorridors } from '../../strategies/shared/edgeOverextendedTargetTrunkRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { repairRenderSafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import {
  changedEdgesObstacleHitsDoNotRegress,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { commercialEdgeDetoursDoNotRegress } from './baseReactFlowDisplayCommercialDetourGuard';
import {
  buildCommercialBranchedTerminalShortcutCandidates,
  buildCommercialSameSideRectangularShortcutPaths,
  buildCommercialParallelTerminalCorridorShortcutPaths,
  buildCommercialSourceTerminalShortcutCandidates,
  buildCommercialTerminalShortcutCandidates,
} from './baseReactFlowDisplayCommercialTerminalShortcut';
import { buildCommercialPathSearchTerminalCandidates } from './baseReactFlowDisplayCommercialPathSearch';
import {
  passesBaseReactFlowCommercialFinalDisplayGate,
  passesBaseReactFlowFinalDisplayGate,
  type BaseReactFlowFinalEndpointOrderOptions,
} from './baseReactFlowDisplayFinalEndpointGate';
import {
  buildTerminalPreservingDirectShortcutCandidates,
  repairDisplayLoopShortcuts,
} from './baseReactFlowDisplayLoopShortcutRepair';
import {
  displayPathLength,
  getDisplayComputedPath,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { commercialRepairOutputIsEquivalent } from './baseReactFlowDisplayCommercialRepairContract';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import { withDisplayLocalShortcutSoftCrossingBridge } from './baseReactFlowDisplaySoftCrossingBridge';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { preservesCommercialTrueTrunkMembership } from './baseReactFlowDisplayTrueTrunkContract';
import { startDisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';

const FINAL_COMMERCIAL_DETOUR_QUALITY_BUDGET = 128;
const FINAL_COMMERCIAL_DETOUR_PASSES = 1;
const FINAL_COMMERCIAL_OUTER_STAIR_EVALUATIONS = 16;
const FINAL_COMMERCIAL_TERMINAL_SHORTCUT_EVALUATIONS = 24;
const FINAL_COMMERCIAL_SOURCE_SHORTCUT_EVALUATIONS = 32;
const FINAL_COMMERCIAL_SOURCE_SHORTCUT_EVALUATIONS_PER_EDGE = 8;
const FINAL_COMMERCIAL_PHASES = [
  'final-commercial-clearance',
  'final-commercial-terminal-preserving',
  'final-commercial-terminal-changing',
  'final-commercial-source-stairs',
  'final-commercial-evaluation',
  'final-commercial-safety-closure',
] as const;

export const traceSkippedFinalCommercialDetours = (
  candidateCount: number,
  onPhaseTrace: BaseReactFlowFinalEndpointOrderOptions['onPhaseTrace'],
): void => {
  for (const phase of FINAL_COMMERCIAL_PHASES) {
    startDisplayRoutingPhaseTrace({ phase, candidateCount, onTrace: onPhaseTrace })
      .finish('skip');
  }
};

const withTerminalPreservingOuterStairPath = (
  edge: Edge,
  path: ReturnType<typeof getDisplayComputedPath>,
): Edge => {
  const changed = withDisplayComputedPath(edge, path);
  if (changed.data?.displayNodeClearanceRepaired !== true) return changed;
  const data = { ...changed.data };
  delete data.displayNodeClearanceRepaired;
  return { ...changed, data };
};

const repairTerminalPreservingOuterStairs = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: ReturnType<typeof createBaseReactFlowFinalEndpointEvaluation>,
): T => {
  let best = edges;
  let bestReport = evaluation.hardReport(best);
  if (!bestReport.hardClean) return edges;
  let evaluations = 0;
  const rankedEdgeIndexes = edges.map((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    const first = path[0];
    const last = path.at(-1);
    if (!first || !last || path.length < 4) return null;
    const direct = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
    return { edgeIndex, excessLength: displayPathLength(path) - direct };
  }).filter((entry): entry is { edgeIndex: number; excessLength: number } => Boolean(entry))
    .sort((first, second) => (
      second.excessLength - first.excessLength || first.edgeIndex - second.edgeIndex
    ));

  for (const { edgeIndex } of rankedEdgeIndexes) {
    if (options.eligibleEdgeIds && !options.eligibleEdgeIds.has(edges[edgeIndex].id)) continue;
    const baselinePath = getDisplayComputedPath(best[edgeIndex]);
    const shortcutPaths = [
      ...buildTerminalPreservingDirectShortcutCandidates(baselinePath),
      ...buildCommercialParallelTerminalCorridorShortcutPaths(
        baselinePath,
        nodes,
        best[edgeIndex],
      ),
      ...buildCommercialSameSideRectangularShortcutPaths(best[edgeIndex], nodes, best),
    ];
    for (const candidatePath of shortcutPaths) {
      if (evaluations >= FINAL_COMMERCIAL_OUTER_STAIR_EVALUATIONS) return best;
      evaluations += 1;
      const baselineLength = displayPathLength(baselinePath);
      const candidateLength = displayPathLength(candidatePath);
      const reducesBendsAtEqualLength = candidatePath.length < baselinePath.length
        && candidateLength <= baselineLength + 0.5;
      if (candidateLength >= baselineLength - 0.5 && !reducesBendsAtEqualLength) continue;
      const candidate = best.map((edge, index) => (
        index === edgeIndex
          ? withTerminalPreservingOuterStairPath(edge, candidatePath)
          : edge
      )) as T;
      const candidateEdge = candidate[edgeIndex];
      const candidateReport = evaluation.hardReport(candidate);
      if (
        !candidateEdge
        || !candidateReport.hardClean
        || candidateReport.quality.totalLength > bestReport.quality.totalLength + 0.5
        || (
          candidateReport.quality.totalLength >= bestReport.quality.totalLength - 0.5
          && candidateReport.quality.bends >= bestReport.quality.bends
        )
        || candidateReport.quality.detourPenalty > bestReport.quality.detourPenalty
        || scoreNodeClearanceRisk(
          candidatePath,
          nodes,
          candidateEdge,
          COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        ) > scoreNodeClearanceRisk(
          baselinePath,
          nodes,
          best[edgeIndex],
          COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        )
        || evaluation.unsafeEndpointStubs(candidate) > evaluation.unsafeEndpointStubs(best)
        || !changedEdgesObstacleHitsDoNotRegress(best, candidate, [edgeIndex], nodes)
        || !visualPolishHardQualityDoesNotRegress(
          bestReport.quality,
          candidateReport.quality,
        )
        || !passesBaseReactFlowCommercialFinalDisplayGate(
          best,
          candidate,
          [edgeIndex],
          options,
          evaluation,
        )
      ) continue;
      best = candidate;
      bestReport = candidateReport;
      break;
    }
  }
  return best;
};

const repairTerminalChangingOuterStairs = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: ReturnType<typeof createBaseReactFlowFinalEndpointEvaluation>,
): T => {
  let best = edges;
  let bestReport = evaluation.hardReport(best);
  if (!bestReport.hardClean) return edges;
  let evaluations = 0;
  const rankedEdgeIndexes = edges.map((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    const first = path[0];
    const last = path.at(-1);
    if (!first || !last || path.length < 6) return null;
    const direct = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
    return { edgeIndex, excessLength: displayPathLength(path) - direct };
  }).filter((entry): entry is { edgeIndex: number; excessLength: number } => Boolean(entry))
    .sort((first, second) => (
      second.excessLength - first.excessLength || first.edgeIndex - second.edgeIndex
    ));

  for (const { edgeIndex } of rankedEdgeIndexes) {
    if (options.eligibleEdgeIds && !options.eligibleEdgeIds.has(edges[edgeIndex].id)) continue;
    const baselinePath = getDisplayComputedPath(best[edgeIndex]);
    const terminalCandidates = buildCommercialTerminalShortcutCandidates(
      best[edgeIndex],
      nodes,
    ).flatMap(candidate => [
      candidate,
      ...buildCommercialBranchedTerminalShortcutCandidates(candidate),
    ]);
    for (const candidateEdge of terminalCandidates) {
      if (evaluations >= FINAL_COMMERCIAL_TERMINAL_SHORTCUT_EVALUATIONS) return best;
      evaluations += 1;
      const candidatePath = getDisplayComputedPath(candidateEdge);
      if (scoreNodeClearanceRisk(
        candidatePath,
        nodes,
        candidateEdge,
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ) > scoreNodeClearanceRisk(
        baselinePath,
        nodes,
        best[edgeIndex],
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      )) continue;
      const candidate = best.map((edge, index) => (
        index === edgeIndex ? candidateEdge : edge
      )) as T;
      candidate[edgeIndex] = withDisplayLocalShortcutSoftCrossingBridge(
        candidateEdge,
        candidate,
        displayPathLength(baselinePath) - displayPathLength(candidatePath),
      );
      if (!changedEdgesObstacleHitsDoNotRegress(best, candidate, [edgeIndex], nodes)) continue;
      if (evaluation.unsafeEndpointStubs(candidate) > evaluation.unsafeEndpointStubs(best)) continue;
      const candidateReport = evaluation.hardReport(candidate);
      if (
        !candidateReport.hardClean
        || candidateReport.quality.totalLength >= bestReport.quality.totalLength
        || candidateReport.quality.detourPenalty > bestReport.quality.detourPenalty
        || !preservesCommercialTrueTrunkMembership(
          evaluation.endpointOrder(best).legalSharedTrunks,
          evaluation.endpointOrder(candidate).legalSharedTrunks,
        )
        || !visualPolishHardQualityDoesNotRegress(
          bestReport.quality,
          candidateReport.quality,
        )
        || !passesBaseReactFlowFinalDisplayGate(
          best,
          candidate,
          [edgeIndex],
          options,
          evaluation,
        )
      ) continue;
      best = candidate;
      bestReport = candidateReport;
      break;
    }
  }
  return best;
};

const repairSourceTerminalOuterStairs = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: ReturnType<typeof createBaseReactFlowFinalEndpointEvaluation>,
): T => {
  let best = edges;
  let bestReport = evaluation.hardReport(best);
  let evaluations = 0;
  const rankedEdgeIndexes = edges.map((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    const first = path[0];
    const last = path.at(-1);
    if (!first || !last || path.length < 5) return null;
    const direct = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
    return {
      bends: Math.max(0, path.length - 2),
      edgeIndex,
      excessLength: displayPathLength(path) - direct,
    };
  }).filter((entry): entry is {
    bends: number;
    edgeIndex: number;
    excessLength: number;
  } => Boolean(entry))
    .sort((first, second) => (
      second.bends - first.bends
      || second.excessLength - first.excessLength
      || first.edgeIndex - second.edgeIndex
    ));

  for (const { edgeIndex } of rankedEdgeIndexes) {
    if (options.eligibleEdgeIds && !options.eligibleEdgeIds.has(edges[edgeIndex].id)) continue;
    const baselinePath = getDisplayComputedPath(best[edgeIndex]);
    let edgeEvaluations = 0;
    const hardDefectCandidates = !bestReport.hardClean
      && !options.eligibleEdgeIds
      && baselinePath.length === 5
      ? buildCommercialPathSearchTerminalCandidates(best[edgeIndex], nodes, best)
      : [];
    const shortcutCandidates = buildCommercialSourceTerminalShortcutCandidates(
      best[edgeIndex],
      nodes,
    ).flatMap(candidate => [
      ...buildCommercialBranchedTerminalShortcutCandidates(candidate),
      candidate,
    ]);
    for (const candidateEdge of [...hardDefectCandidates, ...shortcutCandidates]) {
      if (evaluations >= FINAL_COMMERCIAL_SOURCE_SHORTCUT_EVALUATIONS) return best;
      if (edgeEvaluations >= FINAL_COMMERCIAL_SOURCE_SHORTCUT_EVALUATIONS_PER_EDGE) break;
      evaluations += 1;
      edgeEvaluations += 1;
      const candidatePath = getDisplayComputedPath(candidateEdge);
      if (scoreNodeClearanceRisk(
        candidatePath,
        nodes,
        candidateEdge,
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ) > scoreNodeClearanceRisk(
        baselinePath,
        nodes,
        best[edgeIndex],
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      )) continue;
      const candidate = best.map((edge, index) => (
        index === edgeIndex ? candidateEdge : edge
      )) as T;
      candidate[edgeIndex] = withDisplayLocalShortcutSoftCrossingBridge(
        candidateEdge,
        candidate,
        displayPathLength(baselinePath) - displayPathLength(candidatePath),
      );
      if (!changedEdgesObstacleHitsDoNotRegress(best, candidate, [edgeIndex], nodes)) continue;
      if (evaluation.unsafeEndpointStubs(candidate) > evaluation.unsafeEndpointStubs(best)) continue;
      const candidateReport = evaluation.hardReport(candidate);
      const allowedDetourPenalty = bestReport.quality.detourPenalty
        + (bestReport.hardClean ? 0 : FINAL_COMMERCIAL_DETOUR_QUALITY_BUDGET);
      if (
        !candidateReport.hardClean
        || candidateReport.quality.totalLength >= bestReport.quality.totalLength
        || candidateReport.quality.detourPenalty > allowedDetourPenalty
        || !preservesCommercialTrueTrunkMembership(
          evaluation.endpointOrder(best).legalSharedTrunks,
          evaluation.endpointOrder(candidate).legalSharedTrunks,
        )
        || !visualPolishHardQualityDoesNotRegress(
          bestReport.quality,
          candidateReport.quality,
        )
        || !passesBaseReactFlowFinalDisplayGate(
          best,
          candidate,
          [edgeIndex],
          options,
          evaluation,
        )
      ) continue;
      best = candidate;
      bestReport = candidateReport;
      break;
    }
  }
  return best;
};

export const repairBaseReactFlowFinalCommercialDetours = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions & Readonly<{
    skipLoopShortcut?: boolean;
    onFinalEvaluation?: (evaluation: Readonly<{
      edges: readonly Edge[];
      closureReady: boolean;
    }>) => void;
  }> = {},
): T => {
  if (edges.length === 0 || nodes.length === 0) {
    options.onFinalEvaluation?.({ edges, closureReady: false });
    return edges;
  }
  const evaluation = options.evaluation
    ?? createBaseReactFlowFinalEndpointEvaluation(nodes);
  const finish = (candidate: T): T => {
    const stableCandidate = candidate !== edges
      && commercialRepairOutputIsEquivalent(edges, candidate)
      ? edges
      : candidate;
    if (options.onFinalEvaluation) {
      const report = evaluation.hardReport(stableCandidate);
      const endpointOrder = evaluation.endpointOrder(stableCandidate);
      const passageOrder = evaluation.passageOrder(stableCandidate);
      options.onFinalEvaluation({
        edges: stableCandidate,
        closureReady: report.hardClean
          && evaluation.unsafeEndpointStubs(candidate) === 0
          && endpointOrder.inversions === 0
          && endpointOrder.ambiguousLaneTies === 0
          && endpointOrder.collapsedLanePairs === 0
          && passageOrder.passageDefects === 0
          && passageOrder.nearTrunkOpportunities === 0,
      });
    }
    return stableCandidate;
  };
  const renderSafeCandidate = repairRenderSafeEndpointStubs(edges, nodes, 32) as T;
  const renderSafeChangedIndexes = renderSafeCandidate.flatMap((edge, index) => (
    edge !== edges[index] ? [index] : []
  ));
  let baseline = renderSafeChangedIndexes.length > 0
    && evaluation.unsafeEndpointStubs(renderSafeCandidate) < evaluation.unsafeEndpointStubs(edges)
    && passesBaseReactFlowFinalDisplayGate(
      edges,
      renderSafeCandidate,
      renderSafeChangedIndexes,
      options,
      evaluation,
    )
    ? renderSafeCandidate
    : edges;
  const reclaimedTargetTrunkCandidate = repairOverextendedTargetTrunkCorridors(
    baseline,
    nodes,
  ) as T;
  if (reclaimedTargetTrunkCandidate !== baseline) {
    const baselineReport = getDisplayHardQualityGateReport(baseline, nodes, 'polished');
    const candidateReport = getDisplayHardQualityGateReport(
      reclaimedTargetTrunkCandidate,
      nodes,
      'polished',
    );
    const changedEdgeIndexes = reclaimedTargetTrunkCandidate.flatMap((edge, index) => (
      edge !== baseline[index] ? [index] : []
    ));
    const baselineClearanceRisk = changedEdgeIndexes.reduce((total, index) => (
      total + scoreNodeClearanceRisk(
        getEdgePath(baseline[index]),
        nodes,
        baseline[index],
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      )
    ), 0);
    const candidateClearanceRisk = changedEdgeIndexes.reduce((total, index) => (
      total + scoreNodeClearanceRisk(
        getEdgePath(reclaimedTargetTrunkCandidate[index]),
        nodes,
        reclaimedTargetTrunkCandidate[index],
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      )
    ), 0);
    const preservesLengthAndCommercialClearance = candidateReport.quality.totalLength
      <= baselineReport.quality.totalLength + FINAL_COMMERCIAL_DETOUR_QUALITY_BUDGET
      && candidateClearanceRisk <= baselineClearanceRisk;
    const accepted = changedEdgeIndexes.length > 0
      && candidateReport.hardClean
      && candidateReport.quality.detourPenalty
        <= baselineReport.quality.detourPenalty + FINAL_COMMERCIAL_DETOUR_QUALITY_BUDGET
      && preservesLengthAndCommercialClearance
      && evaluation.unsafeEndpointStubs(reclaimedTargetTrunkCandidate)
        <= evaluation.unsafeEndpointStubs(baseline)
      && preservesCommercialTrueTrunkMembership(
        evaluation.endpointOrder(baseline).legalSharedTrunks,
        evaluation.endpointOrder(reclaimedTargetTrunkCandidate).legalSharedTrunks,
      )
      && changedEdgesObstacleHitsDoNotRegress(
        baseline,
        reclaimedTargetTrunkCandidate,
        changedEdgeIndexes,
        nodes,
      )
      && visualPolishHardQualityDoesNotRegress(
        baselineReport.quality,
        candidateReport.quality,
      );
    if (accepted) baseline = reclaimedTargetTrunkCandidate;
  }
  const repairClearance = (candidateEdges: T): T => {
    const protectedReclaimedTrunkIds = new Set(candidateEdges.flatMap(edge => (
      edge.data?.overextendedTargetTrunkCorridorReclaimed === true ? [edge.id] : []
    )));
    const regularEligibleEdgeIds = protectedReclaimedTrunkIds.size === 0
      ? options.eligibleEdgeIds
      : new Set(candidateEdges.flatMap(edge => (
        !protectedReclaimedTrunkIds.has(edge.id)
          && (!options.eligibleEdgeIds || options.eligibleEdgeIds.has(edge.id))
          ? [edge.id]
          : []
      )));
    const regularCandidate = repairBusinessNodeClearanceRisks(candidateEdges, nodes, {
      geometryContext: evaluation.businessNodeClearanceGeometry,
      eligibleEdgeIds: regularEligibleEdgeIds,
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      validateCandidate: context => passesBaseReactFlowFinalDisplayGate(
        context.baselineEdges,
        context.candidateEdges,
        [context.changedEdgeIndex],
        options,
        evaluation,
        true,
      ),
    }) as T;
    const commerciallyUnsafeEdgeIds = new Set(regularCandidate.flatMap(edge => (
      (!options.eligibleEdgeIds || options.eligibleEdgeIds.has(edge.id))
        && scoreNodeClearanceRisk(
          getEdgePath(edge),
          nodes,
          edge,
          COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        ) > 0.5
        ? [edge.id]
        : []
    )));
    if (commerciallyUnsafeEdgeIds.size === 0) return regularCandidate;

    return repairBusinessNodeClearanceRisks(regularCandidate, nodes, {
      geometryContext: evaluation.businessNodeClearanceGeometry,
      eligibleEdgeIds: commerciallyUnsafeEdgeIds,
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    }) as T;
  };
  const repairClearanceToBoundedFixedPoint = (candidateEdges: T): T => {
    let current = candidateEdges;
    for (let pass = 0; pass < 2; pass += 1) {
      const next = repairClearance(current);
      if (next === current || next.every((edge, index) => edge === current[index])) return current;
      current = next;
    }
    return current;
  };
  if (options.skipLoopShortcut) {
    const clearanceTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-commercial-clearance',
      candidateCount: baseline.length,
      onTrace: options.onPhaseTrace,
    });
    const clearanceCandidate = repairClearanceToBoundedFixedPoint(baseline);
    clearanceTimer.finish(clearanceCandidate === baseline ? 'skip' : 'accepted');
    const preservingTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-commercial-terminal-preserving',
      candidateCount: baseline.length,
      onTrace: options.onPhaseTrace,
    });
    const preservingCandidate = repairTerminalPreservingOuterStairs(
      clearanceCandidate,
      nodes,
      options,
      evaluation,
    );
    preservingTimer.finish(
      preservingCandidate === clearanceCandidate ? 'skip' : 'accepted',
    );
    const changingTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-commercial-terminal-changing',
      candidateCount: baseline.length,
      onTrace: options.onPhaseTrace,
    });
    const changingCandidate = repairTerminalChangingOuterStairs(
      preservingCandidate,
      nodes,
      options,
      evaluation,
    );
    changingTimer.finish(changingCandidate === preservingCandidate ? 'skip' : 'accepted');
    const sourceTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-commercial-source-stairs',
      candidateCount: baseline.length,
      onTrace: options.onPhaseTrace,
    });
    const sourceCandidate = repairSourceTerminalOuterStairs(
      changingCandidate,
      nodes,
      options,
      evaluation,
    );
    sourceTimer.finish(sourceCandidate === changingCandidate ? 'skip' : 'accepted');
    const evaluationTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-commercial-evaluation',
      candidateCount: baseline.length,
      onTrace: options.onPhaseTrace,
    });
    const result = finish(sourceCandidate);
    evaluationTimer.finish(result === baseline ? 'skip' : 'accepted');
    return result;
  }
  baseline = repairTerminalPreservingOuterStairs(
    baseline,
    nodes,
    options,
    evaluation,
  );
  baseline = repairTerminalChangingOuterStairs(
    baseline,
    nodes,
    options,
    evaluation,
  );
  const beforeSourceStairs = baseline;
  baseline = repairSourceTerminalOuterStairs(
    baseline,
    nodes,
    options,
    evaluation,
  );
  // A hard-defect source reroute can establish the first clean baseline. Give
  // the cheaper terminal-preserving/changing shortcuts one bounded pass over
  // that clean graph so unrelated outer rectangles are not stranded.
  if (baseline !== beforeSourceStairs) {
    baseline = repairTerminalPreservingOuterStairs(
      baseline,
      nodes,
      options,
      evaluation,
    );
    baseline = repairTerminalChangingOuterStairs(
      baseline,
      nodes,
      options,
      evaluation,
    );
  }
  // Clearance and detour shortening are independent soft-quality dimensions.
  // Establish the commercial node gap before ranking loop shortcuts so a
  // successful shortcut cannot make the clearance pass conditional.
  baseline = repairClearanceToBoundedFixedPoint(baseline);
  const clearanceRepairedEdgeIds = new Set(baseline.flatMap(edge => (
    edge.data?.displayNodeClearanceRepaired === true
      && (!options.eligibleEdgeIds || options.eligibleEdgeIds.has(edge.id))
      ? [edge.id]
      : []
  )));
  if (clearanceRepairedEdgeIds.size > 0) {
    baseline = repairTerminalPreservingOuterStairs(
      baseline,
      nodes,
      { ...options, eligibleEdgeIds: clearanceRepairedEdgeIds },
      evaluation,
    );
  }

  const baselineReport = evaluation.hardReport(baseline);
  let candidate = baseline;
  for (let pass = 0; pass < FINAL_COMMERCIAL_DETOUR_PASSES; pass += 1) {
    const next = repairDisplayLoopShortcuts(
      candidate,
      nodes,
      FINAL_COMMERCIAL_DETOUR_QUALITY_BUDGET,
      shortcutCandidate => repairRenderSafeEndpointStubs(
        repairAxisMismatchedTerminalsWithBoundedPortRoles(
          repairFinalResidualStrictCrossings(shortcutCandidate, nodes),
          nodes,
          16,
        ),
        nodes,
        16,
      ) as T,
    ) as T;
    if (next === candidate || next.every((edge, index) => edge === candidate[index])) break;
    candidate = next;
  }
  const baselineTrunks = evaluation.endpointOrder(baseline).legalSharedTrunks;
  const candidateCanCommit = (next: T): boolean => {
    const report = evaluation.hardReport(next);
    const changedEdgeIndexes = next.flatMap((edge, index) => (
      edge !== baseline[index] ? [index] : []
    ));
    return report.hardClean
      && report.quality.detourPenalty <= baselineReport.quality.detourPenalty
      && report.quality.totalLength < baselineReport.quality.totalLength
      && commercialEdgeDetoursDoNotRegress(
        baseline,
        next,
        changedEdgeIndexes,
      )
      && evaluation.unsafeEndpointStubs(next) <= evaluation.unsafeEndpointStubs(baseline)
      && preservesCommercialTrueTrunkMembership(
        baselineTrunks,
        evaluation.endpointOrder(next).legalSharedTrunks,
      );
  };
  if (candidate === baseline || candidate.every((edge, index) => edge === baseline[index])) {
    // Commercial clearance is an independent final contract. A route that has
    // no profitable loop shortcut can still run too close to an unrelated
    // business node, so it must not bypass the bounded clearance transaction.
    return finish(repairClearanceToBoundedFixedPoint(baseline));
  }
  const clearanceCandidate = repairClearanceToBoundedFixedPoint(candidate);
  if (
    clearanceCandidate !== candidate
    && !clearanceCandidate.every((edge, index) => edge === candidate[index])
    && candidateCanCommit(clearanceCandidate)
  ) candidate = clearanceCandidate;
  return finish(candidateCanCommit(candidate) ? candidate : baseline);
};
