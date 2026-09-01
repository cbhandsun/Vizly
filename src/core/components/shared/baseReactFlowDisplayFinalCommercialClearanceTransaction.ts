import type { Node } from '@xyflow/react';

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

const isCommercialClearanceOnlyFailure = (
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
  if (baselineIssues.length === 0) return exactBaseline;
  const repairedEdges = repairBaseReactFlowFinalCommercialDetours(
    baselineEdges,
    repairNodes,
    { preferredEdges: baselineEdges, skipLoopShortcut: true },
  );
  if (repairedEdges === baselineEdges) return exactBaseline;
  const changedEdgeIndexes = repairedEdges.flatMap((edge, index) => (
    edge === baselineEdges[index] ? [] : [index]
  ));
  const repairedIssues = auditBaseReactFlowDisplayCommercialQuality(repairedEdges);
  if (
    changedEdgeIndexes.length === 0
    || repairedIssues.length >= baselineIssues.length
  ) return exactBaseline;
  const repairedResponse = exactReport({
    ...exactBaseline,
    edges: lockFinalDisplayComputedPaths(repairedEdges, repairNodes),
  }, repairNodes);
  return repairedResponse.hardClean ? repairedResponse : exactBaseline;
};

/**
 * Repairs structural detours and the 48px commercial clearance contract only
 * after all geometry mutation has finished. The exact locked report is the
 * sole commit gate; any crossing, terminal, obstacle, minimum-clearance, or
 * commercial regression rolls the entire candidate back to the exact baseline.
 */
export const finalizeBaseReactFlowExactCommercialClearance = ({
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
  // A full layout can be trapped by existing local trunks. Only full-graph
  // transactions may use this bounded geometric closure; incremental frozen
  // boundaries and source-authored terminal constraints remain untouched.
  if (!eligibleEdgeIds && commerciallyPolishedBaseline.edges
    && commerciallyPolishedBaseline.routeResolution !== 'incremental-route') {
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
  if (!isCommercialClearanceOnlyFailure(commerciallyPolishedBaseline)) {
    return commerciallyPolishedBaseline;
  }
  const repairedEdges = repairBaseReactFlowMinimumBusinessNodeClearance(
    commerciallyPolishedBaseline.edges ?? [],
    repairNodes,
    eligibleEdgeIds,
    false,
  );
  const lockedEdges = lockFinalDisplayComputedPaths(repairedEdges, repairNodes);
  const repairedResponse = exactReport({
    ...commerciallyPolishedBaseline,
    edges: lockedEdges,
  }, repairNodes);
  return repairedResponse.hardClean ? repairedResponse : commerciallyPolishedBaseline;
};
