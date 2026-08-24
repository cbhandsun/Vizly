import { describe, expect, it } from 'vitest';

import {
  assertPrecompiledDisplayRoutePerformanceBudget,
  buildPrecompiledDisplayRoutePerformanceResult,
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
    workerResolution: 'full-route',
    workerStartCount: 1,
    workerAbortCount: 0,
    phaseTrace: [{
      phase: 'quality',
      durationMs: routeMs / 2,
      exclusiveDurationMs: routeMs / 3,
      candidateCount: 14,
      changedEdgeCount: 3,
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
    expect(() => select({ presetId: '' })).toThrow(/bounded lowercase preset id/);
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
      workerStartCount: 1,
      workerAbortCount: 0,
      phaseTrace: [{
        phase: 'quality',
        parentPhase: null,
        durationMs: 350,
        exclusiveDurationMs: 700 / 3,
        candidateCount: 14,
        changedEdgeCount: 3,
        resolution: 'accepted',
      }],
    });
    expect(JSON.stringify(result)).not.toContain('must-not-survive');
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

  it('reports median, p95, max and enforces the locked p95 budgets', () => {
    const samples = Array.from({ length: 30 }, (_, index) => sample(650 + index));
    const summary = summarizePrecompiledDisplayRoutePerformance(samples, 30);
    expect(summary.presets['logistics-architecture-v1'].route).toEqual({
      sampleCount: 30,
      medianMs: 664,
      p95Ms: 678,
      maxMs: 679,
    });
    expect(summary.presets['logistics-architecture-v1'].phases.quality).toMatchObject({
      sampleCount: 30,
    });
    expect(assertPrecompiledDisplayRoutePerformanceBudget(summary)).toBe(true);
    const overBudget = summarizePrecompiledDisplayRoutePerformance(
      Array.from({ length: 30 }, () => sample(751)),
      30,
    );
    expect(() => assertPrecompiledDisplayRoutePerformanceBudget(overBudget)).toThrow(/logistics/);
    expect(() => summarizePrecompiledDisplayRoutePerformance(samples.slice(1), 30)).toThrow(/missing/);
  });
});
