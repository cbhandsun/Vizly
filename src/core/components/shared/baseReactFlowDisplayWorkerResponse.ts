import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import { analyzeFinalDisplayRenderContract } from './baseReactFlowDisplayCandidateValidation';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import {
  displayHardQualityReportGeometryIsClean,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { countDisplayBusinessNodeCommercialClearanceViolations } from './baseReactFlowDisplayBusinessNodeClearance';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { calculateEdgePathQualityScoreExact } from '../../strategies/shared/edgePathQualityFullScan';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

export const getExactDisplayHardReport = (
  edges: NonNullable<DisplayEdgesWorkerResponse['edges']>,
  repairNodes: DisplayEdgesWorkerRequest['nodes'],
): BaseDisplayBoundedCandidateReport => {
  const cachedHardReport = getDisplayHardQualityGateReport(
    edges,
    repairNodes,
    'polished',
  );
  const baseHardReport: BaseDisplayBoundedCandidateReport = {
    ...cachedHardReport,
    quality: calculateEdgePathQualityScoreExact(compactDisplayEdgePaths(edges)),
  };
  baseHardReport.hardClean = displayHardQualityReportGeometryIsClean(baseHardReport)
    && baseHardReport.terminalsAnchored;
  const commercialClearanceViolations = countDisplayBusinessNodeCommercialClearanceViolations(
    edges,
    repairNodes,
  );
  return {
    ...baseHardReport,
    hardClean: baseHardReport.hardClean && commercialClearanceViolations === 0,
    commercialClearanceViolations,
  };
};

export const withExactDisplayHardReport = (
  response: DisplayEdgesWorkerResponse,
  repairNodes: DisplayEdgesWorkerRequest['nodes'],
): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const hardReport = getExactDisplayHardReport(
    response.edges,
    repairNodes,
  );
  return {
    ...response,
    hardClean: hardReport.hardClean,
    hardReport,
  };
};

/** Finalizes a Worker-owned incremental route only when locking changes no gate input. */
export const finalizeStableIncrementalDisplayResponse = (
  response: DisplayEdgesWorkerResponse,
  stableEdges: NonNullable<DisplayEdgesWorkerResponse['edges']>,
  repairNodes: DisplayEdgesWorkerRequest['nodes'],
  hardReport: BaseDisplayBoundedCandidateReport,
): DisplayEdgesWorkerResponse | null => {
  if (response.routeResolution !== 'incremental-route' || !hardReport.hardClean) return null;
  const lockedEdges = lockFinalDisplayComputedPaths(stableEdges, repairNodes);
  if (!analyzeFinalDisplayRenderContract(stableEdges, lockedEdges).lockedHardGateInputsMatch) {
    return null;
  }
  return withExactDisplayHardReport(
    { ...response, edges: lockedEdges },
    repairNodes,
  );
};
