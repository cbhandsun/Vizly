import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import {
  isDisplayRoutingIdentity,
  type RoutingIdentity,
} from '../../../routing/routingSessionIdentity';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { mergeBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { createDisplayRoutingWorkerCommitReceipt } from '../baseReactFlowDisplayWorkerCommitReceipt';

export const TEST_DISPLAY_WORKER_NODES = [
  { id: 'source', position: { x: 0, y: 0 }, data: {} },
  { id: 'target', position: { x: 100, y: 0 }, data: {} },
];

export const TEST_DISPLAY_WORKER_REPAIR_REQUEST = {
  operation: 'repair',
  requestId: 'repair-1',
  edges: [{
    id: 'edge',
    source: 'source',
    target: 'target',
    data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  }],
  nodes: TEST_DISPLAY_WORKER_NODES,
  inputIdentity: createDisplayRoutingIdentity(
    '1234',
    `geometry-v1:${'a'.repeat(32)}`,
  ),
  repairMode: 'bounded',
} as const;

export const createTestBoundedDisplayRoutingPhaseTrace = (
  limit: number,
): DisplayRoutingPhaseTrace[] => Array.from({ length: limit }, () => ({
  phase: 'quality-crossing-global-refine',
  durationMs: 1,
  candidateCount: 1,
  changedEdgeCount: 0,
  resolution: 'skip',
}));

export const createTestDisplayHardReport = (
  hardClean = true,
  totalLength = 100,
): BaseDisplayBoundedCandidateReport => ({
  candidate: 'polished',
  hardClean,
  obstacleHits: hardClean ? 0 : 1,
  terminalsAttached: true,
  terminalsAnchored: true,
  minimumClearanceViolations: 0,
  minimumClearanceViolationEdgeIds: [],
  commercialClearanceViolations: 0,
  quality: {
    nonOrthogonalSegments: 0,
    strictCrossings: 0,
    reverseOverlap: 0,
    unrelatedOverlap: 0,
    relatedOverlap: 0,
    unexplainedRelatedOverlap: 0,
    shortEndpointStubs: 0,
    tinyInteriorDoglegs: 0,
    hairpins: 0,
    backtrackPenalty: 0,
    detourPenalty: 0,
    bends: 0,
    totalLength,
  },
});

export const withRequiredTestDisplayHardReport = (
  value: unknown,
  requestValue?: unknown,
): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const response = value as Record<string, unknown>;
  const request = requestValue && typeof requestValue === 'object' && !Array.isArray(requestValue)
    ? requestValue as Record<string, unknown>
    : null;
  const hardReport = !('hardReport' in response)
    ? createTestDisplayHardReport(response.hardClean === true)
    : response.hardReport;
  const withHardReport = (
    ('edges' in response || 'routingPatches' in response)
    && typeof response.hardClean === 'boolean'
    && !('hardReport' in response)
  ) ? { ...response, hardReport } : response;
  if (
    response.hardClean !== true
    || !isDisplayRoutingIdentity(request?.inputIdentity)
    || response.commitReceipt
    || typeof hardReport !== 'object'
    || hardReport === null
  ) {
    return withHardReport;
  }
  const responseEdges = Array.isArray(response.edges)
    ? response.edges
    : Array.isArray(response.routingPatches) && Array.isArray(request?.edges)
      ? mergeBaseReactFlowDisplayEdgePatches(request.edges, response.routingPatches)
      : null;
  const outputRouteSignature = responseEdges
    ? computeBaseReactFlowDisplayOutputRouteSignature(responseEdges)
    : null;
  if (!outputRouteSignature) return withHardReport;
  const identity = request.inputIdentity as RoutingIdentity;
  const sessionRef = {
    sessionId: 'display-session-v1:1',
    identity,
    outputRouteSignature,
  } as const;
  const commitReceipt = createDisplayRoutingWorkerCommitReceipt({
    identity,
    outputRouteSignature,
    hardReport: hardReport as BaseDisplayBoundedCandidateReport,
    sessionRef,
  });
  return commitReceipt ? {
    ...withHardReport,
    nextIdentity: identity,
    outputRouteSignature,
    sessionRef,
    commitReceipt,
  } : withHardReport;
};
