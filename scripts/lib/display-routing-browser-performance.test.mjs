import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { createDisplayRoutingPhaseRecorder } from '../../src/core/components/shared/baseReactFlowDisplayWorkerTraceRecorder';

import {
  assertDisplayRoutingDragResult,
  countDisplayRoutingTransactionResponses,
  assertDisplayRoutingPerformanceBudget,
  assertDisplayRoutingPerformanceSummaryBudget,
  displayRoutingIncrementalPhaseTraceIsComplete,
  EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES,
  isDisplayRoutingClosurePhase,
  parseDisplayRoutingBrowserVerificationMode,
  parseDisplayRoutingSampleIndex,
  rotateDisplayRoutingDragCases,
  selectDisplayRoutingDragCases,
  summarizeDisplayRoutingSamples,
  summarizeDisplayRoutingOutlierSamples,
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

describe('incremental Worker transaction response count', () => {
  const progress = () => ({
    requestId: 'incremental:1',
    phaseProgress: { phase: 'local-route', durationMs: 10, candidateCount: 14, changedEdgeCount: 6, resolution: 'accepted' },
  });
  const final = () => ({ requestId: 'incremental:1', hardClean: true, routeResolution: 'incremental-route', routingPatches: [] });

  it('counts one final reply despite the 58 phase notifications seen in CI', () => {
    const responses = [...Array.from({ length: 58 }, progress), final()];
    const before = structuredClone(responses);
    expect(countDisplayRoutingTransactionResponses(responses)).toBe(1);
    expect(countDisplayRoutingTransactionResponses(responses.toReversed())).toBe(1);
    expect(responses).toEqual(before);
    expect(() => assertDisplayRoutingDragResult(availableCases[0], validDragResult({
      capturedResponseCount: countDisplayRoutingTransactionResponses(responses),
    }))).not.toThrow();
    expect(() => assertDisplayRoutingDragResult(availableCases[0], validDragResult({
      capturedResponseCount: countDisplayRoutingTransactionResponses([...responses, final()]),
    }))).toThrow();
  });

  it('recognizes all trace resolutions when injected without module bindings', () => {
    const injected = runInNewContext(`(${countDisplayRoutingTransactionResponses.toString()})`);
    const notifications = ['hit', 'skip', 'accepted', 'rejected', 'fallback'].map(resolution => {
      const value = progress();
      return { ...value, phaseProgress: { ...value.phaseProgress, resolution } };
    });
    expect(injected([...notifications, final()])).toBe(1);
  });

  it('does not conceal duplicate replies, error replies or mixed envelopes', () => {
    expect(countDisplayRoutingTransactionResponses([progress(), final(), final()])).toBe(2);
    expect(countDisplayRoutingTransactionResponses([final(), { requestId: 'incremental:1', error: 'worker-failed' }])).toBe(2);
    expect(countDisplayRoutingTransactionResponses([final(), { ...progress(), hardClean: false }])).toBe(2);
    expect(countDisplayRoutingTransactionResponses([final(), { ...progress(), edges: [] }])).toBe(2);
    expect(countDisplayRoutingTransactionResponses([{ requestId: 'incremental:1', boundedCandidate: {} }])).toBe(1);
  });

  it('handles empty captures and refuses an invalid capture collection', () => {
    expect(countDisplayRoutingTransactionResponses([])).toBe(0);
    expect(countDisplayRoutingTransactionResponses([progress()])).toBe(0);
    for (const value of [null, undefined, {}, 'responses']) {
      expect(() => countDisplayRoutingTransactionResponses(value)).toThrow(TypeError);
    }
  });

  it('keeps malformed, extreme and unsafe-looking messages visible to the gate', () => {
    const base = progress();
    const messages = [null, [], {}, { ...base, requestId: '' }, { ...base, requestId: 'x'.repeat(501) },
      { ...base, phaseProgress: null }, { ...base, phaseProgress: {} },
      ...[NaN, Infinity, -1, 600_001, '10'].map(durationMs => ({ ...base, phaseProgress: { ...base.phaseProgress, durationMs } })),
      { ...base, phaseProgress: { ...base.phaseProgress, phase: '<script>alert(1)</script>' } },
      { ...base, phaseProgress: { ...base.phaseProgress, candidateCount: 1_000_001 } }];
    expect(countDisplayRoutingTransactionResponses(messages)).toBe(messages.length);
    expect(Object.prototype).not.toHaveProperty('phaseProgress');
  });
});

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
  it('selects a bounded full or isolated interaction verifier mode', () => {
    expect(parseDisplayRoutingBrowserVerificationMode([])).toBe('full');
    expect(parseDisplayRoutingBrowserVerificationMode(['--interaction-only']))
      .toBe('interaction');
    expect(() => parseDisplayRoutingBrowserVerificationMode(['--unknown']))
      .toThrow(/only --interaction-only/);
    expect(() => parseDisplayRoutingBrowserVerificationMode([
      '--interaction-only',
      '--unknown',
    ])).toThrow(/only --interaction-only/);
    expect(parseDisplayRoutingBrowserVerificationMode(null)).toBe('full');
  });

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

  it('rotates the full performance matrix across three balanced positions', () => {
    expect(parseDisplayRoutingSampleIndex(undefined)).toBeNull();
    expect(parseDisplayRoutingSampleIndex('2')).toBe(2);
    expect(rotateDisplayRoutingDragCases(availableCases, 1)).toBe(availableCases);
    expect(rotateDisplayRoutingDragCases(availableCases, 2)).toEqual([
      availableCases[1],
      availableCases[2],
      availableCases[0],
    ]);
    expect(rotateDisplayRoutingDragCases(availableCases, 3)).toEqual([
      availableCases[2],
      availableCases[0],
      availableCases[1],
    ]);
    expect(rotateDisplayRoutingDragCases(availableCases, 4)).toBe(availableCases);
  });

  it.each([['0'], ['101'], ['1.5'], ['invalid']])(
    'fails closed for invalid sample index %j',
    value => expect(() => parseDisplayRoutingSampleIndex(value)).toThrow(),
  );
});

describe('display routing browser performance budget', () => {
  it('selects only the bounded final closure diagnostic phases', () => {
    expect(isDisplayRoutingClosurePhase({ phase: 'final-safety-stubs' })).toBe(true);
    expect(isDisplayRoutingClosurePhase({ phase: 'quality' })).toBe(false);
    expect(isDisplayRoutingClosurePhase({ phase: 42 })).toBe(false);
    expect(isDisplayRoutingClosurePhase(null)).toBe(false);
  });

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

  it('recognizes a stub-rejected audit followed by endpoint repair and a complete final audit', () => {
    // First-occurrence order from the Worker recorder: the first safety audit
    // stops at stubs; its repeated hard/stub phases are aggregated in place.
    const phases = [
      'incremental-closure', 'local-route', 'hard-gate', 'final-clearance',
      'final-hard-safety', 'final-safety-hard-gate', 'final-safety-stubs',
      'final-endpoint-seed', 'final-endpoint-topology', 'final-endpoint-order',
      'final-endpoint-closure', 'final-safety-endpoint-order',
      'final-safety-passage-order', 'final-safety-closure',
      'final-commercial-clearance', 'final-commercial-terminal-preserving',
      'final-commercial-terminal-changing', 'final-commercial-source-stairs',
      'final-commercial-evaluation', 'final-commercial-safety-closure',
      'finalizer', 'session-commit',
    ];
    const traces = phases.map(phase => ({ phase }));
    expect(displayRoutingIncrementalPhaseTraceIsComplete(traces)).toBe(true);
    const recorded = [];
    const record = createDisplayRoutingPhaseRecorder({
      requestId: 'stub-repair', phaseTrace: recorded, publish: () => {}, publishProgress: false,
    });
    const rawPhases = [
      ...phases.slice(0, 11),
      'final-safety-hard-gate', 'final-safety-stubs',
      ...phases.slice(11),
    ];
    rawPhases.forEach((phase, index) => record({
      phase, durationMs: 1, candidateCount: 1, changedEdgeCount: 0,
      resolution: index === 6 ? 'rejected' : 'accepted',
    }));
    expect(recorded.map(trace => trace.phase)).toEqual(phases);
    expect(recorded.find(trace => trace.phase === 'final-safety-stubs')).toMatchObject({
      durationMs: 2, resolution: 'rejected',
    });
    expect(displayRoutingIncrementalPhaseTraceIsComplete(recorded)).toBe(true);
    for (let index = 0; index < traces.length; index += 1) {
      expect(displayRoutingIncrementalPhaseTraceIsComplete(
        traces.filter((_, position) => position !== index),
      )).toBe(false);
      expect(displayRoutingIncrementalPhaseTraceIsComplete([
        ...traces.slice(0, index), traces[index], ...traces.slice(index),
      ])).toBe(false);
    }
    const reordered = [...traces];
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    expect(displayRoutingIncrementalPhaseTraceIsComplete(reordered)).toBe(false);
  });

  it('accepts only a complete supported incremental phase sequence', () => {
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
      {
        phase: 'quality',
        durationMs: 50,
        resolution: 'accepted',
        evaluationCount: 8,
        cacheHitCount: 3,
        scannedNodeCount: 51,
        scannedSegmentCount: 144,
        scannedEdgePairCount: 946,
        workItemCount: 5,
        candidateCount: 32,
      },
      { phase: 'invalid', durationMs: Number.NaN },
    ];

    expect(summarizeSlowestDisplayRoutingPhases(trace, 1)).toEqual([
      {
        phase: 'quality',
        parentPhase: null,
        durationMs: 50,
        inclusiveDurationMs: 50,
        resolution: 'accepted',
        evaluationCount: 8,
        cacheHitCount: 3,
        scannedNodeCount: 51,
        scannedSegmentCount: 144,
        scannedEdgePairCount: 946,
        workItemCount: 5,
        candidateCount: 32,
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
      evaluationCount: null,
      cacheHitCount: null,
      scannedNodeCount: null,
      scannedSegmentCount: null,
      scannedEdgePairCount: null,
      workItemCount: null,
      candidateCount: null,
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

  it('reports bounded content-free slow sample evidence', () => {
    const sample = (localRouteMs, digest, candidateCount = 256) => ({
      benchmark: { elapsedMs: localRouteMs + 1_000 },
      dragCases: [{ nodeId: 'tms' }, {
        nodeId: 'wms',
        releaseToFinalMs: localRouteMs + 50,
        workerDurationMs: localRouteMs + 20,
        workerDeliveryWaitMs: 10,
        workerLongTaskTotalMs: 80,
        workerLongTaskMaxMs: 60,
        driftProbe: {
          incremental: { next: { nodeGeometryDigest: digest } },
        },
        phaseTrace: [{
          phase: 'local-route',
          durationMs: localRouteMs,
          exclusiveDurationMs: 0,
        }, {
          phase: 'local-reconnect-path-generation',
          parentPhase: 'local-reconnect-seed',
          durationMs: 20,
          exclusiveDurationMs: 20,
          candidateCount,
          underBudgetCount: 0,
          minimumCandidateCount: 64,
          maximumCandidateCount: 64,
          privatePath: 'discarded',
        }],
      }],
    });
    const digest = `probe-v1:${'a'.repeat(32)}`;
    expect(summarizeDisplayRoutingOutlierSamples([
      sample(50, digest),
      sample(500, digest),
    ], 'wms', 1)).toEqual([expect.objectContaining({
      sampleIndex: 2,
      caseOrder: ['tms', 'wms'],
      casePosition: 2,
      elapsedMs: 1_500,
      localRouteMs: 500,
      nodeGeometryDigest: digest,
      generation: {
        candidateCount: 256,
        underBudgetCount: 0,
        minimumCandidateCount: 64,
        maximumCandidateCount: 64,
      },
      slowestPhases: expect.arrayContaining([expect.objectContaining({
        phase: 'local-reconnect-path-generation',
      })]),
    })]);
    expect(JSON.stringify(summarizeDisplayRoutingOutlierSamples([
      sample(500, 'private-digest'),
    ], 'wms'))).not.toContain('private');
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
        driftProbe: {
          initial: {
            schema: 'routing-drift-v1',
            operation: 'validate-or-route',
            baseline: {},
            next: {
              projectedGeometryDigest: `probe-v1:${'a'.repeat(32)}`,
              nodeGeometryDigest: `probe-v1:${'b'.repeat(32)}`,
              edgeTopologyDigest: `probe-v1:${'c'.repeat(32)}`,
              edgeSourcePathDigest: `probe-v1:${'d'.repeat(32)}`,
              nodeCount: 14,
              edgeCount: 14,
              fractionalGeometryCount: 18,
              nonFiniteGeometryCount: 0,
              absolutePositionPresentCount: 14,
              measuredSizePresentCount: 14,
              privateCoordinates: [1, 2, 3],
            },
            change: {},
          },
          incremental: {
            schema: 'routing-drift-v1',
            operation: 'incremental-route',
            baseline: {
              sessionRefPresent: true,
              inputDigest: `probe-v1:${'e'.repeat(32)}`,
              routeDigest: 'private-route-signature',
            },
            next: {
              inputDigest: `probe-v1:${'f'.repeat(32)}`,
              nodeGeometryDigest: `probe-v1:${'1'.repeat(32)}`,
              edgeSourcePathDigest: `probe-v1:${'2'.repeat(32)}`,
            },
            change: {
              reason: 'node-drag',
              classification: 'geometry',
              changedNodeCount: 1,
              mutableEdgeCount: 4,
              contextEdgeCount: 5,
              changedSetDigest: `probe-v1:${'3'.repeat(32)}`,
              closureSetDigest: `probe-v1:${'4'.repeat(32)}`,
              privateNodeId: 'private-node-id',
            },
          },
        },
        response: {
          affectedEdgeCount: 4,
          fallbackLevel: 'none',
          workerDurationMs: 35,
          phaseTrace: [{ phase: 'local-route', durationMs: 30 }],
        },
      },
    }], { sampleIndex: 2, elapsedMs: 123.5 })).toEqual({
      benchmark: {
        sampleIndex: 2,
        elapsedMs: 123.5,
      },
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
        driftProbe: {
          initial: {
            operation: 'validate-or-route',
            baseline: {
              sessionRefPresent: false,
              inlineBootstrapPresent: false,
              inputDigest: null,
              routeDigest: null,
            },
            next: {
              inputDigest: null,
              projectedGeometryDigest: `probe-v1:${'a'.repeat(32)}`,
              nodeGeometryDigest: `probe-v1:${'b'.repeat(32)}`,
              edgeTopologyDigest: `probe-v1:${'c'.repeat(32)}`,
              edgeSourcePathDigest: `probe-v1:${'d'.repeat(32)}`,
              nodeCount: 14,
              edgeCount: 14,
              fractionalGeometryCount: 18,
              nonFiniteGeometryCount: 0,
              absolutePositionPresentCount: 14,
              measuredSizePresentCount: 14,
            },
            change: {
              reason: 'invalid',
              classification: 'invalid',
              changedNodeCount: null,
              changedEdgeCount: null,
              mutableEdgeCount: null,
              contextEdgeCount: null,
              changedSetDigest: null,
              closureSetDigest: null,
            },
          },
          incremental: {
            operation: 'incremental-route',
            baseline: {
              sessionRefPresent: true,
              inlineBootstrapPresent: false,
              inputDigest: `probe-v1:${'e'.repeat(32)}`,
              routeDigest: null,
            },
            next: {
              inputDigest: `probe-v1:${'f'.repeat(32)}`,
              projectedGeometryDigest: null,
              nodeGeometryDigest: `probe-v1:${'1'.repeat(32)}`,
              edgeTopologyDigest: null,
              edgeSourcePathDigest: `probe-v1:${'2'.repeat(32)}`,
              nodeCount: null,
              edgeCount: null,
              fractionalGeometryCount: null,
              nonFiniteGeometryCount: null,
              absolutePositionPresentCount: null,
              measuredSizePresentCount: null,
            },
            change: {
              reason: 'node-drag',
              classification: 'geometry',
              changedNodeCount: 1,
              changedEdgeCount: null,
              mutableEdgeCount: 4,
              contextEdgeCount: 5,
              changedSetDigest: `probe-v1:${'3'.repeat(32)}`,
              closureSetDigest: `probe-v1:${'4'.repeat(32)}`,
            },
          },
        },
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
    expect(JSON.stringify(buildDisplayRoutingMachineResult([{
      incremental: {
        driftProbe: {
          initial: { schema: 'routing-drift-v1', next: { privatePath: 'private-path' } },
          incremental: { schema: 'routing-drift-v1', change: { privateNodeId: 'private-node' } },
        },
      },
    }]))).not.toContain('private-');
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
