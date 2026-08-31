import type { Edge, Node } from '@xyflow/react';

import type { BaseReactFlowDisplayEdgesArgs } from './baseReactFlowDisplayFullRoutePipeline';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { displayBusinessNodeCommercialClearanceIsClean } from './baseReactFlowDisplayBusinessNodeClearance';
import { repairBaseReactFlowDisplayBusinessNodeClearance } from './baseReactFlowDisplayBusinessNodeClearance';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import { closeBaseReactFlowDisplayFinalHardContract } from './baseReactFlowDisplayFinalHardContract';
import { passesBaseReactFlowFinalDisplayGate } from './baseReactFlowDisplayFinalEndpointGate';
import { repairBaseReactFlowFinalCommercialDetours } from './baseReactFlowDisplayFinalEndpointOrder';
import { repairBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyClosure';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

const MAX_ALTERNATE_HARD_CLOSURE_EDGES = 24;

export const displayAlternateHardClosureCandidateIsReady = (
  edges: Edge[],
  nodes: Node[],
  evidence?: Readonly<{
    evaluation?: BaseReactFlowFinalEndpointEvaluation | undefined;
    hardReport?: Readonly<{
      edges: readonly Edge[];
      report: BaseDisplayBoundedCandidateReport;
    }> | undefined;
  }>,
): boolean => {
  const evaluation = evidence?.evaluation?.nodes === nodes
    ? evidence.evaluation
    : undefined;
  const report = evidence?.hardReport?.edges === edges
    ? evidence.hardReport.report
    : evaluation?.hardReport(edges)
    ?? getDisplayHardQualityGateReport(edges, nodes, 'polished');
  return report.hardClean
    && displayBusinessNodeCommercialClearanceIsClean(edges, nodes)
    && (evaluation?.unsafeEndpointStubs(edges)
      ?? countRenderUnsafeEndpointStubs(edges)) === 0;
};

const collectAlternateHardClosureDefectEdgeIds = (
  edges: Edge[],
  nodes: Node[],
): Set<string> => {
  const edgeIds = new Set<string>();
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    const first = edges[hit.a.edgeIndex];
    const second = edges[hit.b.edgeIndex];
    if (first) edgeIds.add(first.id);
    if (second) edgeIds.add(second.id);
  }
  for (const edge of edges) {
    if (scoreNodeClearanceRisk(
      getDisplayComputedPath(edge),
      nodes,
      edge,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) > 0.5) {
      edgeIds.add(edge.id);
    }
  }
  return edgeIds;
};

/**
 * Re-seeds only a bounded failed transaction, then closes every hard and
 * commercial gate before the alternate geometry can be committed.
 */
export const buildBaseReactFlowAlternateHardClosureCandidate = ({
  args,
  repairNodes,
  primaryCandidate,
  evaluationSession,
}: {
  args: BaseReactFlowDisplayEdgesArgs;
  repairNodes: Node[];
  primaryCandidate: Edge[];
  evaluationSession?: BaseReactFlowFinalEndpointEvaluation;
}): Edge[] | null => {
  if (args.edges.length === 0 || args.edges.length > MAX_ALTERNATE_HARD_CLOSURE_EDGES) {
    return null;
  }

  const evaluation = evaluationSession
    ?? args.evaluationSession
    ?? createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  // A hard-clean primary needs only commercial clearance, not a new routing
  // seed. Keep this repair atomic: a local improvement must also preserve the
  // committed trunks, endpoint order and complete final display contract.
  if (evaluation.hardReport(primaryCandidate).hardClean
    && evaluation.unsafeEndpointStubs(primaryCandidate) === 0) {
    const clearanceCandidate = repairBaseReactFlowDisplayBusinessNodeClearance(
      primaryCandidate, repairNodes,
    );
    const changedIndexes = clearanceCandidate.flatMap((edge, index) => (
      edge === primaryCandidate[index] ? [] : [index]
    ));
    const beforeOrder = evaluation.endpointOrder(primaryCandidate);
    const afterOrder = evaluation.endpointOrder(clearanceCandidate);
    if (displayAlternateHardClosureCandidateIsReady(clearanceCandidate, repairNodes, { evaluation })
      && passesBaseReactFlowFinalDisplayGate(
        primaryCandidate, clearanceCandidate, changedIndexes, {}, evaluation,
      )
      && afterOrder.inversions <= beforeOrder.inversions
      && afterOrder.ambiguousLaneTies <= beforeOrder.ambiguousLaneTies
      && afterOrder.collapsedLanePairs <= beforeOrder.collapsedLanePairs
      && afterOrder.invalidEndpointCount <= beforeOrder.invalidEndpointCount
      && evaluation.passageOrder(clearanceCandidate).passageDefects
        <= evaluation.passageOrder(primaryCandidate).passageDefects) {
      return clearanceCandidate;
    }
  }
  const interactiveSeed = createBaseReactFlowInteractiveDisplayEdges({
    edges: args.edges,
    nodes: args.nodes,
    enableSmartEdges: args.enableSmartEdges,
    smartEdgePadding: args.smartEdgePadding,
    isLargeGraph: args.isLargeGraph,
    displayEdgeEpoch: args.displayEdgeEpoch,
  });
  const closeCandidate = (seed: Edge[]) => {
    const hardClosedSeed = closeBaseReactFlowDisplayFinalHardContract(
      seed,
      repairNodes,
      args.onPhaseTrace,
      evaluation,
    ).edges;
    const commercialClosedSeed = repairBaseReactFlowFinalCommercialDetours(
      hardClosedSeed,
      repairNodes,
      { preferredEdges: args.edges, evaluation },
    );
    const clearanceClosedSeed = repairBaseReactFlowDisplayBusinessNodeClearance(
      commercialClosedSeed,
      repairNodes,
    );
    const safetyClosedSeed = repairBaseReactFlowFinalSafetyClosure(
      clearanceClosedSeed,
      repairNodes,
      { evaluation },
    );
    return closeBaseReactFlowDisplayFinalHardContract(
      safetyClosedSeed,
      repairNodes,
      args.onPhaseTrace,
      evaluation,
    );
  };
  const alternateOutcome = closeCandidate(interactiveSeed);
  const alternateCandidate = alternateOutcome.edges;
  const alternateById = new Map(alternateCandidate.map(edge => [edge.id, edge] as const));
  const defectEdgeIds = collectAlternateHardClosureDefectEdgeIds(primaryCandidate, repairNodes);
  const hybridSeed = primaryCandidate.map(edge => (
    defectEdgeIds.has(edge.id) ? alternateById.get(edge.id) ?? edge : edge
  ));
  const hybridOutcome = closeCandidate(hybridSeed);
  const hybridCandidate = hybridOutcome.edges;

  if (displayAlternateHardClosureCandidateIsReady(hybridCandidate, repairNodes, {
    evaluation,
    hardReport: { edges: hybridCandidate, report: hybridOutcome.report },
  })) {
    return hybridCandidate;
  }
  return displayAlternateHardClosureCandidateIsReady(alternateCandidate, repairNodes, {
    evaluation,
    hardReport: { edges: alternateCandidate, report: alternateOutcome.report },
  })
    ? alternateCandidate
    : null;
};
