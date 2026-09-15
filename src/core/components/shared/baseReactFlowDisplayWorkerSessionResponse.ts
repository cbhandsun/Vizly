import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import { createBaseReactFlowDisplayEdgePatches } from './baseReactFlowDisplayRoutingTransaction';
import {
  finalizeDisplayRoutingPhaseTrace,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { createDisplayRoutingIdentity } from './baseReactFlowDisplayRoutingSession';
import {
  readDisplayRoutingWorkerSession,
  readDisplayRoutingWorkerSessionByIdentity,
  writeDisplayRoutingWorkerSession,
  type DisplayRoutingWorkerSessionState,
} from './baseReactFlowDisplayWorkerSession';
import { appendDisplayRoutingPhaseTrace } from './baseReactFlowDisplayWorkerTraceRecorder';
import type {
  BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { createBaseReactFlowIncrementalDisplayEdges } from './baseReactFlowDisplayIncrementalRoute';
import { withExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import type {
  DisplayEdgesWorkerIncrementalRouteRequest,
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResolvedIncrementalRouteRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import type { DisplayRoutingWorkerSpatialSnapshot } from './baseReactFlowDisplayWorkerSpatialSnapshot';
import { createDisplayRoutingWorkerCommitReceipt } from './baseReactFlowDisplayWorkerCommitReceipt';
import { isDisplayWorkerBoundedCandidateReport } from './baseReactFlowDisplayWorkerQualityProtocol';
import { preserveDisplayTopologyFallbackRoutes } from './baseReactFlowDisplayTopologyFallbackStability';

type ResolvedDisplayWorkerIncrementalRequest = Readonly<{
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest;
  baselineSpatialSnapshot: DisplayRoutingWorkerSpatialSnapshot | null;
  exactNextSession: DisplayRoutingWorkerSessionState | null;
}>;

export const runDisplayWorkerIncrementalRequest = ({
  request,
  onPhaseTrace,
  onBoundedCandidate,
}: {
  request: DisplayEdgesWorkerIncrementalRouteRequest;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void;
}): Readonly<{
  edges: import('@xyflow/react').Edge[] | null;
  affectedEdgeCount: number;
  eligibleEdgeIds: string[];
  hardReport?: BaseDisplayBoundedCandidateReport;
}> => {
  const resolved = resolveDisplayWorkerIncrementalRequest(request);
  return resolved
    ? createBaseReactFlowIncrementalDisplayEdges({
      request: resolved.request,
      baselineSpatialSnapshot: resolved.baselineSpatialSnapshot,
      exactNextSession: resolved.exactNextSession,
      onPhaseTrace,
      onBoundedCandidate,
    })
    : { edges: null, affectedEdgeCount: 0, eligibleEdgeIds: [] };
};

export const resolveDisplayWorkerIncrementalRequest = (
  request: DisplayEdgesWorkerIncrementalRouteRequest,
): ResolvedDisplayWorkerIncrementalRequest | null => {
  const baselineIdentity = createDisplayRoutingIdentity(
    request.baselineInputSignature,
    request.baselineInputGeometryDigest,
  );
  const workerSession = readDisplayRoutingWorkerSession({
    ref: request.baselineSessionRef,
    expectedIdentity: baselineIdentity,
    expectedOutputRouteSignature: request.baselineOutputRouteSignature,
  });
  const exactNextSession = readDisplayRoutingWorkerSessionByIdentity({
    expectedIdentity: createDisplayRoutingIdentity(
      request.nextInputSignature,
      request.nextInputGeometryDigest,
    ),
  });
  if (workerSession) {
    return {
      request: {
        ...request,
        baselineNodes: workerSession.nodes,
        baselineSourceEdges: workerSession.sourceEdges,
        baselinePatches: workerSession.displayPatches,
      },
      baselineSpatialSnapshot: workerSession.spatialSnapshot,
      exactNextSession,
    };
  }
  return request.baselineNodes && request.baselineSourceEdges && request.baselinePatches
    ? {
      request: request as DisplayEdgesWorkerResolvedIncrementalRouteRequest,
      baselineSpatialSnapshot: null,
      exactNextSession,
    }
    : null;
};

export const completeDisplayWorkerResponse = ({
  request,
  response,
  phaseTrace,
}: {
  request: DisplayEdgesWorkerRequest;
  response: DisplayEdgesWorkerResponse;
  phaseTrace: DisplayRoutingPhaseTrace[];
}): DisplayEdgesWorkerResponse => {
  const withFinalTrace = (value: DisplayEdgesWorkerResponse): DisplayEdgesWorkerResponse => (
    response.phaseTrace
      ? { ...value, phaseTrace: finalizeDisplayRoutingPhaseTrace(phaseTrace) }
      : value
  );
  const exactResponse = response.hardClean === true
    && response.edges
    && !isDisplayWorkerBoundedCandidateReport(response.hardReport)
    ? withExactDisplayHardReport(response, request.nodes)
    : response;
  if (exactResponse.hardClean !== true || !exactResponse.edges) return withFinalTrace(exactResponse);
  const sessionTimer = startDisplayRoutingPhaseTrace({
    phase: 'session-commit',
    candidateCount: exactResponse.edges.length,
    onTrace: trace => appendDisplayRoutingPhaseTrace(phaseTrace, trace),
  });
  const nextIdentity = request.operation === 'incremental-route'
    ? createDisplayRoutingIdentity(request.nextInputSignature, request.nextInputGeometryDigest)
    : request.inputIdentity;
  if (!nextIdentity) {
    sessionTimer.finish('skip');
    return withFinalTrace(exactResponse);
  }
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(
    exactResponse.edges,
  );
  const displayPatches = createBaseReactFlowDisplayEdgePatches(
    request.edges,
    exactResponse.edges,
  );
  if (
    !outputRouteSignature
    || !displayPatches
    || !isDisplayWorkerBoundedCandidateReport(exactResponse.hardReport)
    || !exactResponse.hardReport.hardClean
  ) {
    sessionTimer.finish('rejected');
    return withFinalTrace(exactResponse);
  }
  const sessionRef = writeDisplayRoutingWorkerSession({
    identity: nextIdentity,
    outputRouteSignature,
    nodes: request.nodes,
    sourceEdges: request.edges,
    displayPatches,
    finalEdges: exactResponse.edges,
    hardReport: exactResponse.hardReport,
  });
  const commitReceipt = createDisplayRoutingWorkerCommitReceipt({
    identity: nextIdentity,
    outputRouteSignature,
    hardReport: exactResponse.hardReport,
    sessionRef,
  });
  if (!commitReceipt) {
    sessionTimer.finish('rejected');
    return withFinalTrace(exactResponse);
  }
  sessionTimer.finish('accepted', displayPatches.length);
  return withFinalTrace({
    ...exactResponse,
    nextIdentity,
    outputRouteSignature,
    sessionRef,
    commitReceipt,
  });
};

export const createDisplayWorkerResponseCompleter = (
  request: DisplayEdgesWorkerRequest,
  phaseTrace: DisplayRoutingPhaseTrace[],
): ((response: DisplayEdgesWorkerResponse) => DisplayEdgesWorkerResponse) => (
  response => {
    const baseline = request.operation === 'incremental-route'
      && request.changeSet.classification === 'topology' && response.fallbackLevel === 'full'
      ? resolveDisplayWorkerIncrementalRequest(request) : null;
    const candidate = baseline ? preserveDisplayTopologyFallbackRoutes(
      baseline.request, response, trace => appendDisplayRoutingPhaseTrace(phaseTrace, trace),
    ) : response;
    return completeDisplayWorkerResponse({ request, response: candidate, phaseTrace });
  }
);
