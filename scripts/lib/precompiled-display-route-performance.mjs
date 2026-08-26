import { summarizeDisplayRoutingSamples } from './display-routing-browser-performance.mjs';

export const PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX =
  'PRECOMPILED_DISPLAY_ROUTE_RESULT=';

export const PRECOMPILED_DISPLAY_ROUTE_P95_BUDGET_MS = Object.freeze({
  'wms-process-flow-v1': 30_000,
  // The product owner accepted ~1.03s as the current convergence target and
  // explicitly removed the former <750ms release blocker. Keep a small,
  // measured scheduling margin without weakening the other preset budgets.
  'logistics-architecture-v1': 1_100,
  'wms-demand-allocation-strategy-v2': 3_000,
});

const MAX_DURATION_MS = 600_000;
const MAX_TRACE_ENTRIES = 256;
const MAX_COUNTER = 1_000_000_000;
const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const PHASE_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const ROUTE_RESOLUTIONS = new Set(['full-route', 'full-route-repaired']);
const PHASE_RESOLUTIONS = new Set(['hit', 'skip', 'accepted', 'rejected', 'fallback']);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finiteDuration = value => (
  Number.isFinite(value) && value >= 0 && value <= MAX_DURATION_MS ? value : null
);
const subtractDurations = (totalMs, partMs) => Number((totalMs - partMs).toFixed(3));
const sumDurations = durations => Number(
  durations.reduce((sum, durationMs) => sum + durationMs, 0).toFixed(3),
);
const boundedCounter = value => (
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER ? value : null
);
const boundedToken = (value, pattern) => (
  typeof value === 'string' && pattern.test(value) ? value : null
);

export const selectPrecompiledDisplayRouteCaptureTargets = ({
  measureOnly,
  checkMode,
  presetId,
  targets,
}) => {
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > 32) {
    throw new Error('Precompiled route targets must be a bounded non-empty array');
  }
  const requestedPresetId = typeof presetId === 'string' ? presetId.trim() : '';
  if (!measureOnly) {
    if (requestedPresetId) {
      throw new Error('PRECOMPILED_ROUTE_PRESET_ID is only valid with --measure-only');
    }
    return targets;
  }
  if (checkMode) throw new Error('--measure-only cannot be combined with --check');
  if (!boundedToken(requestedPresetId, PRESET_ID_PATTERN)) {
    throw new Error(
      'PRECOMPILED_ROUTE_PRESET_ID must be a bounded lowercase preset id in --measure-only mode',
    );
  }
  const selected = targets.find(target => target?.presetId === requestedPresetId);
  if (!selected) {
    throw new Error(`Unknown precompiled route preset id ${requestedPresetId}`);
  }
  return [selected];
};

const projectPhaseTrace = value => {
  if (!Array.isArray(value) || value.length > MAX_TRACE_ENTRIES) {
    throw new Error('Cold-route phase trace is missing or exceeds its bounded limit');
  }
  return value.map((trace) => {
    if (!isRecord(trace)) throw new Error('Cold-route phase trace contains an invalid entry');
    const phase = boundedToken(trace.phase, PHASE_PATTERN);
    const parentPhase = trace.parentPhase == null
      ? null
      : boundedToken(trace.parentPhase, PHASE_PATTERN);
    const durationMs = finiteDuration(trace.durationMs);
    const exclusiveDurationMs = finiteDuration(trace.exclusiveDurationMs);
    const resolution = PHASE_RESOLUTIONS.has(trace.resolution) ? trace.resolution : null;
    const changedEdgeCount = boundedCounter(trace.changedEdgeCount);
    if (
      !phase
      || (trace.parentPhase != null && !parentPhase)
      || durationMs == null
      || !resolution
      || changedEdgeCount == null
    ) {
      throw new Error('Cold-route phase trace contains invalid aggregate data');
    }
    return {
      phase,
      parentPhase,
      durationMs,
      exclusiveDurationMs: exclusiveDurationMs ?? durationMs,
      evaluationCount: boundedCounter(trace.evaluationCount) ?? 0,
      cacheHitCount: boundedCounter(trace.cacheHitCount) ?? 0,
      scannedNodeCount: boundedCounter(trace.scannedNodeCount) ?? 0,
      scannedSegmentCount: boundedCounter(trace.scannedSegmentCount) ?? 0,
      scannedEdgePairCount: boundedCounter(trace.scannedEdgePairCount) ?? 0,
      candidateCount: boundedCounter(trace.candidateCount) ?? 0,
      changedEdgeCount,
      resolution,
    };
  });
};

export const buildPrecompiledDisplayRoutePerformanceResult = captures => {
  if (!Array.isArray(captures) || captures.length === 0 || captures.length > 32) {
    throw new Error('Cold-route captures must be a bounded non-empty array');
  }
  const presets = captures.map((capture) => {
    const measurement = isRecord(capture?.measurement) ? capture.measurement : null;
    const presetId = boundedToken(capture?.presetId, PRESET_ID_PATTERN);
    const routeMs = finiteDuration(measurement?.routeMs);
    const workerDurationMs = finiteDuration(measurement?.workerDurationMs);
    const workerStartCount = boundedCounter(measurement?.workerStartCount);
    const workerAbortCount = boundedCounter(measurement?.workerAbortCount);
    const workerResolution = ROUTE_RESOLUTIONS.has(measurement?.workerResolution)
      ? measurement.workerResolution
      : null;
    if (
      !presetId
      || routeMs == null
      || workerDurationMs == null
      || workerDurationMs > routeMs
      || workerStartCount !== 1
      || workerAbortCount !== 0
      || !workerResolution
    ) throw new Error('Cold-route capture contains invalid measurement data');
    const phaseTrace = projectPhaseTrace(measurement.phaseTrace);
    const tracedExclusiveMs = sumDurations(
      phaseTrace.map(trace => trace.exclusiveDurationMs),
    );
    if (tracedExclusiveMs > workerDurationMs + 1) {
      throw new Error('Cold-route trace exceeds its Worker compute duration');
    }
    return {
      presetId,
      routeMs,
      workerDurationMs,
      routeOverheadMs: subtractDurations(routeMs, workerDurationMs),
      tracedExclusiveMs,
      workerUntracedMs: subtractDurations(
        workerDurationMs,
        Math.min(workerDurationMs, tracedExclusiveMs),
      ),
      workerResolution,
      workerStartCount,
      workerAbortCount,
      phaseTrace,
    };
  });
  if (new Set(presets.map(item => item.presetId)).size !== presets.length) {
    throw new Error('Cold-route capture contains duplicate preset ids');
  }
  return { presets };
};

export const parsePrecompiledDisplayRoutePerformanceResult = value => {
  if (!isRecord(value) || !Array.isArray(value.presets)) {
    throw new Error('Cold-route machine result is malformed');
  }
  return buildPrecompiledDisplayRoutePerformanceResult(value.presets.map(item => ({
    presetId: item?.presetId,
    measurement: item,
  })));
};

export const parsePrecompiledDisplayRouteSampleCount = value => {
  if (typeof value === 'undefined' || String(value).trim() === '') return 30;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('DISPLAY_ROUTING_COLD_SAMPLE_COUNT must be an integer from 1 to 100');
  }
  return parsed;
};

export const parsePrecompiledDisplayRouteBenchmarkPresetIds = value => {
  if (typeof value === 'undefined' || String(value).trim() === '') {
    return Object.keys(PRECOMPILED_DISPLAY_ROUTE_P95_BUDGET_MS).sort();
  }
  const presetId = boundedToken(String(value).trim(), PRESET_ID_PATTERN);
  if (!presetId || !(presetId in PRECOMPILED_DISPLAY_ROUTE_P95_BUDGET_MS)) {
    throw new Error('PRECOMPILED_ROUTE_PRESET_ID must identify one known bounded preset');
  }
  return [presetId];
};

export const summarizePrecompiledDisplayRoutePerformance = (
  samples,
  expectedSampleCount,
  requestedPresetIds = Object.keys(PRECOMPILED_DISPLAY_ROUTE_P95_BUDGET_MS).sort(),
) => {
  if (
    !Array.isArray(samples)
    || !Number.isSafeInteger(expectedSampleCount)
    || expectedSampleCount < 1
    || samples.length !== expectedSampleCount
  ) throw new Error('Cold-route benchmark is missing independent samples');
  if (
    !Array.isArray(requestedPresetIds)
    || requestedPresetIds.length === 0
    || requestedPresetIds.length > 32
    || new Set(requestedPresetIds).size !== requestedPresetIds.length
    || requestedPresetIds.some(presetId => !(presetId in PRECOMPILED_DISPLAY_ROUTE_P95_BUDGET_MS))
  ) throw new Error('Cold-route benchmark preset selection is invalid');
  const presetIds = [...requestedPresetIds].sort();
  const presets = {};
  for (const presetId of presetIds) {
    const cases = samples.map(sample => (
      Array.isArray(sample?.presets)
        ? sample.presets.find(item => item?.presetId === presetId)
        : null
    ));
    if (cases.some(item => !item)) {
      throw new Error(`Cold-route benchmark is missing ${presetId}`);
    }
    const phaseNames = [...new Set(cases.flatMap(item => (
      Array.isArray(item.phaseTrace) ? item.phaseTrace.map(trace => trace.phase) : []
    )))].sort();
    presets[presetId] = {
      route: summarizeDisplayRoutingSamples(cases.map(item => item.routeMs)),
      workerCompute: summarizeDisplayRoutingSamples(cases.map(item => item.workerDurationMs)),
      routeOverhead: summarizeDisplayRoutingSamples(cases.map(item => item.routeOverheadMs)),
      tracedCompute: summarizeDisplayRoutingSamples(cases.map(item => item.tracedExclusiveMs)),
      untracedCompute: summarizeDisplayRoutingSamples(cases.map(item => item.workerUntracedMs)),
      resolutions: Object.fromEntries([...new Set(cases.map(item => item.workerResolution))]
        .sort()
        .map(resolution => [resolution, cases.filter(item => item.workerResolution === resolution).length])),
      workerStartCount: cases.reduce((sum, item) => sum + item.workerStartCount, 0),
      workerAbortCount: cases.reduce((sum, item) => sum + item.workerAbortCount, 0),
      phases: Object.fromEntries(phaseNames.map(phase => [
        phase,
        summarizeDisplayRoutingSamples(cases.flatMap(item => (
          item.phaseTrace
            .filter(trace => trace.phase === phase)
            .map(trace => trace.exclusiveDurationMs)
        ))),
      ]).filter(([, summary]) => summary)
        .sort((left, right) => right[1].p95Ms - left[1].p95Ms)
        .slice(0, 20)),
    };
  }
  return { sampleCount: expectedSampleCount, presets };
};

export const assertPrecompiledDisplayRoutePerformanceBudget = summary => {
  const presetEntries = Object.entries(summary?.presets ?? {});
  if (presetEntries.length === 0) throw new Error('Cold routing performance summary is empty');
  const exceeded = presetEntries
    .map(([presetId]) => ({
      presetId,
      budgetMs: PRECOMPILED_DISPLAY_ROUTE_P95_BUDGET_MS[presetId],
      p95Ms: summary?.presets?.[presetId]?.route?.p95Ms,
    }))
    .filter(item => (
      !Number.isFinite(item.budgetMs)
      || !Number.isFinite(item.p95Ms)
      || item.p95Ms > item.budgetMs
    ));
  if (exceeded.length > 0) {
    throw new Error(`Cold routing p95 performance budget exceeded:\n${JSON.stringify({
      sampleCount: summary?.sampleCount ?? null,
      exceeded,
    }, null, 2)}`);
  }
  return true;
};
