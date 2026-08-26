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
  writeDisplayRoutingWorkerSession,
} from './baseReactFlowDisplayWorkerSession';
import { appendDisplayRoutingPhaseTrace } from './baseReactFlowDisplayWorkerTraceRecorder';
import type {
  BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { createBaseReactFlowIncrementalDisplayEdges } from './baseReactFlowDisplayIncrementalRoute';
import type {
  DisplayEdgesWorkerIncrementalRouteRequest,
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResolvedIncrementalRouteRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import type { DisplayRoutingWorkerSpatialSnapshot } from './baseReactFlowDisplayWorkerSpatialSnapshot';

type ResolvedDisplayWorkerIncrementalRequest = Readonly<{
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest;
  baselineSpatialSnapshot: DisplayRoutingWorkerSpatialSnapshot | null;
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
  if (workerSession) {
    return {
      request: {
        ...request,
        baselineNodes: workerSession.nodes,
        baselineSourceEdges: workerSession.sourceEdges,
        baselinePatches: workerSession.displayPatches,
      },
      baselineSpatialSnapshot: workerSession.spatialSnapshot,
    };
  }
  return request.baselineNodes && request.baselineSourceEdges && request.baselinePatches
    ? {
      request: request as DisplayEdgesWorkerResolvedIncrementalRouteRequest,
      baselineSpatialSnapshot: null,
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
  if (response.hardClean !== true || !response.edges) return withFinalTrace(response);
  const sessionTimer = startDisplayRoutingPhaseTrace({
    phase: 'session-commit',
    candidateCount: response.edges.length,
    onTrace: trace => appendDisplayRoutingPhaseTrace(phaseTrace, trace),
  });
  const nextIdentity = request.operation === 'incremental-route'
    ? createDisplayRoutingIdentity(request.nextInputSignature, request.nextInputGeometryDigest)
    : request.operation === 'repair'
      ? undefined
      : request.inputIdentity;
  if (!nextIdentity) {
    sessionTimer.finish('skip');
    return withFinalTrace(response);
  }
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(
    response.edges,
  );
  const displayPatches = createBaseReactFlowDisplayEdgePatches(
    request.edges,
    response.edges,
  );
  if (!outputRouteSignature || !displayPatches) {
    sessionTimer.finish('rejected');
    return withFinalTrace(response);
  }
  const sessionRef = writeDisplayRoutingWorkerSession({
    identity: nextIdentity,
    outputRouteSignature,
    nodes: request.nodes,
    sourceEdges: request.edges,
    displayPatches,
    finalEdges: response.edges,
    hardReport: response.hardReport,
  });
  sessionTimer.finish('accepted', displayPatches.length);
  return withFinalTrace({
    ...response,
    nextIdentity,
    outputRouteSignature,
    sessionRef,
  });
};

export const createDisplayWorkerResponseCompleter = (
  request: DisplayEdgesWorkerRequest,
  phaseTrace: DisplayRoutingPhaseTrace[],
): ((response: DisplayEdgesWorkerResponse) => DisplayEdgesWorkerResponse) => (
  response => completeDisplayWorkerResponse({ request, response, phaseTrace })
);
