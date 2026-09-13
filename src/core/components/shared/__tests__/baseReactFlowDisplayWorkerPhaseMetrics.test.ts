import { describe, expect, it } from 'vitest';

import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from '../baseReactFlowDisplayRoutingTrace';

const doglegFamilyMetrics = {
  scalarCandidateCount: 30,
  channelCandidateCount: 24,
  outerLaneCandidateCount: 22,
  tinyLaneCandidateCount: 20,
  obstacleLaneCandidateCount: 18,
  endpointLaneCandidateCount: 16,
  endpointOffsetCandidateCount: 14,
  terminalBridgeCandidateCount: 12,
  returnCandidateCount: 10,
};

describe('display Worker phase metrics', () => {
  it('records bounded materialized and family candidate counts at phase completion', () => {
    const traces: DisplayRoutingPhaseTrace[] = [];
    startDisplayRoutingPhaseTrace({
      phase: 'local-reconnect-seed',
      candidateCount: 4,
      onTrace: trace => traces.push(trace),
    }).finish('accepted', 1, {
      candidateCount: 180,
      evaluationCount: 96,
      cacheHitCount: 84,
      workItemCount: 4,
      processedEdgeCount: 3,
      passCount: 5,
      deduplicatedCandidateCount: 12,
      ...doglegFamilyMetrics,
      budgetCount: 256,
      underBudgetCount: 1,
      minimumCandidateCount: 52,
      maximumCandidateCount: 64,
    });

    expect(traces).toEqual([expect.objectContaining({
      phase: 'local-reconnect-seed',
      parentPhase: 'local-route',
      candidateCount: 180,
      evaluationCount: 96,
      cacheHitCount: 84,
      workItemCount: 4,
      processedEdgeCount: 3,
      passCount: 5,
      deduplicatedCandidateCount: 12,
      ...doglegFamilyMetrics,
      budgetCount: 256,
      underBudgetCount: 1,
      minimumCandidateCount: 52,
      maximumCandidateCount: 64,
    })]);
  });
});
