import type { Edge, Node } from '@xyflow/react';

import type { BaseReactFlowDisplayEdgesArgs } from './baseReactFlowDisplayFullRoutePipeline';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { displayBusinessNodeCommercialClearanceIsClean } from './baseReactFlowDisplayBusinessNodeClearance';
import { repairBaseReactFlowDisplayBusinessNodeClearance } from './baseReactFlowDisplayBusinessNodeClearance';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { closeBaseReactFlowDisplayFinalHardContract } from './baseReactFlowDisplayFinalHardContract';
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
): boolean => {
  const report = getDisplayHardQualityGateReport(edges, nodes, 'polished');
  return report.hardClean
    && displayBusinessNodeCommercialClearanceIsClean(edges, nodes)
    && countRenderUnsafeEndpointStubs(edges) === 0;
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
}: {
  args: BaseReactFlowDisplayEdgesArgs;
  repairNodes: Node[];
  primaryCandidate: Edge[];
}): Edge[] | null => {
  if (args.edges.length === 0 || args.edges.length > MAX_ALTERNATE_HARD_CLOSURE_EDGES) {
    return null;
  }

  const interactiveSeed = createBaseReactFlowInteractiveDisplayEdges({
    edges: args.edges,
    nodes: args.nodes,
    enableSmartEdges: args.enableSmartEdges,
    smartEdgePadding: args.smartEdgePadding,
    isLargeGraph: args.isLargeGraph,
    displayEdgeEpoch: args.displayEdgeEpoch,
  });
  const closeCandidate = (seed: Edge[]): Edge[] => {
    const hardClosedSeed = closeBaseReactFlowDisplayFinalHardContract(
      seed,
      repairNodes,
      args.onPhaseTrace,
    ).edges;
    const commercialClosedSeed = repairBaseReactFlowFinalCommercialDetours(
      hardClosedSeed,
      repairNodes,
      { preferredEdges: args.edges },
    );
    const clearanceClosedSeed = repairBaseReactFlowDisplayBusinessNodeClearance(
      commercialClosedSeed,
      repairNodes,
    );
    const safetyClosedSeed = repairBaseReactFlowFinalSafetyClosure(
      clearanceClosedSeed,
      repairNodes,
    );
    return closeBaseReactFlowDisplayFinalHardContract(
      safetyClosedSeed,
      repairNodes,
      args.onPhaseTrace,
    ).edges;
  };
  const alternateCandidate = closeCandidate(interactiveSeed);
  const alternateById = new Map(alternateCandidate.map(edge => [edge.id, edge] as const));
  const defectEdgeIds = collectAlternateHardClosureDefectEdgeIds(primaryCandidate, repairNodes);
  const hybridSeed = primaryCandidate.map(edge => (
    defectEdgeIds.has(edge.id) ? alternateById.get(edge.id) ?? edge : edge
  ));
  const hybridCandidate = closeCandidate(hybridSeed);

  if (displayAlternateHardClosureCandidateIsReady(hybridCandidate, repairNodes)) {
    return hybridCandidate;
  }
  return displayAlternateHardClosureCandidateIsReady(alternateCandidate, repairNodes)
    ? alternateCandidate
    : null;
};
