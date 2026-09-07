import type { Edge, Node } from '@xyflow/react';

import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import {
  repairBaseReactFlowMinimumBusinessNodeClearance,
} from './baseReactFlowDisplayBusinessNodeClearance';
import { displayHardQualityReportGeometryIsClean } from './baseReactFlowDisplayEvaluation';
import { repairBaseReactFlowFinalCommercialDetours } from './baseReactFlowDisplayCommercialDetourRepair';
import { auditBaseReactFlowDisplayCommercialQuality } from './baseReactFlowDisplayCommercialQuality';
import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import { withExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import { repairBaseReactFlowDisplayPerimeterClosure } from './baseReactFlowDisplayPerimeterClosure';
import { repairBaseReactFlowDisplayEndpointTrunkClearance } from './baseReactFlowDisplayEndpointTrunkClearance';
import { compareEdgePathQualityScores } from '../../strategies/shared/edgePathQualityGeometry';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { preservesCommercialTrueTrunkMembership } from './baseReactFlowDisplayTrueTrunkContract';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { repairDisplayDualTrunkJunctions } from './baseReactFlowDisplayDualTrunkJunctionRepair';

const endpointTopologyDoesNotRegress = (before: Edge[], after: Edge[], nodes: Node[]): boolean => {
  const baseline = auditFinalSameSideEndpointOrder(before, nodes);
  const candidate = auditFinalSameSideEndpointOrder(after, nodes);
  return candidate.inversions <= baseline.inversions
    && candidate.ambiguousLaneTies <= baseline.ambiguousLaneTies
    && candidate.collapsedLanePairs <= baseline.collapsedLanePairs
    && preservesCommercialTrueTrunkMembership(baseline.legalSharedTrunks, candidate.legalSharedTrunks);
};

export const isCommercialClearanceOnlyFailure = (
  response: DisplayEdgesWorkerResponse,
): boolean => Boolean(
  response.edges
  && response.hardReport
  && displayHardQualityReportGeometryIsClean(response.hardReport)
  && response.hardReport.terminalsAnchored
  && (response.hardReport.commercialClearanceViolations ?? 0) > 0,
);

const finalizeExactCommercialDetours = ({
  exactBaseline,
  repairNodes,
  exactReport,
}: Readonly<{
  exactBaseline: DisplayEdgesWorkerResponse;
  repairNodes: Node[];
  exactReport: (
    candidate: DisplayEdgesWorkerResponse,
    repairNodes: Node[],
  ) => DisplayEdgesWorkerResponse;
}>): DisplayEdgesWorkerResponse => {
  const baselineEdges = exactBaseline.edges;
  if (!exactBaseline.hardClean || !baselineEdges) return exactBaseline;
  const baselineIssues = auditBaseReactFlowDisplayCommercialQuality(baselineEdges);
  // Reuse the shared scorer's excessive-detour classification. A modest
  // obstacle bypass must not restart the complete optimizer at final commit.
  const needsDetourPolish = (exactBaseline.hardReport?.quality.detourPenalty ?? 0) > 0;
  if (baselineIssues.length === 0 && !needsDetourPolish) return exactBaseline;
  const shortenedEdges = repairBaseReactFlowFinalCommercialDetours(
    baselineEdges,
    repairNodes,
    { preferredEdges: baselineEdges, skipLoopShortcut: !needsDetourPolish },
  );
  if (shortenedEdges === baselineEdges) return exactBaseline;
  // Shortening and clearance share one commit: judging an intermediate route
  // discards useful shortcuts or commits a shorter path too close to a node.
  const repairedEdges = repairBaseReactFlowMinimumBusinessNodeClearance(
    shortenedEdges, repairNodes, undefined, false,
  );
  const changedEdgeIndexes = repairedEdges.flatMap((edge, index) => (
    edge === baselineEdges[index] ? [] : [index]
  ));
  const repairedIssues = auditBaseReactFlowDisplayCommercialQuality(repairedEdges);
  if (
    changedEdgeIndexes.length === 0
    || repairedIssues.length > baselineIssues.length
  ) return exactBaseline;
  const repairedResponse = exactReport({
    ...exactBaseline,
    edges: lockFinalDisplayComputedPaths(repairedEdges, repairNodes),
  }, repairNodes);
  const qualityImproves = repairedIssues.length < baselineIssues.length || (
    repairedResponse.hardReport && exactBaseline.hardReport
    && compareEdgePathQualityScores(repairedResponse.hardReport.quality, exactBaseline.hardReport.quality) < 0
  );
  return repairedResponse.hardClean && qualityImproves
    && endpointTopologyDoesNotRegress(baselineEdges, repairedResponse.edges ?? [], repairNodes)
    ? repairedResponse : exactBaseline;
};

/**
 * Repairs structural detours and the 48px commercial clearance contract only
 * after all geometry mutation has finished. The exact locked report is the
 * sole commit gate; any crossing, terminal, obstacle, minimum-clearance, or
 * commercial regression rolls the entire candidate back to the exact baseline.
 */
const finalizeExactCommercialClearanceCandidate = ({
  exactBaseline,
  repairNodes,
  eligibleEdgeIds,
  exactReport = withExactDisplayHardReport,
}: Readonly<{
  exactBaseline: DisplayEdgesWorkerResponse;
  repairNodes: Node[];
  eligibleEdgeIds?: ReadonlySet<string>;
  exactReport?: (
    candidate: DisplayEdgesWorkerResponse,
    repairNodes: Node[],
  ) => DisplayEdgesWorkerResponse;
}>): DisplayEdgesWorkerResponse => {
  const commerciallyPolishedBaseline = !eligibleEdgeIds
    && exactBaseline.routeResolution !== 'incremental-route'
    ? finalizeExactCommercialDetours({ exactBaseline, repairNodes, exactReport })
    : exactBaseline;
  if (commerciallyPolishedBaseline.hardClean) return commerciallyPolishedBaseline;
  const fullGraph = !eligibleEdgeIds && commerciallyPolishedBaseline.routeResolution !== 'incremental-route';
  if (isCommercialClearanceOnlyFailure(commerciallyPolishedBaseline)) {
    const baselineEdges = commerciallyPolishedBaseline.edges ?? [];
    const sharedCandidate = repairBaseReactFlowDisplayEndpointTrunkClearance(
      baselineEdges, repairNodes, { eligibleEdgeIds },
    );
    if (sharedCandidate !== baselineEdges) {
      const repaired = exactReport({
        ...commerciallyPolishedBaseline,
        edges: lockFinalDisplayComputedPaths(sharedCandidate, repairNodes),
      }, repairNodes);
      if (repaired.hardClean) return repaired;
    }
    // Repair independent passages, then close their shared endpoint groups in
    // the same transaction. Neither intermediate state is published.
    const clearance = repairBaseReactFlowMinimumBusinessNodeClearance(
      baselineEdges, repairNodes, eligibleEdgeIds, false,
    );
    if (clearance !== baselineEdges) {
      const closed = repairBaseReactFlowDisplayEndpointTrunkClearance(
        clearance, repairNodes, { eligibleEdgeIds },
      );
      const repaired = exactReport({
        ...commerciallyPolishedBaseline,
        edges: lockFinalDisplayComputedPaths(closed, repairNodes),
      }, repairNodes);
      if (repaired.hardClean
        && countRenderUnsafeEndpointStubs(repaired.edges ?? []) <= countRenderUnsafeEndpointStubs(baselineEdges)
        && endpointTopologyDoesNotRegress(baselineEdges, repaired.edges ?? [], repairNodes)) return repaired;
    }
  }
  // A full layout can be trapped by existing local trunks. Only full-graph
  // transactions may use this bounded geometric closure; incremental frozen
  // boundaries and source-authored terminal constraints remain untouched.
  if (fullGraph && commerciallyPolishedBaseline.edges) {
    const closed = repairBaseReactFlowDisplayPerimeterClosure(
      commerciallyPolishedBaseline.edges,
      repairNodes,
    );
    if (closed !== commerciallyPolishedBaseline.edges) {
      const repaired = exactReport({
        ...commerciallyPolishedBaseline,
        edges: lockFinalDisplayComputedPaths(closed, repairNodes),
      }, repairNodes);
      if (repaired.hardClean) return repaired;
    }
  }
  return commerciallyPolishedBaseline;
};

export const finalizeBaseReactFlowExactCommercialClearance = (
  args: Parameters<typeof finalizeExactCommercialClearanceCandidate>[0],
): DisplayEdgesWorkerResponse => {
  const response = finalizeExactCommercialClearanceCandidate(args);
  if (!response.hardClean || !response.edges) return response;
  const separated = repairDisplayDualTrunkJunctions(response.edges, args.repairNodes, args.eligibleEdgeIds);
  if (separated === response.edges) return response;
  const exact = (args.exactReport ?? withExactDisplayHardReport)({
    ...response, edges: lockFinalDisplayComputedPaths(separated, args.repairNodes),
  }, args.repairNodes);
  return exact.hardClean ? exact : response;
};
