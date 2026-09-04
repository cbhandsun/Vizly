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
import {
  createBaseReactFlowFinalEndpointEvaluation,
  diffBaseReactFlowEvaluationMetrics,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import { commercialEdgeDetoursDoNotRegress } from './baseReactFlowDisplayCommercialDetourGuard';
import {
  buildCommercialBranchedTerminalShortcutCandidates,
  buildCommercialSourceTerminalShortcutCandidates,
  buildCommercialTerminalShortcutCandidates,
} from './baseReactFlowDisplayCommercialTerminalShortcut';
import { buildCommercialPathSearchTerminalCandidates } from './baseReactFlowDisplayCommercialPathSearch';
import {
  commercialBendSimplificationLengthBudget,
  MAX_COMMERCIAL_BEND_COUNT,
} from './baseReactFlowDisplayCommercialQuality';
import {
  passesBaseReactFlowFinalDisplayGate,
  type BaseReactFlowFinalEndpointOrderOptions,
} from './baseReactFlowDisplayFinalEndpointGate';
import {
  repairDisplayLoopShortcuts,
} from './baseReactFlowDisplayLoopShortcutRepair';
import {
  displayPathLength,
  getDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';
import { commercialRepairOutputIsEquivalent } from './baseReactFlowDisplayCommercialRepairContract';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import { withDisplayLocalShortcutSoftCrossingBridge } from './baseReactFlowDisplaySoftCrossingBridge';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { preservesCommercialTrueTrunkMembership } from './baseReactFlowDisplayTrueTrunkContract';
import { repairTerminalPreservingOuterStairs } from './baseReactFlowDisplayCommercialOuterStairRepair';
import { startDisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';

const FINAL_COMMERCIAL_DETOUR_QUALITY_BUDGET = 128;
const FINAL_COMMERCIAL_DETOUR_PASSES = 1;
const FINAL_COMMERCIAL_TERMINAL_SHORTCUT_EVALUATIONS = 24;
const FINAL_COMMERCIAL_SOURCE_SHORTCUT_EVALUATIONS = 32;
const FINAL_COMMERCIAL_SOURCE_SHORTCUT_EVALUATIONS_PER_EDGE = 8;
const FINAL_COMMERCIAL_PHASES = [
  'final-commercial-clearance',
  'final-commercial-terminal-preserving',
  'final-commercial-source-stairs',
  'final-commercial-terminal-changing',
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
    const hasExcessiveBends = baselinePath.length - 2 > MAX_COMMERCIAL_BEND_COUNT;
    const hardDefectCandidates = !options.eligibleEdgeIds
      && ((!bestReport.hardClean && baselinePath.length === 5) || hasExcessiveBends)
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
      const structuralLengthBudget = commercialBendSimplificationLengthBudget(
        best[edgeIndex],
        candidate[edgeIndex],
      );
      const allowedDetourPenalty = bestReport.quality.detourPenalty
        + (bestReport.hardClean
          ? structuralLengthBudget
          : FINAL_COMMERCIAL_DETOUR_QUALITY_BUDGET);
      if (
        !candidateReport.hardClean
        || candidateReport.quality.totalLength
          >= bestReport.quality.totalLength + structuralLengthBudget
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
  const evaluationMetricsBefore = evaluation.readMetrics();
  const evaluationTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-commercial-evaluation',
    candidateCount: edges.length,
    onTrace: options.onPhaseTrace,
  });
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
    evaluationTimer.finish(
      stableCandidate === edges ? 'skip' : 'accepted',
      0,
      diffBaseReactFlowEvaluationMetrics(evaluationMetricsBefore, evaluation.readMetrics()),
    );
    return stableCandidate;
  };
  // Endpoint closure owns compound crossing repairs. Commercial shortening may
  // apply a direct stub improvement, but must not restart that search merely
  // to promote the already-valid 48px minimum to the 56px render preference.
  const renderSafeCandidate = evaluation.repairRenderSafeEndpointStubs(edges, 32, false) as T;
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
    const baselineReport = evaluation.hardReport(baseline);
    const candidateReport = evaluation.hardReport(reclaimedTargetTrunkCandidate);
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
  const runCommercialPhase = (
    phase: 'final-commercial-clearance'
      | 'final-commercial-terminal-preserving'
      | 'final-commercial-source-stairs'
      | 'final-commercial-terminal-changing',
    candidateEdges: T,
    repair: (current: T) => T,
  ): T => {
    const timer = startDisplayRoutingPhaseTrace({
      phase,
      candidateCount: candidateEdges.length,
      onTrace: options.onPhaseTrace,
    });
    const repaired = repair(candidateEdges);
    timer.finish(repaired === candidateEdges ? 'skip' : 'accepted');
    return repaired;
  };
  const preserveOuterStairs = (candidateEdges: T): T => runCommercialPhase(
    'final-commercial-terminal-preserving',
    candidateEdges,
    current => repairTerminalPreservingOuterStairs(current, nodes, options, evaluation),
  );
  const repairSourceStairs = (candidateEdges: T): T => runCommercialPhase(
    'final-commercial-source-stairs',
    candidateEdges,
    current => repairSourceTerminalOuterStairs(current, nodes, options, evaluation),
  );
  const repairChangingStairs = (candidateEdges: T): T => runCommercialPhase(
    'final-commercial-terminal-changing',
    candidateEdges,
    current => repairTerminalChangingOuterStairs(current, nodes, options, evaluation),
  );
  const repairCommercialClearance = (candidateEdges: T): T => runCommercialPhase(
    'final-commercial-clearance',
    candidateEdges,
    repairClearanceToBoundedFixedPoint,
  );
  if (options.skipLoopShortcut) {
    const preservingCandidate = preserveOuterStairs(repairCommercialClearance(baseline));
    // A preserving shortcut can expose a source corridor. Repair that source
    // before moving its target and thereby invalidating the newly viable route.
    return finish(repairChangingStairs(repairSourceStairs(preservingCandidate)));
  }
  baseline = preserveOuterStairs(baseline);
  const beforeSourceStairs = baseline;
  // Keep the same source-before-target order as the traced closure above.
  baseline = repairSourceStairs(baseline);
  const sourceStairsChanged = baseline !== beforeSourceStairs;
  baseline = repairChangingStairs(baseline);
  // A hard-defect source reroute can establish the first clean baseline. Give
  // the cheaper terminal-preserving/changing shortcuts one bounded pass over
  // that clean graph so unrelated outer rectangles are not stranded.
  if (sourceStairsChanged) {
    baseline = preserveOuterStairs(baseline);
    baseline = repairChangingStairs(baseline);
  }
  // Clearance and detour shortening are independent soft-quality dimensions.
  // Establish the commercial node gap before ranking loop shortcuts so a
  // successful shortcut cannot make the clearance pass conditional.
  baseline = repairCommercialClearance(baseline);
  const clearanceRepairedEdgeIds = new Set(baseline.flatMap(edge => (
    edge.data?.displayNodeClearanceRepaired === true
      && (!options.eligibleEdgeIds || options.eligibleEdgeIds.has(edge.id))
      ? [edge.id]
      : []
  )));
  if (clearanceRepairedEdgeIds.size > 0) {
    baseline = runCommercialPhase(
      'final-commercial-terminal-preserving',
      baseline,
      current => repairTerminalPreservingOuterStairs(
        current,
        nodes,
        { ...options, eligibleEdgeIds: clearanceRepairedEdgeIds },
        evaluation,
      ),
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
