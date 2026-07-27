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
import { sanitizeBaseReactFlowPrecompiledRoutePatches } from './baseReactFlowPrecompiledRouteArtifact';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDisplayCachePatches,
} from './baseReactFlowDisplayRoutingTransaction';
import {
  parseDisplayEdgesWorkerRequest,
  readDisplayEdgesWorkerRequestId,
  type DisplayEdgesWorkerRequest,
  type DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { createBaseReactFlowIncrementalDisplayEdges } from './baseReactFlowDisplayIncrementalRoute';

interface DisplayEdgesWorkerScope {
  postMessage: (response: DisplayEdgesWorkerResponse) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

const displayEdgesWorkerScope = typeof self !== 'undefined'
  && !('document' in self)
  ? self as unknown as DisplayEdgesWorkerScope
  : null;

const postDisplayEdgesResponse = (response: DisplayEdgesWorkerResponse): void => {
  displayEdgesWorkerScope?.postMessage(response);
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
  const phaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordPhaseTrace = (trace: DisplayRoutingPhaseTrace): void => {
    if (phaseTrace.length < 32) phaseTrace.push(trace);
    postDisplayEdgesResponse({
      requestId: request.requestId,
      phaseProgress: trace,
    });
  };
  if (request.operation === 'repair') {
    const repairTimer = startDisplayRoutingPhaseTrace({
      phase: 'measured-repair',
      candidateCount: request.edges.length,
      onTrace: recordPhaseTrace,
    });
    const repaired = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      request.edges,
      request.nodes,
    );
    repairTimer.finish(repaired.report.hardClean ? 'accepted' : 'rejected', repaired.edges.length);
    return {
      requestId: request.requestId,
      edges: repaired.edges,
      hardClean: repaired.report.hardClean,
      routeResolution: 'repair',
      phaseTrace,
    };
  }
  let incrementalAffectedEdgeCount: number | undefined;
  if (request.operation === 'incremental-route') {
    const incremental = createBaseReactFlowIncrementalDisplayEdges({
      request,
      onPhaseTrace: recordPhaseTrace,
      onBoundedCandidate,
    });
    incrementalAffectedEdgeCount = incremental.affectedEdgeCount;
    if (incremental.edges) {
      return {
        requestId: request.requestId,
        edges: incremental.edges,
        hardClean: true,
        routeResolution: 'incremental-route',
        phaseTrace,
        affectedEdgeCount: incremental.affectedEdgeCount,
        fallbackLevel: 'none',
      };
    }
  }
  const incrementalFallbackMetadata = request.operation === 'incremental-route'
    ? {
      affectedEdgeCount: incrementalAffectedEdgeCount ?? 0,
      fallbackLevel: 'full' as const,
    }
    : {};
  const safeCandidatePatches = request.operation === 'validate-or-route'
    && request.candidatePatches
    ? (request.candidateSource === 'precompiled'
      ? sanitizeBaseReactFlowPrecompiledRoutePatches(request.edges, request.candidatePatches)
      : sanitizeBaseReactFlowDisplayCachePatches(request.edges, request.candidatePatches))
    : null;
  const candidateEdges = request.operation === 'validate-or-route'
    ? (request.candidateEdges
      ?? (safeCandidatePatches
        ? mergeBaseReactFlowDisplayEdgePatches(request.edges, safeCandidatePatches)
        : null))
    : null;
  const candidateTimer = startDisplayRoutingPhaseTrace({
    phase: 'candidate-validation',
    candidateCount: candidateEdges?.length ?? 0,
    onTrace: recordPhaseTrace,
  });
  if (
    candidateEdges
    && doesDisplayCandidateMatchSourceGraph(request.edges, candidateEdges)
    && baseReactFlowDisplayHardQualityIsClean(candidateEdges, request.nodes)
  ) {
    candidateTimer.finish('hit');
    return {
      requestId: request.requestId,
      edges: candidateEdges,
      hardClean: true,
      routeResolution: 'validated-candidate',
      phaseTrace,
    };
  }
  candidateTimer.finish(candidateEdges ? 'rejected' : 'skip');
  const commonInput = {
    edges: request.edges,
    nodes: request.nodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
    displayEdgeEpoch: request.displayEdgeEpoch,
  };
  if (request.qualityMode === 'interactive') {
    const interactiveTimer = startDisplayRoutingPhaseTrace({
      phase: 'quality',
      candidateCount: request.edges.length,
      onTrace: recordPhaseTrace,
    });
    const edges = createBaseReactFlowInteractiveDisplayEdges(commonInput);
    interactiveTimer.finish('accepted', edges.length);
    return {
      requestId: request.requestId,
      edges,
      hardClean: baseReactFlowDisplayHardQualityIsClean(edges, request.nodes),
      routeResolution: 'full-route',
      phaseTrace,
      ...incrementalFallbackMetadata,
    };
  }

  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  let exactReport: BaseReactFlowDisplayExactReport | undefined;
  const fullRouteEdges = createBaseReactFlowFullRouteEdges({
    ...commonInput,
    onPhaseTrace: recordPhaseTrace,
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
  const finalizerTimer = startDisplayRoutingPhaseTrace({
    phase: 'finalizer',
    candidateCount: fullRouteEdges.length,
    onTrace: recordPhaseTrace,
  });
  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    fullRouteEdges,
    request.nodes,
    exactReport,
  );
  finalizerTimer.finish(finalized.report.hardClean ? 'accepted' : 'fallback', finalized.edges.length);
  if (!finalized.report.hardClean) {
    const repairTimer = startDisplayRoutingPhaseTrace({
      phase: 'measured-repair',
      candidateCount: finalized.edges.length,
      onTrace: recordPhaseTrace,
    });
    const repaired = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      finalized.edges,
      request.nodes,
    );
    repairTimer.finish(repaired.report.hardClean ? 'accepted' : 'rejected', repaired.edges.length);
    return {
      requestId: request.requestId,
      edges: repaired.edges,
      hardClean: repaired.report.hardClean,
      routeResolution: 'full-route-repaired',
      phaseTrace,
      ...incrementalFallbackMetadata,
    };
  }
  return {
    requestId: request.requestId,
    edges: finalized.edges,
    hardClean: finalized.report.hardClean,
    routeResolution: 'full-route',
    phaseTrace,
    ...incrementalFallbackMetadata,
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

if (displayEdgesWorkerScope) {
  displayEdgesWorkerScope.onmessage = (event: MessageEvent<unknown>) => {
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
