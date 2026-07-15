import { describe, expect, it } from 'vitest';

import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';
import { getBaseReactFlowMeasuredRepairNeeds } from '../baseReactFlowDisplayMeasuredRepairPlan';

const report = (
  overrides: Partial<BaseDisplayBoundedCandidateReport> = {},
  qualityOverrides: Partial<BaseDisplayBoundedCandidateReport['quality']> = {},
): BaseDisplayBoundedCandidateReport => ({
  candidate: 'polished',
  hardClean: true,
  obstacleHits: 0,
  terminalsAttached: true,
  terminalsAnchored: true,
  quality: {
    nonOrthogonalSegments: 0,
    strictCrossings: 0,
    reverseOverlap: 0,
    unrelatedOverlap: 0,
    unexplainedRelatedOverlap: 0,
    shortEndpointStubs: 0,
    tinyInteriorDoglegs: 0,
    hairpins: 0,
    backtrackPenalty: 0,
    detourPenalty: 0,
    bends: 0,
    totalLength: 0,
    ...qualityOverrides,
  },
  ...overrides,
});

describe('getBaseReactFlowMeasuredRepairNeeds', () => {
  it('skips every expensive stage for an already clean exact report', () => {
    expect(getBaseReactFlowMeasuredRepairNeeds(report())).toEqual({
      obstacle: false,
      overlap: false,
      strict: false,
      terminal: false,
    });
  });

  it('selects only the defect-directed stage for isolated hard defects', () => {
    expect(getBaseReactFlowMeasuredRepairNeeds(report({ obstacleHits: 1 }))).toEqual({
      obstacle: true,
      overlap: false,
      strict: false,
      terminal: false,
    });
    expect(getBaseReactFlowMeasuredRepairNeeds(report({}, { strictCrossings: 1 }))).toEqual({
      obstacle: false,
      overlap: false,
      strict: true,
      terminal: false,
    });
    expect(getBaseReactFlowMeasuredRepairNeeds(report({}, { unrelatedOverlap: 12 }))).toEqual({
      obstacle: false,
      overlap: true,
      strict: false,
      terminal: false,
    });
  });

  it('treats short stubs and failed anchoring as terminal repair work', () => {
    expect(getBaseReactFlowMeasuredRepairNeeds(report({}, { shortEndpointStubs: 1 })).terminal).toBe(true);
    expect(getBaseReactFlowMeasuredRepairNeeds(report({ terminalsAnchored: false })).terminal).toBe(true);
  });
});
