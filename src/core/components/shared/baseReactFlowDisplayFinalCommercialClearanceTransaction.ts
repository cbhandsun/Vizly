import type { Node } from '@xyflow/react';

import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import {
  repairBaseReactFlowMinimumBusinessNodeClearance,
} from './baseReactFlowDisplayBusinessNodeClearance';
import { displayHardQualityReportGeometryIsClean } from './baseReactFlowDisplayEvaluation';
import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import { withExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';

const isCommercialClearanceOnlyFailure = (
  response: DisplayEdgesWorkerResponse,
): boolean => Boolean(
  response.edges
  && response.hardReport
  && displayHardQualityReportGeometryIsClean(response.hardReport)
  && response.hardReport.terminalsAnchored
  && (response.hardReport.commercialClearanceViolations ?? 0) > 0,
);

/**
 * Repairs the 48px commercial contract only after all geometry mutation has
 * finished. The exact locked report is the sole commit gate; any crossing,
 * terminal, obstacle, minimum-clearance, or commercial regression rolls the
 * entire candidate back to the exact baseline.
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
  if (exactBaseline.hardClean || !isCommercialClearanceOnlyFailure(exactBaseline)) {
    return exactBaseline;
  }
  const repairedEdges = repairBaseReactFlowMinimumBusinessNodeClearance(
    exactBaseline.edges ?? [],
    repairNodes,
    eligibleEdgeIds,
    false,
  );
  const lockedEdges = lockFinalDisplayComputedPaths(repairedEdges, repairNodes);
  const repairedResponse = exactReport({
    ...exactBaseline,
    edges: lockedEdges,
  }, repairNodes);
  return repairedResponse.hardClean ? repairedResponse : exactBaseline;
};
