import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import { analyzeFinalDisplayRenderContract } from './baseReactFlowDisplayCandidateValidation';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { countDisplayBusinessNodeCommercialClearanceViolations } from './baseReactFlowDisplayBusinessNodeClearance';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

export const getExactDisplayHardReport = (
  edges: NonNullable<DisplayEdgesWorkerResponse['edges']>,
  repairNodes: DisplayEdgesWorkerRequest['nodes'],
  existingReport?: BaseDisplayBoundedCandidateReport,
): BaseDisplayBoundedCandidateReport => {
  const baseHardReport = existingReport ?? getDisplayHardQualityGateReport(
    edges,
    repairNodes,
    'polished',
  );
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
  existingReport?: BaseDisplayBoundedCandidateReport,
): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const hardReport = getExactDisplayHardReport(
    response.edges,
    repairNodes,
    existingReport,
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
    hardReport,
  );
};
