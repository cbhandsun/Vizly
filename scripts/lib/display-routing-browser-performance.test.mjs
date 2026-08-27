import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingDragResult,
  assertDisplayRoutingPerformanceBudget,
  assertDisplayRoutingPerformanceSummaryBudget,
  displayRoutingIncrementalPhaseTraceIsComplete,
  EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES,
  selectDisplayRoutingDragCases,
  summarizeDisplayRoutingSamples,
  summarizeSlowestDisplayRoutingPhases,
} from './display-routing-browser-performance.mjs';
import { buildDisplayRoutingMachineResult } from './display-routing-browser-result.mjs';
import {
  formatDisplayRoutingCpuProfile,
  summarizeDisplayRoutingCpuProfile,
} from './display-routing-cpu-profile.mjs';

const availableCases = [
  { nodeId: 'tms', expectedMutableCount: 6 },
  { nodeId: 'wms', expectedMutableCount: 4 },
  { nodeId: 'l-oms', expectedMutableCount: 5 },
];

const incremental = overrides => ({
  releaseToFinalMs: 400,
  workerToFinalMs: 300,
  response: { phaseTrace: [{ phase: 'local-route', durationMs: 100 }] },
  ...overrides,
});

const validDragResult = overrides => ({
  mutableEdgeCount: 6,
  capturedRequestCount: 1,
  capturedResponseCount: 1,
  response: {
    hardClean: true,
    routeResolution: 'incremental-route',
    fallbackLevel: 'none',
    affectedEdgeCount: 6,
    edgeCount: 14,
    phaseTrace: EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES[0]
      .map((phase, index) => ({ phase, resolution: index < 3 ? 'accepted' : 'skip' })),
  },
  routing: {
    fallbackLevel: 'none',
    workerAbortCount: 0,
    workerStartCountDelta: 1,
    workerAbortCountDelta: 0,
    outputRouteSignature: 'route-v2:14:61:6eaf7510f9eb1652',
  },
  renderedEdgeCount: 14,
  renderedEdgesWithPathCount: 14,
  ...overrides,
});

describe('display-routing browser case selection', () => {
  it('keeps the full matrix by default and selects a bounded explicit subset', () => {
    expect(selectDisplayRoutingDragCases(undefined, availableCases)).toBe(availableCases);
    expect(selectDisplayRoutingDragCases('wms,tms,wms', availableCases)).toEqual([
      availableCases[1],
      availableCases[0],
    ]);
  });

  it.each([['unknown'], ['wms,unknown'], ['x'.repeat(129)]])(
    'fails closed for invalid case input %j',
    (value) => expect(() => selectDisplayRoutingDragCases(value, availableCases)).toThrow(),
  );
});

describe('display routing browser performance budget', () => {
  it('requires one clean atomic Worker transaction for a drag result', () => {
    const dragCase = { expectedMutableCount: 6, expectedAffectedCount: 6 };
    expect(assertDisplayRoutingDragResult(dragCase, validDragResult())).toBeUndefined();
    expect(() => assertDisplayRoutingDragResult(
      dragCase,
      validDragResult({ capturedRequestCount: 2 }),
    )).toThrow(/single Worker transaction/);
    expect(() => assertDisplayRoutingDragResult(
      dragCase,
      validDragResult({
        routing: {
          ...validDragResult().routing,
          workerStartCountDelta: 2,
        },
      }),
    )).toThrow(/single Worker transaction/);
  });

  it('keeps failure diagnostics bounded to safe counters and drift probes', () => {
    const sensitive = {
      debugRequest: {
        nodes: [{ id: 'private-node', position: { x: 123.456, y: 789.123 } }],
        edges: [{ id: 'private-edge', data: { computedPath: 'private-path' } }],
      },
      routing: {
        ...validDragResult().routing,
        outputRouteSignature: 'private-output-signature',
      },
      capturedRequestCount: 2,
      driftProbe: {
        initial: { schema: 'routing-drift-v1', next: { nodeCount: 28 } },
      },
    };
    let message = '';
    try {
      assertDisplayRoutingDragResult(
        { nodeId: 'private-node', expectedMutableCount: 6 },
        validDragResult(sensitive),
      );
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain('single Worker transaction');
    expect(message).toContain('routing-drift-v1');
    for (const forbidden of [
      'private-node', 'private-edge', 'private-path', 'private-output-signature', '123.456',
    ]) expect(message).not.toContain(forbidden);
  });

  it('accepts only the complete fast or repaired incremental phase sequence', () => {
    for (const phases of EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES) {
      expect(displayRoutingIncrementalPhaseTraceIsComplete(
        phases.map(phase => ({ phase })),
      )).toBe(true);
      const withLocalDiagnostics = phases.flatMap(phase => (
        phase === 'local-route'
          ? [
            { phase: 'local-reconnect-seed', parentPhase: 'local-route' },
            { phase: 'local-reconnect-candidates', parentPhase: 'local-route' },
            { phase },
          ]
          : [{ phase }]
      ));
      expect(displayRoutingIncrementalPhaseTraceIsComplete(withLocalDiagnostics)).toBe(true);
      const withEndpointDiagnostics = phases.flatMap(phase => (
        phase === 'final-endpoint-closure'
          ? [
            {
              phase: 'final-endpoint-closure-residual',
              parentPhase: 'final-endpoint-closure',
            },
            { phase },
          ]
          : [{ phase }]
      ));
      expect(displayRoutingIncrementalPhaseTraceIsComplete(withEndpointDiagnostics)).toBe(true);
    }
    const incomplete = EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES[0]
      .slice(0, -1)
      .map(phase => ({ phase }));
    expect(displayRoutingIncrementalPhaseTraceIsComplete(incomplete)).toBe(false);
    expect(displayRoutingIncrementalPhaseTraceIsComplete(null)).toBe(false);
    expect(displayRoutingIncrementalPhaseTraceIsComplete([{ phase: 'unexpected' }])).toBe(false);
    expect(displayRoutingIncrementalPhaseTraceIsComplete([
      ...EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES[0].map(phase => ({ phase })),
      { phase: 'unexpected-root' },
    ])).toBe(false);
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
          workerStartCount: 30,
          abortCount: 0,
          fallbackCount: 0,
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
    expect(() => assertDisplayRoutingPerformanceSummaryBudget({
      ...summary,
      dragCases: {
        wms: {
          ...summary.dragCases.wms,
          workerStartCount: 31,
        },
      },
    })).toThrow(/workerStartCount/);
    expect(() => assertDisplayRoutingPerformanceSummaryBudget({
      ...summary,
      dragCases: {
        wms: {
          ...summary.dragCases.wms,
          fallbackCount: 1,
        },
      },
    })).toThrow(/fallbackCount/);
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
        routing: { workerStartCountDelta: 1, workerAbortCountDelta: 0 },
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
          workItemCount: null,
          budgetCount: null,
          underBudgetCount: null,
          minimumCandidateCount: null,
          maximumCandidateCount: null,
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
        workerStartCount: 1,
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
          workItemCount: null,
          budgetCount: null,
          underBudgetCount: null,
          minimumCandidateCount: null,
          maximumCandidateCount: null,
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
