import type { Node } from '@xyflow/react';

import { computeBaseDisplayInputSignature } from './baseReactFlowDisplayEdgeCore';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  createBaseReactFlowDisplayExactReport,
  finalizeBaseReactFlowDisplayEdgesWithReport,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';
import { closeBaseReactFlowFinalDisplayRoute } from './baseReactFlowDisplayFinalRouteClosure';
import { closeBaseReactFlowDisplayWorkerEndpointContract } from './baseReactFlowDisplayWorkerEndpointClosure';
import { createBaseReactFlowFullRouteEdges } from './baseReactFlowDisplayFullRoutePipeline';
import type { BaseReactFlowDisplayEdgesArgs } from './baseReactFlowDisplayFullRouteTypes';
import { createBaseReactFlowFullRouteEvaluationSession } from './baseReactFlowDisplayFullRouteEvaluationSession';
import { repairBaseReactFlowMeasuredDisplayEdgesWithReport } from './baseReactFlowDisplayMeasuredRepair';
import { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import { withExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import {
  finishDisplayWorkerFinalization,
  type DisplayWorkerFinalEvaluation,
  type DisplayWorkerFinalizationOptions,
} from './baseReactFlowDisplayWorkerFinalEvaluation';
import { startDisplayRoutingPhaseTrace, type DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';

type WorkerFullRouteInput = Readonly<{
  request: Exclude<DisplayEdgesWorkerRequest, { operation: 'repair' }>;
  commonInput: BaseReactFlowDisplayEdgesArgs;
  escalatedFromInteractive: boolean;
  preparedInteractiveEdges?: BaseReactFlowDisplayEdgesArgs['edges'];
  phaseTrace: DisplayRoutingPhaseTrace[];
  fallbackMetadata: Readonly<{ affectedEdgeCount?: number; fallbackLevel?: 'full' }>;
  onPhaseTrace: (trace: DisplayRoutingPhaseTrace) => void;
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void;
  completeResponse: (response: DisplayEdgesWorkerResponse) => DisplayEdgesWorkerResponse;
  finalizeResponse: (
    response: DisplayEdgesWorkerResponse,
    nodes: Node[],
    options: DisplayWorkerFinalizationOptions,
  ) => DisplayEdgesWorkerResponse;
}>;

/** Owns the expensive full-route branch of one Worker transaction. */
export const runBaseReactFlowDisplayWorkerFullRoute = ({
  request,
  commonInput,
  escalatedFromInteractive,
  preparedInteractiveEdges,
  phaseTrace,
  fallbackMetadata,
  onPhaseTrace,
  onBoundedCandidate,
  completeResponse,
  finalizeResponse,
}: WorkerFullRouteInput): DisplayEdgesWorkerResponse => {
  const fullRouteSession = createBaseReactFlowFullRouteEvaluationSession(request.nodes);
  const { evaluation: fullRouteEvaluation, repairNodes } = fullRouteSession;
  const fullRouteFinalEvaluation: DisplayWorkerFinalEvaluation = {
    repairNodes,
    evaluation: fullRouteEvaluation,
    hardQualityIsClean: edges => fullRouteEvaluation.hardReport(edges).hardClean,
  };
  let fullRouteExactReport: BaseReactFlowDisplayExactReport | undefined;
  const fullRouteEdges = createBaseReactFlowFullRouteEdges({
    ...commonInput,
    forceFullQuality: request.qualityMode === 'full' || escalatedFromInteractive,
    preparedInteractiveEdges,
    onPhaseTrace,
    evaluationSession: fullRouteEvaluation,
    createPreDisplayFinalEdges: (preDisplayArgs) => {
      let boundedReport: BaseDisplayBoundedCandidateReport | undefined;
      const boundedEdges = createBaseReactFlowPreDisplayFinalEdges({
        ...preDisplayArgs,
        onBoundedCandidate: (report) => {
          boundedReport = report;
          preDisplayArgs.onBoundedCandidate?.(report);
          onBoundedCandidate?.(report);
        },
      });
      if (boundedReport) {
        fullRouteExactReport = createBaseReactFlowDisplayExactReport(
          boundedEdges,
          request.nodes,
          repairNodes,
          boundedReport,
        );
      }
      return boundedEdges;
    },
  });
  const exactReport = fullRouteSession.exactReport(fullRouteEdges);
  const inputSignature = computeBaseDisplayInputSignature({
    nodes: request.nodes,
    edges: request.edges,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
  });
  const closeFinalContract = (response: DisplayEdgesWorkerResponse): DisplayEdgesWorkerResponse => {
    if (response.hardClean === true) return response;
    const closedEdges = closeBaseReactFlowFinalDisplayRoute({
      args: {
        ...commonInput,
        evaluationSession: fullRouteEvaluation,
        onPhaseTrace,
      },
      routedEdges: fullRouteEdges,
      repairNodes,
      inputSignature,
      exactReport: fullRouteExactReport,
    });
    const endpointClosedEdges = closeBaseReactFlowDisplayWorkerEndpointContract(
      closedEdges,
      repairNodes,
    );
    const closedResponse = withExactDisplayHardReport({
      ...response,
      edges: endpointClosedEdges,
    }, repairNodes);
    return closedResponse.hardClean === true ? closedResponse : response;
  };
  const finalizerTimer = startDisplayRoutingPhaseTrace({
    phase: 'finalizer',
    candidateCount: fullRouteEdges.length,
    onTrace: onPhaseTrace,
  });
  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    fullRouteEdges,
    request.nodes,
    exactReport,
    onPhaseTrace,
    false,
    false,
  );
  fullRouteEvaluation.rememberHardReport(finalized.edges, finalized.report);
  if (!finalized.report.hardClean) {
    const repairTimer = startDisplayRoutingPhaseTrace({
      phase: 'measured-repair',
      candidateCount: finalized.edges.length,
      onTrace: onPhaseTrace,
    });
    const repaired = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      finalized.edges,
      request.nodes,
      {
        edges: finalized.edges,
        inputNodes: request.nodes,
        repairNodes,
        report: finalized.report,
      },
      false,
      onPhaseTrace,
      false,
    );
    repairTimer.finish(repaired.report.hardClean ? 'accepted' : 'rejected', repaired.edges.length);
    fullRouteEvaluation.rememberHardReport(repaired.edges, repaired.report);
    const repairedResponse = finalizeResponse({
      requestId: request.requestId,
      edges: repaired.edges,
      hardClean: repaired.report.hardClean,
      routeResolution: 'full-route-repaired',
      phaseTrace,
      ...fallbackMetadata,
    }, request.nodes, {
      initialHardReport: repaired.report,
      initialHardReportEdges: repaired.edges,
      finalEvaluation: fullRouteFinalEvaluation,
      isLargeGraph: request.isLargeGraph,
      onPhaseTrace,
      preferredEdges: request.edges,
    });
    return completeResponse(finishDisplayWorkerFinalization(
      finalizerTimer,
      closeFinalContract(repairedResponse),
    ));
  }
  const finalizedResponse = finalizeResponse({
    requestId: request.requestId,
    edges: finalized.edges,
    hardClean: finalized.report.hardClean,
    routeResolution: 'full-route',
    phaseTrace,
    ...fallbackMetadata,
  }, request.nodes, {
    initialHardReport: finalized.report,
    initialHardReportEdges: finalized.edges,
    finalEvaluation: fullRouteFinalEvaluation,
    isLargeGraph: request.isLargeGraph,
    onPhaseTrace,
    preferredEdges: request.edges,
  });
  return completeResponse(finishDisplayWorkerFinalization(
    finalizerTimer,
    closeFinalContract(finalizedResponse),
  ));
};
