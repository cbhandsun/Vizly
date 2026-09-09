import { spawn } from 'node:child_process';
import { collectJournaledRoutingSamples, createRoutingSampleFailure } from './lib/display-routing-sample-journal.mjs';
import { summarizeDisplayRoutingEditStability } from './lib/display-routing-edit-stability.mjs';

import {
  assertDisplayRoutingPerformanceSummaryBudget,
  summarizeDisplayRoutingOutlierSamples,
  summarizeDisplayRoutingSamples,
} from './lib/display-routing-browser-performance.mjs';

const RESULT_PREFIX = 'DISPLAY_ROUTING_BROWSER_RESULT=';
const MAX_CHILD_OUTPUT_BYTES = 4 * 1024 * 1024;

const parseSampleCount = (value) => {
  if (typeof value === 'undefined' || String(value).trim() === '') return 30;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('DISPLAY_ROUTING_SAMPLE_COUNT must be an integer from 1 to 100');
  }
  return parsed;
};

const runOneSample = sampleIndex => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/verify-display-routing-browser.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DISPLAY_ROUTING_BROWSER_JSON: '1',
      DISPLAY_ROUTING_BROWSER_COLLECT_PERFORMANCE: '1',
      DISPLAY_ROUTING_BROWSER_SAMPLE_INDEX: String(sampleIndex),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  const appendBounded = (current, chunk) => {
    const next = current + String(chunk);
    return next.length <= MAX_CHILD_OUTPUT_BYTES
      ? next
      : next.slice(next.length - MAX_CHILD_OUTPUT_BYTES);
  };
  child.stdout.on('data', chunk => { stdout = appendBounded(stdout, chunk); });
  child.stderr.on('data', chunk => { stderr = appendBounded(stderr, chunk); });
  child.once('error', error => reject(createRoutingSampleFailure('child-spawn-failed', error)));
  child.once('exit', (code) => {
    if (code !== 0) {
      reject(createRoutingSampleFailure('child-exit-failed', {
        message: `Display-routing sample ${sampleIndex} failed:\n${stderr || stdout}`,
        childFailure: { sampleIndex, stdout, stderr },
      }));
      return;
    }
    const line = stdout.split(/\r?\n/).find(candidate => candidate.startsWith(RESULT_PREFIX));
    if (!line) {
      reject(createRoutingSampleFailure('machine-result-missing',
        new Error(`Display-routing sample ${sampleIndex} did not emit a machine result`)));
      return;
    }
    try {
      resolve(JSON.parse(line.slice(RESULT_PREFIX.length)));
    } catch {
      reject(createRoutingSampleFailure('machine-result-invalid',
        new Error(`Display-routing sample ${sampleIndex} emitted malformed JSON`)));
    }
  });
});

const sampleCount = parseSampleCount(process.env.DISPLAY_ROUTING_SAMPLE_COUNT);
const samples = await collectJournaledRoutingSamples({ kind: 'incremental', sampleCount,
  runSample: runOneSample, sourceCommit: process.env.GITHUB_SHA ?? null,
  onSample: index => process.stdout.write(`display-routing sample ${index}/${sampleCount} complete\n`),
});

const dragNodeIds = [...new Set(samples.flatMap(sample => (
  Array.isArray(sample.dragCases) ? sample.dragCases.map(item => item.nodeId) : []
)))].sort();
const initialNodeIds = [...new Set(samples.flatMap(sample => (
  Array.isArray(sample.initialRoutes) ? sample.initialRoutes.map(item => item.nodeId) : []
)))].sort();
const summary = {
  sampleCount,
  initialRoute: summarizeDisplayRoutingSamples(samples.flatMap(sample => sample.initialRouteMs ?? [])),
  initialCases: Object.fromEntries(initialNodeIds.map(nodeId => {
    const cases = samples.flatMap(sample => sample.initialRoutes ?? [])
      .filter(item => item.nodeId === nodeId);
    const resolutions = Object.fromEntries([...new Set(cases.map(item => item.workerResolution))]
      .filter(value => typeof value === 'string')
      .sort()
      .map(resolution => [resolution, cases.filter(item => (
        item.workerResolution === resolution
      )).length]));
    return [nodeId, {
      route: summarizeDisplayRoutingSamples(cases.map(item => item.routeMs)),
      resolutions,
      workerStartCount: cases.reduce((total, item) => total + (item.workerStartCount ?? 0), 0),
      workerAbortCount: cases.reduce((total, item) => total + (item.workerAbortCount ?? 0), 0),
      scheduledToWorker: summarizeDisplayRoutingSamples(
        cases.map(item => item.scheduledToWorkerMs),
      ),
      workerRequestDelay: summarizeDisplayRoutingSamples(
        cases.map(item => item.workerRequestDelayMs),
      ),
      workerRoundTrip: summarizeDisplayRoutingSamples(cases.map(item => item.workerRoundTripMs)),
      workerCompute: summarizeDisplayRoutingSamples(cases.map(item => item.workerDurationMs)),
      workerDeliveryWait: summarizeDisplayRoutingSamples(
        cases.map(item => item.workerDeliveryWaitMs),
      ),
      workerBoundaryParse: summarizeDisplayRoutingSamples(
        cases.map(item => item.workerBoundaryParseMs),
      ),
      parsedToFinal: summarizeDisplayRoutingSamples(cases.map(item => item.parsedToFinalMs)),
      totalRoute: summarizeDisplayRoutingSamples(cases.map(item => item.totalRouteMs)),
      phases: Object.fromEntries([...new Set(cases.flatMap(item => (
        item.phaseTrace?.map(trace => trace.phase) ?? []
      )))].map(phase => [phase, summarizeDisplayRoutingSamples(cases.flatMap(item => (
        item.phaseTrace?.filter(trace => trace.phase === phase)
          .map(trace => trace.exclusiveDurationMs) ?? []
      )))])
        .filter(([, value]) => value)
        .sort((left, right) => right[1].p95Ms - left[1].p95Ms)
        .slice(0, 12)),
    }];
  })),
  dragCases: Object.fromEntries(dragNodeIds.map(nodeId => {
    const cases = samples.flatMap(sample => sample.dragCases ?? [])
      .filter(item => item.nodeId === nodeId);
  return [nodeId, {
      editStability: summarizeDisplayRoutingEditStability(cases.map(item => item.editStability)),
      releaseToFinal: summarizeDisplayRoutingSamples(cases.map(item => item.releaseToFinalMs)),
      workerToFinal: summarizeDisplayRoutingSamples(cases.map(item => item.workerToFinalMs)),
      workerRoundTrip: summarizeDisplayRoutingSamples(cases.map(item => item.workerRoundTripMs)),
      workerCompute: summarizeDisplayRoutingSamples(cases.map(item => item.workerDurationMs)),
      workerDeliveryWait: summarizeDisplayRoutingSamples(
        cases.map(item => item.workerDeliveryWaitMs),
      ),
      workerLongTaskTotal: summarizeDisplayRoutingSamples(
        cases.map(item => item.workerLongTaskTotalMs),
      ),
      workerLongTaskMax: summarizeDisplayRoutingSamples(
        cases.map(item => item.workerLongTaskMaxMs),
      ),
      responseToFinal: summarizeDisplayRoutingSamples(cases.map(item => item.responseToFinalMs)),
      workerBoundaryParse: summarizeDisplayRoutingSamples(
        cases.map(item => item.workerBoundaryParseMs),
      ),
      parsedToFinal: summarizeDisplayRoutingSamples(cases.map(item => item.parsedToFinalMs)),
      localRoute: summarizeDisplayRoutingSamples(cases.map(item => item.localRouteMs)),
      slowSamples: summarizeDisplayRoutingOutlierSamples(samples, nodeId),
      workerStartCount: cases.reduce((total, item) => total + (item.workerStartCount ?? 0), 0),
      fallbackCount: cases.filter(item => item.fallbackLevel !== 'none').length,
      abortCount: cases.reduce((total, item) => total + (item.workerAbortCount ?? 0), 0),
      phases: Object.fromEntries([...new Set(cases.flatMap(item => (
        item.phaseTrace?.map(trace => trace.phase) ?? []
      )))].map(phase => [phase, summarizeDisplayRoutingSamples(cases.flatMap(item => (
        item.phaseTrace?.filter(trace => trace.phase === phase)
          .map(trace => trace.exclusiveDurationMs) ?? []
      )))])
        .filter(([, value]) => value)
        .sort((left, right) => right[1].p95Ms - left[1].p95Ms)
        .slice(0, 12)),
    }];
  })),
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
assertDisplayRoutingPerformanceSummaryBudget(summary);
