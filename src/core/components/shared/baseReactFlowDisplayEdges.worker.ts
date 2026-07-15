import {
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowDisplayExactReport,
  finalizeBaseReactFlowDisplayEdgesWithReport,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';
import { createBaseReactFlowFullRouteEdges } from './baseReactFlowDisplayFullRoutePipeline';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { repairBaseReactFlowMeasuredDisplayEdgesWithReport } from './baseReactFlowDisplayMeasuredRepair';
import { baseReactFlowDisplayHardQualityIsClean } from './baseReactFlowDisplayQualityGates';
import { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';
import {
  parseDisplayEdgesWorkerRequest,
  readDisplayEdgesWorkerRequestId,
  type DisplayEdgesWorkerRequest,
  type DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

const postDisplayEdgesResponse = (response: DisplayEdgesWorkerResponse): void => {
  (self as any).postMessage(response);
};

const doesDisplayCandidateMatchSourceGraph = (
  sourceEdges: DisplayEdgesWorkerRequest['edges'],
  candidateEdges: DisplayEdgesWorkerRequest['edges'],
): boolean => (
  sourceEdges.length === candidateEdges.length
  && sourceEdges.every((edge, index) => {
    const candidate = candidateEdges[index];
    return candidate?.id === edge.id
      && candidate.source === edge.source
      && candidate.target === edge.target;
  })
);

export const computeBaseReactFlowDisplayEdgesWorkerResponse = (
  request: DisplayEdgesWorkerRequest,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
): DisplayEdgesWorkerResponse => {
  if (request.operation === 'repair') {
    const repaired = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      request.edges,
      request.nodes,
    );
    return {
      requestId: request.requestId,
      edges: repaired.edges,
      hardClean: repaired.report.hardClean,
      routeResolution: 'repair',
    };
  }
  if (
    request.operation === 'validate-or-route'
    && request.candidateEdges
    && doesDisplayCandidateMatchSourceGraph(request.edges, request.candidateEdges)
    && baseReactFlowDisplayHardQualityIsClean(request.candidateEdges, request.nodes)
  ) {
    return {
      requestId: request.requestId,
      edges: request.candidateEdges,
      hardClean: true,
      routeResolution: 'validated-candidate',
    };
  }
  const commonInput = {
    edges: request.edges,
    nodes: request.nodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
    displayEdgeEpoch: request.displayEdgeEpoch,
  };
  if (request.qualityMode === 'interactive') {
    const edges = createBaseReactFlowInteractiveDisplayEdges(commonInput);
    return {
      requestId: request.requestId,
      edges,
      hardClean: baseReactFlowDisplayHardQualityIsClean(edges, request.nodes),
      routeResolution: 'full-route',
    };
  }

  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  let exactReport: BaseReactFlowDisplayExactReport | undefined;
  const fullRouteEdges = createBaseReactFlowFullRouteEdges({
    ...commonInput,
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
        exactReport = createBaseReactFlowDisplayExactReport(
          boundedEdges,
          request.nodes,
          repairNodes,
          boundedReport,
        );
      }
      return boundedEdges;
    },
  });
  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    fullRouteEdges,
    request.nodes,
    exactReport,
  );
  return {
    requestId: request.requestId,
    edges: finalized.edges,
    hardClean: finalized.report.hardClean,
    routeResolution: 'full-route',
  };
};

export const handleBaseReactFlowDisplayWorkerMessage = (
  value: unknown,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
): DisplayEdgesWorkerResponse => {
  const request = parseDisplayEdgesWorkerRequest(value);
  if (!request) {
    return {
      requestId: readDisplayEdgesWorkerRequestId(value) ?? 'invalid-request',
      error: 'display-edge-worker-invalid-request',
    };
  }
  return computeBaseReactFlowDisplayEdgesWorkerResponse(request, onBoundedCandidate);
};

const isDisplayEdgesWorkerScope = typeof self !== 'undefined'
  && typeof (self as any).postMessage === 'function'
  && typeof (self as any).document === 'undefined';

if (isDisplayEdgesWorkerScope) {
  (self as any).onmessage = (event: MessageEvent<unknown>) => {
    const requestId = readDisplayEdgesWorkerRequestId(event.data) ?? 'invalid-request';
    try {
      const response = handleBaseReactFlowDisplayWorkerMessage(
        event.data,
        (boundedCandidate) => {
          if (!boundedCandidate.hardClean) {
            postDisplayEdgesResponse({ requestId, boundedCandidate });
          }
        },
      );
      postDisplayEdgesResponse(response);
    } catch {
      postDisplayEdgesResponse({
        requestId,
        error: 'display-edge-worker-failed',
      });
    }
  };
}
