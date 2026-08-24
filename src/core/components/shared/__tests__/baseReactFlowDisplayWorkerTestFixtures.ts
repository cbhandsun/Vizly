import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';

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
