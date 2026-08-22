import type { Edge, Node } from '@xyflow/react';

import {
  repairFinalSameSideEndpointOrder,
} from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  repairFinalSameSidePassageOrder,
  type SameSidePassageCandidateValidation,
} from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import {
  repairPreferredSourceBranchCorridors,
  repairPreferredSourceTrunkBundles,
} from '../../strategies/shared/edgePreferredSourceTrunkRepair';
import {
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import {
  repairFinalSharedSourceTerminalTrunks,
  repairFinalSharedTargetTerminalTrunks,
  repairFinalSameSideAdjacentTerminalEscape,
  repairFinalSameTargetTerminalTrunks,
  repairFinalTerminalMicroDoglegs,
  type FinalEndpointTopologyCandidateValidation,
} from '../../strategies/shared/edgeFinalEndpointTopologyRepair';
import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import {
  repairRenderSafeEndpointStubs,
} from './baseReactFlowDisplayEndpointStubRepair';
import { createBaseReactFlowFinalEndpointResidualRepair } from './baseReactFlowDisplayFinalEndpointResidualRepair';
import { buildSharedEndpointTrunkSynthesisCandidates } from './baseReactFlowDisplayEndpointTrunkCandidates';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  passesBaseReactFlowFinalDisplayGate as passesFinalDisplayGate,
  type BaseReactFlowFinalEndpointOrderOptions,
} from './baseReactFlowDisplayFinalEndpointGate';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { buildSiblingTerminalObstacleSkirtCandidates } from './baseReactFlowDisplaySiblingTerminalObstacleRepair';
import type { SameSideEndpointTrunkIdentity } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { repairBaseReactFlowConnectedSourceMicroArtifacts } from './baseReactFlowDisplayConnectedSourceMicroRepair';

export { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayTrueTrunkContract';
export {
  repairBaseReactFlowFinalCommercialDetours,
  traceSkippedFinalCommercialDetours,
} from './baseReactFlowDisplayCommercialDetourRepair';
export type { BaseReactFlowFinalEndpointOrderOptions } from './baseReactFlowDisplayFinalEndpointGate';

const exactTrueTrunkSignature = (
  trunks: readonly SameSideEndpointTrunkIdentity[],
): string => JSON.stringify(trunks.map(trunk => [
  trunk.nodeId,
  trunk.role,
  trunk.side,
  [...trunk.edgeIds].sort(),
  Math.round(trunk.commonStemLength * 1_000) / 1_000,
]).sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second))));

export const traceSkippedFinalEndpointPhases = (
  candidateCount: number,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
  includeSeed = false,
): void => {
  const phases = [
    'final-endpoint-topology',
    'final-endpoint-order',
    'final-endpoint-closure',
  ] as const;
  for (const phase of includeSeed ? ['final-endpoint-seed', ...phases] as const : phases) {
    startDisplayRoutingPhaseTrace({ phase, candidateCount, onTrace: onPhaseTrace }).finish('skip');
  }
};

const commitPostTrunkBranchObstacleCandidate = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  if (evaluation.hardReport(baseline).obstacleHits === 0) return baseline;
  return repairBusinessNodeClearanceRisks(baseline, repairNodes, {
    eligibleEdgeIds: options.eligibleEdgeIds,
    validateCandidate: context => passesFinalDisplayGate(
      context.baselineEdges,
      context.candidateEdges,
      [context.changedEdgeIndex],
      options,
      evaluation,
    ),
  });
};

const preservesDistinctParallelChildLanes = (
  context: SameSidePassageCandidateValidation,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): boolean => {
  if (
    context.candidateAudit.parallelChildOverlaps
    >= context.baselineAudit.parallelChildOverlaps
  ) return true;
  const baselineOrder = evaluation.endpointOrder(context.baselineEdges);
  const candidateOrder = evaluation.endpointOrder(context.candidateEdges);
  const sourceTrunkTies = (order: typeof baselineOrder): number => order.groups
    .filter(group => group.role === 'source')
    .reduce((total, group) => total + group.legalSharedTrunkTies, 0);
  return sourceTrunkTies(candidateOrder) <= sourceTrunkTies(baselineOrder);
};

const commitSiblingTerminalObstacleCandidate = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  const baselineReport = evaluation.hardReport(baseline);
  if (baselineReport.obstacleHits === 0) return baseline;
  let best = baseline;
  let bestReport = baselineReport;
  for (const candidate of buildSiblingTerminalObstacleSkirtCandidates(
    baseline,
    repairNodes,
  )) {
    const candidateReport = evaluation.hardReport(candidate);
    if (
      candidateReport.obstacleHits >= bestReport.obstacleHits
      || !candidateReport.terminalsAttached
      || !candidateReport.terminalsAnchored
    ) continue;
    const changedEdgeIndexes = candidate.flatMap((edge, index) => (
      edge !== baseline[index] ? [index] : []
    ));
    if (
      changedEdgeIndexes.length === 0
      || !passesFinalDisplayGate(
        baseline,
        candidate,
        changedEdgeIndexes,
        options,
        evaluation,
      )
    ) continue;
    best = candidate;
    bestReport = candidateReport;
    if (bestReport.obstacleHits === 0) break;
  }
  return best;
};

const commitPostObstacleMicroCandidate = (
  baseline: Edge[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  const baselineReport = evaluation.hardReport(baseline);
  if (baselineReport.quality.tinyInteriorDoglegs === 0) return baseline;
  const candidate = repairDisplayMicroArtifacts(
    baseline,
    createBaseReactFlowDisplayMicroSafetyContext(baseline, evaluation.nodes),
  );
  const connectedSourceCandidate = candidate === baseline
    ? repairBaseReactFlowConnectedSourceMicroArtifacts(baseline, evaluation.nodes)
    : candidate;
  if (connectedSourceCandidate === baseline) return baseline;
  const candidateReport = evaluation.hardReport(connectedSourceCandidate);
  if (
    candidateReport.quality.tinyInteriorDoglegs
    >= baselineReport.quality.tinyInteriorDoglegs
  ) return baseline;
  const changedEdgeIndexes = connectedSourceCandidate.flatMap((edge, index) => (
    edge !== baseline[index] ? [index] : []
  ));
  return changedEdgeIndexes.length > 0
    && passesFinalDisplayGate(
      baseline,
      connectedSourceCandidate,
      changedEdgeIndexes,
      options,
      evaluation,
      true,
    )
    ? connectedSourceCandidate
    : baseline;
};

const commitRenderSafeStubCandidate = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  const baselineIssues = evaluation.unsafeEndpointStubs(baseline);
  if (baselineIssues === 0) return baseline;
  const candidate = repairRenderSafeEndpointStubs(baseline, repairNodes, 32);
  if (
    candidate === baseline
    || evaluation.unsafeEndpointStubs(candidate) >= baselineIssues
  ) return baseline;
  const changedEdgeIndexes = candidate.flatMap((edge, index) => (
    edge !== baseline[index] ? [index] : []
  ));
  return changedEdgeIndexes.length > 0
    && passesFinalDisplayGate(
      baseline,
      candidate,
      changedEdgeIndexes,
      options,
      evaluation,
    )
    ? candidate
    : baseline;
};

const commitExcessiveDetourCandidate = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  if (options.eligibleEdgeIds) return baseline;
  const baselineReport = evaluation.hardReport(baseline);
  const candidate = repairDisplayLoopShortcuts(
    baseline,
    repairNodes,
    16,
  );
  if (candidate === baseline) return baseline;
  const candidateReport = evaluation.hardReport(candidate);
  if (
    !candidateReport.hardClean
    || candidateReport.quality.detourPenalty >= baselineReport.quality.detourPenalty
    || candidateReport.quality.totalLength >= baselineReport.quality.totalLength
  ) return baseline;
  const changedEdgeIndexes = candidate.flatMap((edge, index) => (
    edge !== baseline[index] ? [index] : []
  ));
  return changedEdgeIndexes.length > 0
    && passesFinalDisplayGate(
      baseline,
      candidate,
      changedEdgeIndexes,
      options,
      evaluation,
    )
    ? candidate
    : baseline;
};

const commitSharedEndpointTrunkCandidate = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  const baselineHardReport = evaluation.hardReport(baseline);
  const baselineOrder = evaluation.endpointOrder(baseline);
  let best = baseline;
  let bestOrder = baselineOrder;
  let bestLength = evaluation.hardReport(baseline).quality.totalLength;
  for (const candidate of buildSharedEndpointTrunkSynthesisCandidates(baseline, repairNodes)) {
    if (candidate === baseline) continue;
    const candidateOrder = evaluation.endpointOrder(candidate);
    if (candidateOrder.legalSharedTrunkTies <= baselineOrder.legalSharedTrunkTies) continue;
    const changedEdgeIndexes = candidate.flatMap((edge, index) => (
      edge !== baseline[index] ? [index] : []
    ));
    if (changedEdgeIndexes.length === 0 || !passesFinalDisplayGate(
      baseline,
      candidate,
      changedEdgeIndexes,
      options,
      evaluation,
    )) continue;
    const candidateHardReport = evaluation.hardReport(candidate);
    // An unclean baseline may use trunk synthesis as the actual hard-defect
    // repair, but it must not manufacture a provisional "true trunk" while
    // leaving crossings or obstacle hits behind.  Such a false preservation
    // contract can otherwise block the later bundle-level safety closure.
    if (!baselineHardReport.hardClean && !candidateHardReport.hardClean) continue;
    const candidateLength = candidateHardReport.quality.totalLength;
    if (
      candidateOrder.legalSharedTrunkTies > bestOrder.legalSharedTrunkTies
      || (
        candidateOrder.legalSharedTrunkTies === bestOrder.legalSharedTrunkTies
        && candidateLength < bestLength
      )
    ) {
      best = candidate;
      bestOrder = candidateOrder;
      bestLength = candidateLength;
    }
  }
  return best;
};

/**
 * Last display transaction for automatic same-side endpoint and passage ordering.
 *
 * The strategy layer owns bounded geometry generation. This wrapper adds the
 * exact render hard gate and retains every source/target true-trunk identity
 * independently, so a dual-trunk edge cannot lose either endpoint role.
 */
export const repairBaseReactFlowFinalEndpointOrder = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions = {},
): T => {
  if (edges.length < 2 || nodes.length === 0) return edges;
  const repairNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const evaluation = options.evaluation
    ?? createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  const residualRepair = createBaseReactFlowFinalEndpointResidualRepair({
    nodes: repairNodes,
    evaluation,
    validate: (baselineEdges, candidateEdges, changedEdgeIndexes) => passesFinalDisplayGate(
      baselineEdges,
      candidateEdges,
      changedEdgeIndexes,
      options,
      evaluation,
    ),
  });
  const seedTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-endpoint-seed',
    candidateCount: edges.length,
    onTrace: options.onPhaseTrace,
  });
  const baselineReport = evaluation.hardReport(edges);
  const restorePreferredSourceTrunks = (baseline: Edge[]): Edge[] => (
    repairPreferredSourceTrunkBundles(
      baseline,
      repairNodes,
      options.preferredEdges,
      {
        finalizeCandidate: candidateEdges => repairPreferredSourceBranchCorridors(
          residualRepair.strict(
            repairFinalSharedTargetTerminalTrunks(candidateEdges, repairNodes),
          ),
          repairNodes,
          options.preferredEdges,
        ),
        validateCandidate: context => passesFinalDisplayGate(
          context.baselineEdges,
          context.candidateEdges,
          context.changedEdgeIndexes,
          options,
          evaluation,
          false,
          context.restoredTrunk,
        ),
      },
    )
  );
  const separatePreferredSourceBranches = (
    baseline: Edge[],
    transactionBaseline: Edge[] = baseline,
  ): Edge[] => {
    const candidate = repairPreferredSourceBranchCorridors(
      baseline,
      repairNodes,
      options.preferredEdges,
    );
    if (candidate === baseline) return baseline;
    const changedEdgeIndexes = candidate.flatMap((edge, index) => (
      edge !== transactionBaseline[index] ? [index] : []
    ));
    return passesFinalDisplayGate(
      transactionBaseline,
      candidate,
      changedEdgeIndexes,
      options,
      evaluation,
    ) ? candidate : baseline;
  };
  // Do not spend an exact full-graph candidate gate on geometry that still has
  // hard defects. The same preferred bundle is retried after hard closure.
  let preferredSourceTrunkCandidate = baselineReport.hardClean
    ? restorePreferredSourceTrunks(edges)
    : edges;
  if (evaluation.hardReport(preferredSourceTrunkCandidate).hardClean) {
    const preferredTransactionBaseline = preferredSourceTrunkCandidate;
    preferredSourceTrunkCandidate = commitSharedEndpointTrunkCandidate(
      preferredSourceTrunkCandidate,
      repairNodes,
      options,
      evaluation,
    );
    preferredSourceTrunkCandidate = repairFinalSharedSourceTerminalTrunks(
      preferredSourceTrunkCandidate,
      repairNodes,
      {
        validateCandidate: context => passesFinalDisplayGate(
          context.baselineEdges,
          context.candidateEdges,
          context.changedEdgeIndexes,
          options,
          evaluation,
        ),
      },
    );
    preferredSourceTrunkCandidate = separatePreferredSourceBranches(
      preferredSourceTrunkCandidate,
      preferredTransactionBaseline,
    );
    const separationChangedIndexes = preferredSourceTrunkCandidate.flatMap((edge, index) => (
      edge !== preferredTransactionBaseline[index] ? [index] : []
    ));
    if (
      separationChangedIndexes.length > 0
      && separationChangedIndexes.every(index => (
        preferredSourceTrunkCandidate[index]?.data?.sourceBranchCorridorSeparated === true
      ))
      && exactTrueTrunkSignature(
        evaluation.endpointOrder(preferredTransactionBaseline).legalSharedTrunks,
      ) === exactTrueTrunkSignature(
        evaluation.endpointOrder(preferredSourceTrunkCandidate).legalSharedTrunks,
      )
    ) {
      preferredSourceTrunkCandidate = preferredTransactionBaseline;
    }
  }
  const initialReport = preferredSourceTrunkCandidate === edges
    ? baselineReport
    : evaluation.hardReport(preferredSourceTrunkCandidate);
  if (
    initialReport.hardClean
    && evaluation.unsafeEndpointStubs(preferredSourceTrunkCandidate) === 0
  ) {
    const initialOrder = evaluation.endpointOrder(preferredSourceTrunkCandidate);
    const initialPassage = evaluation.passageOrder(preferredSourceTrunkCandidate);
    if (
      initialOrder.inversions === 0
      && initialOrder.ambiguousLaneTies === 0
      && initialOrder.collapsedLanePairs === 0
      && initialPassage.passageDefects === 0
      && initialPassage.nearTrunkOpportunities === 0
    ) {
      seedTimer.finish(
        preferredSourceTrunkCandidate === edges ? 'skip' : 'accepted',
        preferredSourceTrunkCandidate === edges ? 0 : preferredSourceTrunkCandidate.length,
      );
      traceSkippedFinalEndpointPhases(
        preferredSourceTrunkCandidate.length,
        options.onPhaseTrace,
      );
      return preferredSourceTrunkCandidate as T;
    }
  }
  seedTimer.finish('fallback');
  const validateTopologyCandidate = (
    context: FinalEndpointTopologyCandidateValidation,
  ): boolean => passesFinalDisplayGate(
    context.baselineEdges,
    context.candidateEdges,
    context.changedEdgeIndexes,
    options,
    evaluation,
  );
  const validatePassageCandidate = (context: SameSidePassageCandidateValidation): boolean => (
    preservesDistinctParallelChildLanes(context, evaluation)
    && passesFinalDisplayGate(
      context.baselineEdges,
      context.candidateEdges,
      context.changedEdgeIndexes,
      options,
      evaluation,
    )
  );
  // Remove globally blocking strict crossings first. Endpoint topology
  // candidates still use the exact final gate, so a clean pre-pass lets a
  // later independent port-order repair be evaluated instead of being rejected
  // because of an unrelated crossing elsewhere in the graph.
  const topologyTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-endpoint-topology',
    candidateCount: preferredSourceTrunkCandidate.length,
    onTrace: options.onPhaseTrace,
  });
  let repaired: Edge[] = residualRepair.strict(preferredSourceTrunkCandidate);
  repaired = residualRepair.overlap(repaired);
  repaired = commitSharedEndpointTrunkCandidate(repaired, repairNodes, options, evaluation);
  repaired = repairFinalSameSideAdjacentTerminalEscape(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
    groupFilter: group => group.fixedEndpointCount > 0 && group.inversions > 0,
  });
  repaired = repairFinalSameSideEndpointOrder(repaired, repairNodes, {
    validateCandidate: context => passesFinalDisplayGate(
      context.baselineEdges,
      context.candidateEdges,
      context.changedEdgeIndexes,
      options,
      evaluation,
    ),
  });
  topologyTimer.finish(
    repaired === preferredSourceTrunkCandidate ? 'skip' : 'accepted',
    repaired === preferredSourceTrunkCandidate ? 0 : repaired.length,
  );
  const orderTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-endpoint-order',
    candidateCount: repaired.length,
    onTrace: options.onPhaseTrace,
  });
  const beforeOrder = repaired;
  repaired = repairFinalSameTargetTerminalTrunks(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = repairFinalSharedSourceTerminalTrunks(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = repairFinalSharedTargetTerminalTrunks(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = repairFinalSameSidePassageOrder(repaired, repairNodes, {
    validateCandidate: validatePassageCandidate,
  });
  repaired = repairFinalSameSideAdjacentTerminalEscape(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = repairFinalSameSidePassageOrder(repaired, repairNodes, {
    validateCandidate: validatePassageCandidate,
  });
  repaired = repairFinalSameSideEndpointOrder(repaired, repairNodes, {
    validateCandidate: context => passesFinalDisplayGate(
      context.baselineEdges,
      context.candidateEdges,
      context.changedEdgeIndexes,
      options,
      evaluation,
    ),
  });
  orderTimer.finish(
    repaired === beforeOrder ? 'skip' : 'accepted',
    repaired === beforeOrder ? 0 : repaired.length,
  );
  const closureTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-endpoint-closure',
    candidateCount: repaired.length,
    onTrace: options.onPhaseTrace,
  });
  repaired = residualRepair.fixedPoint(repaired);
  repaired = repairFinalSharedSourceTerminalTrunks(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = repairFinalSharedTargetTerminalTrunks(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = commitSharedEndpointTrunkCandidate(repaired, repairNodes, options, evaluation);
  repaired = commitPostTrunkBranchObstacleCandidate(repaired, repairNodes, options, evaluation);
  repaired = commitSiblingTerminalObstacleCandidate(repaired, repairNodes, options, evaluation);
  repaired = commitPostObstacleMicroCandidate(repaired, options, evaluation);
  repaired = commitRenderSafeStubCandidate(repaired, repairNodes, options, evaluation);
  repaired = repairFinalTerminalMicroDoglegs(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = commitExcessiveDetourCandidate(repaired, repairNodes, options, evaluation);
  if (evaluation.hardReport(repaired).hardClean) {
    repaired = restorePreferredSourceTrunks(repaired);
    // Restoring an authored trunk can pull a nearby independent branch back
    // inside the visual port-gap floor. Revalidate the endpoint contract after
    // restoration; true trunk blocks stay atomic, so only the independent
    // branch moves when that is the safe minimal correction.
    repaired = repairFinalSameSideEndpointOrder(repaired, repairNodes, {
      validateCandidate: context => passesFinalDisplayGate(
        context.baselineEdges,
        context.candidateEdges,
        context.changedEdgeIndexes,
        options,
        evaluation,
      ),
    });
    repaired = separatePreferredSourceBranches(repaired);
  }
  if (repaired === edges || repaired.every((edge, index) => edge === edges[index])) {
    closureTimer.finish('skip');
    return edges;
  }
  const changedEdgeIndexes = repaired.flatMap((edge, index) => (
    edge !== edges[index] ? [index] : []
  ));
  const allowsCommercialTrunkSuperset = (
    evaluation.hardReport(repaired).quality.tinyInteriorDoglegs
    < baselineReport.quality.tinyInteriorDoglegs
  );
  const accepted = passesFinalDisplayGate(
    edges,
    repaired,
    changedEdgeIndexes,
    options,
    evaluation,
    allowsCommercialTrunkSuperset,
  );
  closureTimer.finish(accepted ? 'accepted' : 'rejected', changedEdgeIndexes.length);
  return accepted ? repaired as T : edges;
};
