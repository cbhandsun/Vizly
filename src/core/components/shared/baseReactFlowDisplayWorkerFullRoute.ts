import type { Node } from '@xyflow/react';

import { computeBaseDisplayInputSignature } from './baseReactFlowDisplayEdgeCore';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  finalizeBaseReactFlowDisplayEdgesWithReport,
} from './baseReactFlowDisplayFinalizer';
import { closeBaseReactFlowFinalDisplayRoute } from './baseReactFlowDisplayFinalRouteClosure';
import { closeBaseReactFlowDisplayWorkerEndpointContract } from './baseReactFlowDisplayWorkerEndpointClosure';
import { createBaseReactFlowFullRouteEdges } from './baseReactFlowDisplayFullRoutePipeline';
import type { BaseReactFlowDisplayEdgesArgs } from './baseReactFlowDisplayFullRouteTypes';
import { createBaseReactFlowFullRouteEvaluationSession } from './baseReactFlowDisplayFullRouteEvaluationSession';
import { diffBaseReactFlowEvaluationMetrics } from './baseReactFlowDisplayFinalEndpointEvaluation';
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

export const resolveBaseReactFlowFullRouteClosureSeed = (
  response: Pick<DisplayEdgesWorkerResponse, 'edges'>,
  fullRouteEdges: BaseReactFlowDisplayEdgesArgs['edges'],
): BaseReactFlowDisplayEdgesArgs['edges'] => (
  response.edges?.length ? response.edges : fullRouteEdges
);

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
  const fullRouteEdges = createBaseReactFlowFullRouteEdges({
    ...commonInput,
    forceFullQuality: request.qualityMode === 'full' || escalatedFromInteractive,
    preparedInteractiveEdges,
    onPhaseTrace,
    evaluationSession: fullRouteEvaluation,
    createPreDisplayFinalEdges: (preDisplayArgs) => {
      return createBaseReactFlowPreDisplayFinalEdges({
        ...preDisplayArgs,
        onBoundedCandidate: (report) => {
          preDisplayArgs.onBoundedCandidate?.(report);
          onBoundedCandidate?.(report);
        },
      });
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
    const closureSeed = resolveBaseReactFlowFullRouteClosureSeed(response, fullRouteEdges);
    const closedEdges = closeBaseReactFlowFinalDisplayRoute({
      args: {
        ...commonInput,
        evaluationSession: fullRouteEvaluation,
        onPhaseTrace,
      },
      routedEdges: closureSeed,
      repairNodes,
      inputSignature,
      exactReport: closureSeed === fullRouteEdges ? exactReport : undefined,
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
  const finalizerMetricsBefore = fullRouteEvaluation.readMetrics();
  const completeFullRouteFinalization = (
    response: DisplayEdgesWorkerResponse,
  ): DisplayEdgesWorkerResponse => completeResponse(
    finishDisplayWorkerFinalization(
      finalizerTimer,
      closeFinalContract(response),
      undefined,
      diffBaseReactFlowEvaluationMetrics(
        finalizerMetricsBefore,
        fullRouteEvaluation.readMetrics(),
      ),
    ),
  );
  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    fullRouteEdges,
    request.nodes,
    exactReport,
    onPhaseTrace,
    false,
    false,
    fullRouteEvaluation,
  );
  fullRouteEvaluation.rememberHardReport(finalized.edges, finalized.report);
  if (!finalized.report.hardClean) {
    const repaired = finalized.measuredRepairReachedFixedPoint
      ? (() => {
        startDisplayRoutingPhaseTrace({
          phase: 'measured-repair',
          candidateCount: finalized.edges.length,
          onTrace: onPhaseTrace,
        }).finish('hit', 0, {
          cacheHitCount: 1,
        });
        return finalized;
      })()
      : (() => {
        const repairTimer = startDisplayRoutingPhaseTrace({
          phase: 'measured-repair',
          candidateCount: finalized.edges.length,
          onTrace: onPhaseTrace,
        });
        const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
          finalized.edges,
          request.nodes,
          {
            edges: finalized.edges,
            inputNodes: request.nodes,
            repairNodes,
            report: finalized.report,
            evaluation: fullRouteEvaluation,
          },
          false,
          onPhaseTrace,
          false,
        );
        repairTimer.finish(outcome.report.hardClean ? 'accepted' : 'rejected', outcome.edges.length);
        return outcome;
      })();
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
    return completeFullRouteFinalization(repairedResponse);
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
  return completeFullRouteFinalization(finalizedResponse);
};
