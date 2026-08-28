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
  type BusinessNodeClearanceRepairDiagnostics,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import { evaluateBaseReactFlowChangedCandidateReport } from './baseReactFlowDisplayChangedCandidateReport';
import {
  repairFinalSharedSourceTerminalTrunks,
  repairFinalSharedTargetTerminalTrunks,
  repairFinalSameSideAdjacentTerminalEscape,
  repairFinalSameTargetTerminalTrunks,
  repairFinalTerminalMicroDoglegs,
  type FinalEndpointTopologyCandidateValidation,
} from '../../strategies/shared/edgeFinalEndpointTopologyRepair';
import { createBaseReactFlowFinalEndpointResidualRepair } from './baseReactFlowDisplayFinalEndpointResidualRepair';
import { buildSharedEndpointTrunkSynthesisCandidates } from './baseReactFlowDisplayEndpointTrunkCandidates';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  diffBaseReactFlowEvaluationMetrics,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import { resolveBaseReactFlowEvaluationNodes } from './baseReactFlowDisplayEvaluationNodes';
import {
  passesBaseReactFlowFinalDisplayGate as passesFinalDisplayGate,
  type BaseReactFlowFinalEndpointOrderOptions,
} from './baseReactFlowDisplayFinalEndpointGate';
import {
  countChangedRoutingItems,
  startFinalEndpointTerminalClosureTrace,
  startDisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { buildSiblingTerminalObstacleSkirtCandidates } from './baseReactFlowDisplaySiblingTerminalObstacleRepair';
import { repairBaseReactFlowConnectedSourceMicroArtifacts } from './baseReactFlowDisplayConnectedSourceMicroRepair';
import { startBaseReactFlowObstacleClosureTrace } from './baseReactFlowDisplayObstacleClosureTrace';
import {
  exactTrueTrunkSignature,
  traceSkippedFinalEndpointPhases,
} from './baseReactFlowDisplayFinalEndpointTrace';

export { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayTrueTrunkContract';
export {
  repairBaseReactFlowFinalCommercialDetours,
  traceSkippedFinalCommercialDetours,
} from './baseReactFlowDisplayCommercialDetourRepair';
export type { BaseReactFlowFinalEndpointOrderOptions } from './baseReactFlowDisplayFinalEndpointGate';
export { traceSkippedFinalEndpointPhases } from './baseReactFlowDisplayFinalEndpointTrace';

const commitPostTrunkBranchObstacleCandidate = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
  diagnostics?: BusinessNodeClearanceRepairDiagnostics,
): Edge[] => {
  if (evaluation.hardReport(baseline).obstacleHits === 0) return baseline;
  return repairBusinessNodeClearanceRisks(baseline, repairNodes, {
    geometryContext: evaluation.businessNodeClearanceGeometry,
    eligibleEdgeIds: options.eligibleEdgeIds,
    validateCandidate: context => passesFinalDisplayGate(
      context.baselineEdges,
      context.candidateEdges,
      [context.changedEdgeIndex],
      options,
      evaluation,
    ),
    diagnostics,
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
    const changed = evaluateBaseReactFlowChangedCandidateReport(baseline, candidate, evaluation);
    if (!changed) continue;
    const { changedEdgeIndexes, report: candidateReport } = changed;
    if (
      candidateReport.obstacleHits >= bestReport.obstacleHits
      || !candidateReport.terminalsAttached
      || !candidateReport.terminalsAnchored
    ) continue;
    if (
      !passesFinalDisplayGate(
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
    undefined,
    { allowCompoundRepairs: false },
  );
  const connectedSourceCandidate = candidate === baseline
    ? repairBaseReactFlowConnectedSourceMicroArtifacts(baseline, evaluation.nodes)
    : candidate;
  if (connectedSourceCandidate === baseline) return baseline;
  const changed = evaluateBaseReactFlowChangedCandidateReport(
    baseline,
    connectedSourceCandidate,
    evaluation,
  );
  if (!changed) return baseline;
  const { changedEdgeIndexes, report: candidateReport } = changed;
  if (
    candidateReport.quality.tinyInteriorDoglegs
    >= baselineReport.quality.tinyInteriorDoglegs
  ) return baseline;
  return passesFinalDisplayGate(
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
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  const baselineIssues = evaluation.unsafeEndpointStubs(baseline);
  if (baselineIssues === 0) return baseline;
  const candidate = evaluation.repairRenderSafeEndpointStubs(baseline, 32);
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
  const changed = evaluateBaseReactFlowChangedCandidateReport(baseline, candidate, evaluation);
  if (!changed) return baseline;
  const { changedEdgeIndexes, report: candidateReport } = changed;
  if (
    !candidateReport.hardClean
    || candidateReport.quality.detourPenalty >= baselineReport.quality.detourPenalty
    || candidateReport.quality.totalLength >= baselineReport.quality.totalLength
  ) return baseline;
  return passesFinalDisplayGate(
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
  const repairNodes = resolveBaseReactFlowEvaluationNodes(
    nodes,
    options.evaluation,
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
    ...(options.traceParentPhase ? { parentPhase: options.traceParentPhase } : {}),
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
        false,
        options.traceParentPhase,
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
  const repairEndpointOrder = (baseline: Edge[]): Edge[] => (
    repairFinalSameSideEndpointOrder(baseline, repairNodes, {
      evaluateEndpointOrder: evaluation.endpointOrder,
      validateCandidate: validateTopologyCandidate,
    })
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
    ...(options.traceParentPhase ? { parentPhase: options.traceParentPhase } : {}),
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
  repaired = repairEndpointOrder(repaired);
  topologyTimer.finish(
    repaired === preferredSourceTrunkCandidate ? 'skip' : 'accepted',
    repaired === preferredSourceTrunkCandidate ? 0 : repaired.length,
  );
  const orderTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-endpoint-order',
    ...(options.traceParentPhase ? { parentPhase: options.traceParentPhase } : {}),
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
    evaluateEndpointOrder: evaluation.endpointOrder,
    evaluatePassageOrder: evaluation.passageOrder,
    validateCandidate: validatePassageCandidate,
  });
  repaired = repairFinalSameSideAdjacentTerminalEscape(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = repairFinalSameSidePassageOrder(repaired, repairNodes, {
    evaluateEndpointOrder: evaluation.endpointOrder,
    evaluatePassageOrder: evaluation.passageOrder,
    validateCandidate: validatePassageCandidate,
  });
  repaired = repairEndpointOrder(repaired);
  orderTimer.finish(
    repaired === beforeOrder ? 'skip' : 'accepted',
    repaired === beforeOrder ? 0 : repaired.length,
  );
  const closureTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-endpoint-closure',
    ...(options.traceParentPhase ? { parentPhase: options.traceParentPhase } : {}),
    candidateCount: repaired.length,
    onTrace: options.onPhaseTrace,
  });
  const closureStage = (phase: Extract<
    Parameters<typeof startDisplayRoutingPhaseTrace>[0]['phase'],
    | 'final-endpoint-closure-residual'
    | 'final-endpoint-closure-trunks'
    | 'final-endpoint-closure-obstacles'
    | 'final-endpoint-closure-terminal'
    | 'final-endpoint-closure-commercial'
  >) => startDisplayRoutingPhaseTrace({
    phase,
    parentPhase: 'final-endpoint-closure',
    candidateCount: repaired.length,
    onTrace: options.onPhaseTrace,
  });
  const residualClosureTimer = closureStage('final-endpoint-closure-residual');
  const beforeResidualClosure = repaired;
  repaired = residualRepair.fixedPoint(repaired);
  residualClosureTimer.finish(
    repaired === beforeResidualClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeResidualClosure, repaired),
  );
  const trunkClosureTimer = closureStage('final-endpoint-closure-trunks');
  const beforeTrunkClosure = repaired;
  repaired = repairFinalSharedSourceTerminalTrunks(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = repairFinalSharedTargetTerminalTrunks(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  repaired = commitSharedEndpointTrunkCandidate(repaired, repairNodes, options, evaluation);
  trunkClosureTimer.finish(
    repaired === beforeTrunkClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeTrunkClosure, repaired),
  );
  const obstacleClosureTimer = closureStage('final-endpoint-closure-obstacles');
  const obstacleClosureStage = (phase: Parameters<
    typeof startBaseReactFlowObstacleClosureTrace
  >[0]['phase']) => startBaseReactFlowObstacleClosureTrace({
    phase,
    candidateCount: repaired.length,
    evaluation,
    onPhaseTrace: options.onPhaseTrace,
  });
  const beforeObstacleClosure = repaired;
  const beforePostTrunkObstacle = repaired;
  const finishPostTrunkObstacle = obstacleClosureStage(
    'final-endpoint-closure-obstacles-post-trunk',
  );
  const postTrunkObstacleDiagnostics: BusinessNodeClearanceRepairDiagnostics = {
    candidateCollectionCacheHitCount: 0,
    candidateRankCacheHitCount: 0,
    clearanceScoreCacheHitCount: 0,
    clearanceScannedNodeCount: 0,
    generatedCandidateCount: 0,
    qualityContextBuildCount: 0,
    qualityContextCacheHitCount: 0,
    uniqueCandidateCount: 0,
  };
  repaired = commitPostTrunkBranchObstacleCandidate(
    repaired,
    repairNodes,
    options,
    evaluation,
    postTrunkObstacleDiagnostics,
  );
  finishPostTrunkObstacle(beforePostTrunkObstacle, repaired, postTrunkObstacleDiagnostics);
  const beforeSiblingObstacle = repaired;
  const finishSiblingObstacle = obstacleClosureStage(
    'final-endpoint-closure-obstacles-sibling',
  );
  repaired = commitSiblingTerminalObstacleCandidate(repaired, repairNodes, options, evaluation);
  finishSiblingObstacle(beforeSiblingObstacle, repaired);
  const beforePostObstacleMicro = repaired;
  const finishPostObstacleMicro = obstacleClosureStage(
    'final-endpoint-closure-obstacles-micro',
  );
  repaired = commitPostObstacleMicroCandidate(repaired, options, evaluation);
  finishPostObstacleMicro(beforePostObstacleMicro, repaired);
  obstacleClosureTimer.finish(
    repaired === beforeObstacleClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeObstacleClosure, repaired),
  );
  const terminalClosureTimer = closureStage('final-endpoint-closure-terminal');
  const beforeTerminalClosure = repaired;
  const stubClosureTimer = startFinalEndpointTerminalClosureTrace(
    'final-endpoint-closure-terminal-stubs', repaired.length, options.onPhaseTrace,
  );
  const beforeStubClosure = repaired;
  const stubMetricsBefore = evaluation.readMetrics();
  repaired = commitRenderSafeStubCandidate(repaired, options, evaluation);
  stubClosureTimer.finish(
    repaired === beforeStubClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeStubClosure, repaired),
    diffBaseReactFlowEvaluationMetrics(stubMetricsBefore, evaluation.readMetrics()),
  );
  const microClosureTimer = startFinalEndpointTerminalClosureTrace(
    'final-endpoint-closure-terminal-micro', repaired.length, options.onPhaseTrace,
  );
  const beforeMicroClosure = repaired;
  repaired = repairFinalTerminalMicroDoglegs(repaired, repairNodes, {
    validateCandidate: validateTopologyCandidate,
  });
  microClosureTimer.finish(
    repaired === beforeMicroClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeMicroClosure, repaired),
  );
  terminalClosureTimer.finish(
    repaired === beforeTerminalClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeTerminalClosure, repaired),
  );
  const commercialClosureTimer = closureStage('final-endpoint-closure-commercial');
  const beforeCommercialClosure = repaired;
  repaired = commitExcessiveDetourCandidate(repaired, repairNodes, options, evaluation);
  if (evaluation.hardReport(repaired).hardClean) {
    repaired = restorePreferredSourceTrunks(repaired);
    // Restoring an authored trunk can pull a nearby independent branch back
    // inside the visual port-gap floor. Revalidate the endpoint contract after
    // restoration; true trunk blocks stay atomic, so only the independent
    // branch moves when that is the safe minimal correction.
    repaired = repairEndpointOrder(repaired);
    repaired = separatePreferredSourceBranches(repaired);
  }
  commercialClosureTimer.finish(
    repaired === beforeCommercialClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeCommercialClosure, repaired),
  );
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
