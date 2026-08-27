import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';

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

export const withRequiredTestDisplayHardReport = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const response = value as Record<string, unknown>;
  if (
    ('edges' in response || 'routingPatches' in response)
    && typeof response.hardClean === 'boolean'
    && !('hardReport' in response)
  ) {
    return {
      ...response,
      hardReport: createTestDisplayHardReport(response.hardClean),
    };
  }
  return value;
};
