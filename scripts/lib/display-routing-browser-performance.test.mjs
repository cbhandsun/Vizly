import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingPerformanceBudget,
  assertDisplayRoutingPerformanceSummaryBudget,
  displayRoutingIncrementalPhaseTraceIsComplete,
  EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES,
  summarizeDisplayRoutingSamples,
  summarizeSlowestDisplayRoutingPhases,
} from './display-routing-browser-performance.mjs';
import { buildDisplayRoutingMachineResult } from './display-routing-browser-result.mjs';
import {
  formatDisplayRoutingCpuProfile,
  summarizeDisplayRoutingCpuProfile,
} from './display-routing-cpu-profile.mjs';

const incremental = overrides => ({
  releaseToFinalMs: 400,
  workerToFinalMs: 300,
  response: { phaseTrace: [{ phase: 'local-route', durationMs: 100 }] },
  ...overrides,
});

describe('display routing browser performance budget', () => {
  it('accepts only the complete fast or repaired incremental phase sequence', () => {
    for (const phases of EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES) {
      expect(displayRoutingIncrementalPhaseTraceIsComplete(
        phases.map(phase => ({ phase })),
      )).toBe(true);
      const withLocalDiagnostics = phases.flatMap(phase => (
        phase === 'local-route'
          ? [
            { phase: 'local-reconnect-seed' },
            { phase: 'local-reconnect-candidates' },
            { phase },
          ]
          : [{ phase }]
      ));
      expect(displayRoutingIncrementalPhaseTraceIsComplete(withLocalDiagnostics)).toBe(true);
    }
    const incomplete = EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES[0]
      .slice(0, -1)
      .map(phase => ({ phase }));
    expect(displayRoutingIncrementalPhaseTraceIsComplete(incomplete)).toBe(false);
    expect(displayRoutingIncrementalPhaseTraceIsComplete(null)).toBe(false);
    expect(displayRoutingIncrementalPhaseTraceIsComplete([{ phase: 'unexpected' }])).toBe(false);
  });

  it('summarizes valid slow phases without mutating the worker trace', () => {
    const trace = [
      { phase: 'seed', durationMs: 20, resolution: 'skip', sensitive: 'discarded' },
      { phase: 'quality', durationMs: 50, resolution: 'accepted' },
      { phase: 'invalid', durationMs: Number.NaN },
    ];

    expect(summarizeSlowestDisplayRoutingPhases(trace, 1)).toEqual([
      {
        phase: 'quality',
        parentPhase: null,
        durationMs: 50,
        inclusiveDurationMs: 50,
        resolution: 'accepted',
      },
    ]);
    expect(trace[0].phase).toBe('seed');
    expect(summarizeSlowestDisplayRoutingPhases(null)).toEqual([]);
    expect(summarizeSlowestDisplayRoutingPhases(trace, 0)).toEqual([]);
  });

  it('ranks phases by exclusive time and summarizes isolated sample percentiles', () => {
    expect(summarizeSlowestDisplayRoutingPhases([{
      phase: 'quality',
      durationMs: 100,
      exclusiveDurationMs: 10,
      resolution: 'accepted',
    }, {
      phase: 'quality-polish',
      parentPhase: 'quality',
      durationMs: 60,
      exclusiveDurationMs: 30,
      resolution: 'accepted',
    }], 1)).toEqual([{
      phase: 'quality-polish',
      parentPhase: 'quality',
      durationMs: 30,
      inclusiveDurationMs: 60,
      resolution: 'accepted',
    }]);
    expect(summarizeDisplayRoutingSamples([30, 10, 20, 40, Number.NaN, -1])).toEqual({
      sampleCount: 4,
      medianMs: 20,
      p95Ms: 40,
      maxMs: 40,
    });
    expect(summarizeDisplayRoutingSamples([])).toBeNull();
    expect(summarizeDisplayRoutingSamples('invalid')).toBeNull();
  });

  it('returns the validated measurements', () => {
    expect(assertDisplayRoutingPerformanceBudget(
      { nodeId: 'wms' },
      { routeMs: 500 },
      incremental(),
    )).toEqual({
      initialRoute: 500,
      releaseToFinal: 400,
      workerToFinal: 300,
      localRoute: 100,
    });
  });

  it('fails closed for missing or over-budget measurements', () => {
    expect(() => assertDisplayRoutingPerformanceBudget(
      { nodeId: 'wms' },
      {},
      incremental({ releaseToFinalMs: 1_001 }),
    )).toThrow(/initialRoute|releaseToFinal/);
  });

  it('applies benchmark budgets to p95 without rejecting an isolated maximum', () => {
    const summary = {
      sampleCount: 30,
      initialRoute: { p95Ms: 740, maxMs: 810 },
      dragCases: {
        wms: {
          releaseToFinal: { p95Ms: 290 },
          workerToFinal: { p95Ms: 290 },
          localRoute: { p95Ms: 140 },
        },
      },
    };

    expect(assertDisplayRoutingPerformanceSummaryBudget(summary)).toHaveLength(4);
    expect(() => assertDisplayRoutingPerformanceSummaryBudget({
      ...summary,
      initialRoute: { p95Ms: 751 },
    })).toThrow(/initialRoute/);
    expect(() => assertDisplayRoutingPerformanceSummaryBudget({
      ...summary,
      dragCases: {
        wms: {
          ...summary.dragCases.wms,
          releaseToFinal: { p95Ms: 301 },
        },
      },
    })).toThrow(/releaseToFinal/);
  });

  it('projects only bounded aggregate browser measurements', () => {
    expect(buildDisplayRoutingMachineResult([{
      nodeId: 'wms',
      initial: {
        routeMs: 25,
        workerResolution: 'validated-candidate',
        workerStartCount: 1,
        workerAbortCount: 0,
        scheduledAt: 1_000,
        workerStartedAt: 1_010,
        workerRequestAt: 1_012,
        workerResponseAt: 1_042,
        workerResponseParsedAt: 1_046,
        finalAppliedAt: 1_050,
        totalRouteMs: 50,
        workerDurationMs: 20,
        phaseTrace: [{
          phase: 'candidate-validation',
          durationMs: 20,
          exclusiveDurationMs: 18,
          privatePath: 'discarded',
        }],
      },
      incremental: {
        releaseToFinalMs: 80,
        workerToFinalMs: 60,
        workerRoundTripMs: 45,
        workerDeliveryWaitMs: 10,
        responseToFinalMs: 15,
        workerBoundaryParseMs: 4,
        parsedToFinalMs: 11,
        mutableEdgeCount: 4,
        routing: { workerAbortCount: 0 },
        response: {
          affectedEdgeCount: 4,
          fallbackLevel: 'none',
          workerDurationMs: 35,
          phaseTrace: [{ phase: 'local-route', durationMs: 30 }],
        },
      },
    }])).toEqual({
      initialRouteMs: [25],
      initialRoutes: [{
        nodeId: 'wms',
        routeMs: 25,
        workerResolution: 'validated-candidate',
        workerStartCount: 1,
        workerAbortCount: 0,
        scheduledToWorkerMs: 10,
        workerRequestDelayMs: 2,
        workerRoundTripMs: 30,
        workerDurationMs: 20,
        workerDeliveryWaitMs: 10,
        workerBoundaryParseMs: 4,
        parsedToFinalMs: 4,
        totalRouteMs: 50,
        phaseTrace: [{
          phase: 'candidate-validation',
          parentPhase: null,
          durationMs: 20,
          exclusiveDurationMs: 18,
          resolution: null,
          evaluationCount: null,
          cacheHitCount: null,
          scannedNodeCount: null,
          scannedSegmentCount: null,
          scannedEdgePairCount: null,
          candidateCount: null,
        }],
      }],
      dragCases: [{
        nodeId: 'wms',
        releaseToFinalMs: 80,
        workerToFinalMs: 60,
        workerRoundTripMs: 45,
        workerDurationMs: 35,
        workerDeliveryWaitMs: 10,
        workerLongTaskCount: null,
        workerLongTaskTotalMs: null,
        workerLongTaskMaxMs: null,
        responseToFinalMs: 15,
        workerBoundaryParseMs: 4,
        parsedToFinalMs: 11,
        localRouteMs: 30,
        mutableEdgeCount: 4,
        affectedEdgeCount: 4,
        fallbackLevel: 'none',
        workerAbortCount: 0,
        phaseTrace: [{
          phase: 'local-route',
          parentPhase: null,
          durationMs: 30,
          exclusiveDurationMs: 30,
          resolution: null,
          evaluationCount: null,
          cacheHitCount: null,
          scannedNodeCount: null,
          scannedSegmentCount: null,
          scannedEdgePairCount: null,
          candidateCount: null,
        }],
      }],
    });
  });

  it('aggregates CPU self time without retaining script URLs', () => {
    const summary = summarizeDisplayRoutingCpuProfile({
      nodes: [
        {
          id: 1,
          callFrame: {
            functionName: 'commitRoute',
            lineNumber: 9,
            columnNumber: 3,
            url: 'https://example.test/private-diagram-name.js',
          },
        },
        {
          id: 2,
          callFrame: { functionName: '', lineNumber: 19, columnNumber: 0 },
        },
      ],
      samples: [1, 2, 1],
      timeDeltas: [2_000, 1_000, 3_000],
    });

    expect(summary).toEqual({
      sampledMs: 6,
      entries: [
        { functionName: 'commitRoute', location: '10:4', selfMs: 5 },
        { functionName: '<anonymous>', location: '20:1', selfMs: 1 },
      ],
      hotPaths: [
        { path: 'commitRoute@10:4', selfMs: 5 },
        { path: '<anonymous>@20:1', selfMs: 1 },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain('private-diagram-name');
    expect(formatDisplayRoutingCpuProfile(summary)).toBe(
      'cpu-profile: sampled=6ms; leaves=commitRoute@10:4=5ms, '
        + '<anonymous>@20:1=1ms; paths=commitRoute@10:4=5ms, <anonymous>@20:1=1ms',
    );
  });

  it('fails closed for malformed CPU profiles', () => {
    expect(summarizeDisplayRoutingCpuProfile(null)).toBeNull();
    expect(summarizeDisplayRoutingCpuProfile({ nodes: [], samples: 'invalid' })).toBeNull();
  });
});
