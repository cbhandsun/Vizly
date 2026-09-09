// @vitest-environment node

import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { runColdRoutingSample } from './precompiled-display-route-cold-sample.mjs';
import { createRoutingSampleFailure, projectRoutingJournalFailure } from './display-routing-sample-journal.mjs';
import { installPrecompiledRouteLongTaskProbe, projectPrecompiledRouteLongTasks }
  from './precompiled-display-route-long-tasks.mjs';

describe('cold-route main thread evidence', () => {
  it('measures only overlapping numeric intervals and drains pending observer records', () => {
    let deliver;
    let pending = [{ startTime: 90, duration: 60, name: 'private URL' }];
    class Observer {
      static supportedEntryTypes = ['longtask'];
      constructor(callback) { deliver = callback; }
      observe() {}
      takeRecords() { const values = pending; pending = []; return values; }
    }
    const probe = vm.runInNewContext(`(${installPrecompiledRouteLongTaskProbe.toString()})()`, {
      PerformanceObserver: Observer,
    });
    deliver({ getEntries: () => [{ startTime: 190, duration: 100, attribution: ['private'] },
      { startTime: 300, duration: 100 }, { startTime: NaN, duration: 1 }] });
    const observation = projectPrecompiledRouteLongTasks(probe.measure(100, 200));
    expect(observation).toEqual({ supported: true, droppedCount: 0, invalidCount: 1,
      windowMs: 100, count: 2, totalMs: 60, maxMs: 50 });
    expect(JSON.stringify(observation)).not.toContain('private');
    expect(probe.measure(100, 200)).toEqual(observation);
    expect(probe.measure(200, 100)).toBeNull();
    expect(probe.measure(0, 600_001)).toBeNull();
  });

  it('marks unsupported and failed observation unavailable, and reports bounded buffer loss', () => {
    const unsupported = vm.runInNewContext(`(${installPrecompiledRouteLongTaskProbe.toString()})()`);
    expect(unsupported.measure(0, 100)).toMatchObject({ supported: false, count: null, totalMs: null });
    let deliver;
    class Observer {
      static supportedEntryTypes = ['longtask'];
      constructor(callback) { deliver = callback; }
      observe() {}
      takeRecords() { return []; }
    }
    const probe = vm.runInNewContext(`(${installPrecompiledRouteLongTaskProbe.toString()})()`, {
      PerformanceObserver: Observer,
    });
    deliver({ getEntries: () => Array.from({ length: 600 }, (_, index) => ({ startTime: index * 100, duration: 50 })) });
    expect(probe.measure(0, 60_000)).toMatchObject({ supported: true, count: 512, droppedCount: 88 });
    Observer.prototype.takeRecords = () => { throw new Error('private'); };
    expect(probe.measure(0, 60_000)).toMatchObject({ supported: false, count: null, totalMs: null });
    class FailingObserver extends Observer {
      observe() { throw new Error('private'); }
      disconnect() {}
    }
    const failed = vm.runInNewContext(`(${installPrecompiledRouteLongTaskProbe.toString()})()`, {
      PerformanceObserver: FailingObserver,
    });
    expect(failed.measure(0, 100)).toMatchObject({ supported: false, count: null });
  });

  it('rejects malformed host input without copying arbitrary fields', () => {
    const valid = { supported: true, droppedCount: 0, invalidCount: 0, windowMs: 100,
      count: 1, totalMs: 60, maxMs: 60 };
    expect(projectPrecompiledRouteLongTasks({ ...valid, private: 'secret' })).toEqual(valid);
    for (const change of [{ supported: 'true' }, { count: 513 }, { windowMs: Infinity },
      { totalMs: 101 }, { maxMs: 61 }, { invalidCount: -1 }, { droppedCount: 0.5 }]) {
      expect(() => projectPrecompiledRouteLongTasks({ ...valid, ...change })).toThrow('Invalid');
    }
    expect(projectPrecompiledRouteLongTasks(null)).toBeNull();
  });
});

import {
  assertPrecompiledDisplayRoutePerformanceBudget,
  buildPrecompiledDisplayRoutePerformanceResult,
  buildPrecompiledDisplayRouteSampleArguments,
  parsePrecompiledDisplayRouteBenchmarkPresetIds,
  parsePrecompiledDisplayRouteSampleCount,
  parsePrecompiledDisplayRoutePerformanceResult,
  selectPrecompiledDisplayRouteCaptureTargets,
  summarizePrecompiledDisplayRoutePerformance,
} from './precompiled-display-route-performance.mjs';

const capture = (presetId, routeMs, extra = {}) => ({
  presetId,
  privatePath: 'must-not-survive',
  measurement: {
    routeMs,
    workerDurationMs: routeMs * 0.8,
    workerResolution: 'full-route',
    workerStartCount: 1,
    workerAbortCount: 0,
    phaseTrace: [{
      phase: 'quality',
      durationMs: routeMs / 2,
      exclusiveDurationMs: routeMs / 3,
      candidateCount: 14,
      changedEdgeCount: 3,
      workItemCount: 5,
      resolution: 'accepted',
      privateNodeName: 'must-not-survive',
    }],
    ...extra,
  },
});

const sample = (logisticsMs = 700) => buildPrecompiledDisplayRoutePerformanceResult([
  capture('wms-process-flow-v1', 20_000),
  capture('logistics-architecture-v1', logisticsMs),
  capture('wms-demand-allocation-strategy-v2', 2_000),
]);

describe('precompiled display route cold performance', () => {
  const fakeChild = () => Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(),
  });
  it('waits for drained stdio after exit before accepting the final machine result', async () => {
    const child = fakeChild();
    const pending = runColdRoutingSample(1, () => child);
    child.emit('exit', 0);
    const result = buildPrecompiledDisplayRoutePerformanceResult([
      capture('logistics-architecture-v1', 700, { workerExecution: { status: 'available',
        handlerReadyAfterPostMs: 1, postReadyDispatchMs: 2, executionMs: 500, responseDeliveryMs: 3 } }),
    ]);
    child.stdout.emit('data', `PRECOMPILED_DISPLAY_ROUTE_RESULT=${JSON.stringify(result)}\n`);
    child.emit('close', 0);
    await expect(pending).resolves.toEqual(result);
  });
  it.each([
    [1, '', 'child-exit-failed'], [null, '', 'child-exit-failed'],
    [0, '', 'machine-result-missing'], [0, 'private', 'machine-result-missing'],
    [0, 'PRECOMPILED_DISPLAY_ROUTE_RESULT={private', 'machine-result-invalid'],
    [0, 'PRECOMPILED_DISPLAY_ROUTE_RESULT=null', 'machine-result-invalid'],
  ])('classifies child completion safely: %s / %s', async (exitCode, output, expected) => {
    const child = fakeChild();
    const pending = runColdRoutingSample(1, () => child);
    child.stdout.emit('data', output);
    child.stderr.emit('data', 'Bearer private {"waitStatus":"evaluation-timeout","stage":"worker-post"}');
    child.emit('close', exitCode);
    const error = await pending.catch(value => value);
    expect(projectRoutingJournalFailure(error)).toMatchObject({ sampleFailureCode: expected });
    expect(error.message).not.toMatch(/Bearer|private/);
    if (exitCode !== 0) expect(projectRoutingJournalFailure(error)).toMatchObject({
      observedWaitStatus: 'evaluation-timeout', observedRoutingStage: 'worker-post' });
  });
  it('distinguishes missing Worker evidence from malformed machine results', async () => {
    const child = fakeChild();
    const pending = runColdRoutingSample(1, () => child);
    child.stdout.emit('data', `PRECOMPILED_DISPLAY_ROUTE_RESULT=${JSON.stringify(sample())}`);
    child.emit('close', 0);
    await expect(pending).rejects.toMatchObject({ sampleFailureCode: 'worker-evidence-invalid' });
  });
  it('keeps bounded output tails and recognizes a result after oversized logging', async () => {
    const child = fakeChild();
    const pending = runColdRoutingSample(1, () => child);
    child.stdout.emit('data', 'x'.repeat(4 * 1024 * 1024 + 100));
    child.stdout.emit('data', `\nPRECOMPILED_DISPLAY_ROUTE_RESULT=${JSON.stringify(sample())}`);
    child.emit('close', 0);
    await expect(pending).rejects.toMatchObject({ sampleFailureCode: 'worker-evidence-invalid' });
  });
  it('handles synchronous and asynchronous spawn failures without retaining raw errors', async () => {
    await expect(runColdRoutingSample(1, () => { throw new Error('private'); }))
      .rejects.toMatchObject({ sampleFailureCode: 'child-spawn-failed', message: '{"waitStatus":null,"stage":null}' });
    const child = fakeChild();
    const pending = runColdRoutingSample(1, () => child);
    child.emit('error', new Error('private'));
    child.emit('close', -1);
    await expect(pending).rejects.toMatchObject({ sampleFailureCode: 'child-spawn-failed' });
  });
  it('bounds sample inputs and failure codes, excluding forged fields and unrelated failures', async () => {
    for (const index of [null, '1', 0, -1, 101, Infinity, NaN]) {
      await expect(runColdRoutingSample(index)).rejects.toThrow('Invalid cold sample index');
    }
    expect(() => createRoutingSampleFailure('private')).toThrow('Invalid sample failure code');
    expect(projectRoutingJournalFailure({ sampleFailureCode: 'private' })).not.toHaveProperty('sampleFailureCode');
    expect(projectRoutingJournalFailure(createRoutingSampleFailure('child-exit-failed'), 'journal-write-failed'))
      .not.toHaveProperty('sampleFailureCode');
  });
  it('correlates bounded exclusive phase costs with the actual slow sample', () => {
    const phaseTrace = Array.from({ length: 12 }, (_, index) => ({
      phase: `phase-${index}`, parentPhase: null, durationMs: index + 1,
      exclusiveDurationMs: index + 1, resolution: 'fallback', changedEdgeCount: 0,
      evaluationCount: index, candidateCount: 1, workItemCount: 2, privatePayload: 'secret',
    }));
    const slow = buildPrecompiledDisplayRoutePerformanceResult([
      capture('logistics-architecture-v1', 1000, { phaseTrace }),
    ]);
    const fast = buildPrecompiledDisplayRoutePerformanceResult([
      capture('logistics-architecture-v1', 700),
    ]);
    const summary = summarizePrecompiledDisplayRoutePerformance([fast, slow], 2, ['logistics-architecture-v1']);
    const entry = summary.presets['logistics-architecture-v1'].slowestSamples[0];
    expect(entry.sampleIndex).toBe(2);
    expect(entry.slowestPhases).toHaveLength(8);
    expect(entry.slowestPhases.map(phase => phase.exclusiveDurationMs)).toEqual([12, 11, 10, 9, 8, 7, 6, 5]);
    expect(entry.slowestPhases[0]).toMatchObject({ phase: 'phase-11', evaluationCount: 11, resolution: 'fallback' });
    expect(JSON.stringify(entry)).not.toContain('secret');
    expect(slow.presets[0].phaseTrace[0].phase).toBe('phase-0');
  });
  it('preserves execution evidence through machine parsing and summary without treating missing samples as zero', () => {
    const workerExecution = { status: 'available', handlerReadyAfterPostMs: 20,
      postReadyDispatchMs: 10, executionMs: 50, responseDeliveryMs: 20, readyAt: 'private' };
    const result = buildPrecompiledDisplayRoutePerformanceResult([
      capture('logistics-architecture-v1', 700, { workerExecution }),
    ]);
    expect(parsePrecompiledDisplayRoutePerformanceResult(result)).toEqual(result);
    const missing = buildPrecompiledDisplayRoutePerformanceResult([capture('logistics-architecture-v1', 700)]);
    const summary = summarizePrecompiledDisplayRoutePerformance([result, missing], 2, ['logistics-architecture-v1']);
    expect(summary.presets['logistics-architecture-v1'].workerExecutionSampleCount).toBe(1);
    expect(summary.presets['logistics-architecture-v1'].workerExecution.handlerReadyAfterPostMs.p95Ms).toBe(20);
    expect(summary.presets['logistics-architecture-v1'].slowestSamples[0].workerExecution.status).toBe('available');
    expect(JSON.stringify(summary)).not.toContain('private');
  });
  it('retains bounded timing aggregates and correlates slow samples without private fields', () => {
    const workerTimings = { prewarmLeadMs: 100, requestPreparationMs: 10, firstResponseMs: 30,
      workerDeliveryOverheadMs: 100, workerMonotonicDeliveryOverheadMs: 99.5,
      responseParseMs: 20, responseApplyMs: 10, privatePath: 'secret' };
    const result = buildPrecompiledDisplayRoutePerformanceResult([
      capture('logistics-architecture-v1', 700, { workerTimings }),
    ]);
    expect(result.presets[0].workerTimings).not.toHaveProperty('privatePath');
    expect(parsePrecompiledDisplayRoutePerformanceResult(result)).toEqual(result);
    const summary = summarizePrecompiledDisplayRoutePerformance([result], 1, ['logistics-architecture-v1']);
    const logistics = summary.presets['logistics-architecture-v1'];
    expect(logistics.workerTimingSampleCount).toBe(1);
    expect(logistics.workerTimings.firstResponseMs.p95Ms).toBe(30);
    expect(logistics.slowestSamples[0]).toMatchObject({ sampleIndex: 1, routeMs: 700, workerDurationMs: 560 });
    expect(JSON.stringify(summary)).not.toContain('secret');
    for (const invalid of [[], {}, 'invalid', ...[NaN, Infinity, -1, 600_001, '30'].map(firstResponseMs => ({
      ...workerTimings, firstResponseMs,
    }))]) {
      expect(() => buildPrecompiledDisplayRoutePerformanceResult([
        capture('safe', 700, { workerTimings: invalid }),
      ])).toThrow(/invalid aggregate/);
    }
    expect(sample().presets[0].workerTimings).toBeNull();
  });

  it('uses the bounded no-write path for cold samples', () => {
    expect(buildPrecompiledDisplayRouteSampleArguments()).toEqual([
      'scripts/generate-precompiled-display-routes.mjs',
      '--measure-only',
      '--machine',
    ]);
  });

  it('selects one known preset for no-write measurement mode', () => {
    const targets = [
      { presetId: 'first-route', sourcePath: 'first.json' },
      { presetId: 'logistics-architecture-v1', sourcePath: 'logistics.json' },
    ];
    expect(selectPrecompiledDisplayRouteCaptureTargets({
      measureOnly: false,
      checkMode: false,
      presetId: undefined,
      targets,
    })).toBe(targets);
    expect(selectPrecompiledDisplayRouteCaptureTargets({
      measureOnly: true,
      checkMode: false,
      presetId: undefined,
      targets,
    })).toBe(targets);
    expect(selectPrecompiledDisplayRouteCaptureTargets({
      measureOnly: true,
      checkMode: false,
      presetId: ' logistics-architecture-v1 ',
      targets,
    })).toEqual([targets[1]]);
  });

  it('fails closed for invalid focused measurement configuration', () => {
    const targets = [{ presetId: 'known-route', sourcePath: 'known.json' }];
    const select = overrides => selectPrecompiledDisplayRouteCaptureTargets({
      measureOnly: true,
      checkMode: false,
      presetId: 'known-route',
      targets,
      ...overrides,
    });
    expect(() => select({ presetId: '../private' })).toThrow(/bounded lowercase preset id/);
    expect(() => select({ presetId: 'unknown-route' })).toThrow(/Unknown/);
    expect(() => select({ checkMode: true })).toThrow(/cannot be combined/);
    expect(() => select({ measureOnly: false, presetId: 'known-route' })).toThrow(/only valid/);
    expect(() => select({ targets: [] })).toThrow(/bounded non-empty/);
  });

  it('projects only bounded aggregate measurements', () => {
    const result = sample();
    expect(result.presets).toHaveLength(3);
    expect(result.presets[1]).toMatchObject({
      presetId: 'logistics-architecture-v1',
      routeMs: 700,
      workerDurationMs: 560,
      routeOverheadMs: 140,
      tracedExclusiveMs: 233.333,
      workerUntracedMs: 326.667,
      workerStartCount: 1,
      workerAbortCount: 0,
      phaseTrace: [{
        phase: 'quality',
        parentPhase: null,
        durationMs: 350,
        exclusiveDurationMs: 700 / 3,
        candidateCount: 14,
        changedEdgeCount: 3,
        workItemCount: 5,
        resolution: 'accepted',
      }],
    });
    expect(JSON.stringify(result)).not.toContain('must-not-survive');
  });

  it('keeps bounded phase work counts and rejects unsafe counter values', () => {
    const valid = sample().presets[1].phaseTrace[0];
    expect(valid.workItemCount).toBe(5);

    const invalid = buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', 10, {
        phaseTrace: [{
          phase: 'quality',
          durationMs: 1,
          changedEdgeCount: 0,
          workItemCount: Number.POSITIVE_INFINITY,
          resolution: 'accepted',
        }],
      }),
    ]);
    expect(invalid.presets[0].phaseTrace[0].workItemCount).toBe(0);
  });

  it('fails closed for malformed, unsafe, duplicated, or incomplete captures', () => {
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([])).toThrow(/bounded/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('../private', 10),
    ])).toThrow(/invalid measurement/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('same', 10), capture('same', 20),
    ])).toThrow(/duplicate/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', Number.POSITIVE_INFINITY),
    ])).toThrow(/invalid measurement/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', 10, { workerDurationMs: Number.NaN }),
    ])).toThrow(/invalid measurement/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', 10, { workerDurationMs: 11 }),
    ])).toThrow(/invalid measurement/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', 10, {
        workerDurationMs: 5,
        phaseTrace: [{
          phase: 'quality',
          durationMs: 10,
          exclusiveDurationMs: 10,
          changedEdgeCount: 0,
          resolution: 'accepted',
        }],
      }),
    ])).toThrow(/exceeds/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', 10, { workerAbortCount: 1 }),
    ])).toThrow(/invalid measurement/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', 10, { phaseTrace: [{ phase: '../unsafe', durationMs: 1 }] }),
    ])).toThrow(/invalid aggregate/);
    expect(() => buildPrecompiledDisplayRoutePerformanceResult([
      capture('safe', 10, { phaseTrace: [{
        phase: 'quality',
        durationMs: 1,
        changedEdgeCount: 0,
        resolution: 'forged',
      }] }),
    ])).toThrow(/invalid aggregate/);
    expect(() => parsePrecompiledDisplayRoutePerformanceResult(null)).toThrow(/malformed/);
    expect(() => parsePrecompiledDisplayRoutePerformanceResult({ presets: [{
      presetId: 'safe',
      routeMs: 10,
      workerDurationMs: 8,
      workerResolution: 'forged',
      workerStartCount: 1,
      workerAbortCount: 0,
      phaseTrace: [],
    }] })).toThrow(/invalid measurement/);
  });

  it('validates sample count boundaries', () => {
    expect(parsePrecompiledDisplayRouteSampleCount(undefined)).toBe(30);
    expect(parsePrecompiledDisplayRouteSampleCount('1')).toBe(1);
    expect(parsePrecompiledDisplayRouteSampleCount('100')).toBe(100);
    for (const value of ['0', '101', '1.5', 'invalid']) {
      expect(() => parsePrecompiledDisplayRouteSampleCount(value)).toThrow(/integer/);
    }
  });

  it('validates focused benchmark preset selection', () => {
    expect(parsePrecompiledDisplayRouteBenchmarkPresetIds(undefined)).toEqual([
      'logistics-architecture-v1',
      'wms-demand-allocation-strategy-v2',
      'wms-process-flow-v1',
    ]);
    expect(parsePrecompiledDisplayRouteBenchmarkPresetIds(
      ' logistics-architecture-v1 ',
    )).toEqual(['logistics-architecture-v1']);
    for (const value of ['../private', 'unknown-route']) {
      expect(() => parsePrecompiledDisplayRouteBenchmarkPresetIds(value)).toThrow(/known bounded/);
    }
  });

  it('reports median, p95, max and enforces the locked p95 budgets', () => {
    const samples = Array.from({ length: 30 }, (_, index) => sample(650 + index));
    const summary = summarizePrecompiledDisplayRoutePerformance(samples, 30);
    expect(summary.presets['logistics-architecture-v1'].route).toEqual({
      sampleCount: 30,
      medianMs: 664,
      p95Ms: 678,
      maxMs: 679,
    });
    expect(summary.presets['logistics-architecture-v1'].workerCompute).toEqual({
      sampleCount: 30,
      medianMs: 531.2,
      p95Ms: 542.4,
      maxMs: 543.2,
    });
    expect(summary.presets['logistics-architecture-v1'].routeOverhead).toEqual({
      sampleCount: 30,
      medianMs: 132.8,
      p95Ms: 135.6,
      maxMs: 135.8,
    });
    expect(summary.presets['logistics-architecture-v1'].tracedCompute).toEqual({
      sampleCount: 30,
      medianMs: 221.333,
      p95Ms: 226,
      maxMs: 226.333,
    });
    expect(summary.presets['logistics-architecture-v1'].untracedCompute).toEqual({
      sampleCount: 30,
      medianMs: 309.867,
      p95Ms: 316.4,
      maxMs: 316.867,
    });
    expect(summary.presets['logistics-architecture-v1'].phases.quality).toMatchObject({
      sampleCount: 30,
    });
    expect(assertPrecompiledDisplayRoutePerformanceBudget(summary)).toBe(true);
    const focusedSamples = samples.map(result => ({
      presets: result.presets.filter(item => item.presetId === 'logistics-architecture-v1'),
    }));
    const focused = summarizePrecompiledDisplayRoutePerformance(
      focusedSamples,
      30,
      ['logistics-architecture-v1'],
    );
    expect(Object.keys(focused.presets)).toEqual(['logistics-architecture-v1']);
    expect(assertPrecompiledDisplayRoutePerformanceBudget(focused)).toBe(true);
    const overBudget = summarizePrecompiledDisplayRoutePerformance(
      Array.from({ length: 30 }, () => buildPrecompiledDisplayRoutePerformanceResult([
        capture('wms-process-flow-v1', 20_000),
        capture('logistics-architecture-v1', 2_800, {
          workerDurationMs: 600,
          workerExecution: { status: 'available', handlerReadyAfterPostMs: 2_000,
            postReadyDispatchMs: 1, executionMs: 600, responseDeliveryMs: 2 },
          workerTimings: { prewarmLeadMs: 100, requestPreparationMs: 1, firstResponseMs: 2_004,
            workerDeliveryOverheadMs: 2_000, workerMonotonicDeliveryOverheadMs: 2_000,
            responseParseMs: 2, responseApplyMs: 3, privatePath: 'secret' },
          phaseTrace: [{ phase: 'quality', durationMs: 300, exclusiveDurationMs: 300,
            candidateCount: 14, changedEdgeCount: 3, workItemCount: 5, resolution: 'accepted' }],
        }),
        capture('wms-demand-allocation-strategy-v2', 2_000),
      ])),
      30,
    );
    expect(() => assertPrecompiledDisplayRoutePerformanceBudget(overBudget)).toThrow(/handlerReadyAfterPostP95Ms/);
    expect(() => assertPrecompiledDisplayRoutePerformanceBudget(overBudget)).toThrow(/workerDeliveryOverheadP95Ms/);
    expect(() => assertPrecompiledDisplayRoutePerformanceBudget(overBudget)).not.toThrow(/secret/);
    expect(() => summarizePrecompiledDisplayRoutePerformance(samples.slice(1), 30)).toThrow(/missing/);
  });
});
