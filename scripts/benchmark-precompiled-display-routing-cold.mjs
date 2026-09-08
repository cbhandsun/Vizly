import { spawn } from 'node:child_process';
import { collectJournaledRoutingSamples } from './lib/display-routing-sample-journal.mjs';
import { assertPrecompiledWorkerExecutionCoverage } from './lib/precompiled-display-route-worker-execution.mjs';

import {
  assertPrecompiledDisplayRoutePerformanceBudget,
  buildPrecompiledDisplayRouteSampleArguments,
  parsePrecompiledDisplayRouteBenchmarkPresetIds,
  parsePrecompiledDisplayRoutePerformanceResult,
  parsePrecompiledDisplayRouteSampleCount,
  PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX,
  summarizePrecompiledDisplayRoutePerformance,
} from './lib/precompiled-display-route-performance.mjs';

const MAX_CHILD_OUTPUT_BYTES = 4 * 1024 * 1024;

const requestedPresetId = process.env.PRECOMPILED_ROUTE_PRESET_ID;
const presetIds = parsePrecompiledDisplayRouteBenchmarkPresetIds(requestedPresetId);

const runOneSample = sampleIndex => new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    buildPrecompiledDisplayRouteSampleArguments(),
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DISPLAY_ROUTING_COLD_SAMPLE_INDEX: String(sampleIndex),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
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
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code !== 0) {
      reject(new Error(`Cold-routing sample ${sampleIndex} failed:\n${stderr || stdout}`));
      return;
    }
    const line = stdout.split(/\r?\n/).find(candidate => (
      candidate.startsWith(PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX)
    ));
    if (!line) {
      reject(new Error(`Cold-routing sample ${sampleIndex} did not emit a machine result`));
      return;
    }
    let sample;
    try {
      sample = parsePrecompiledDisplayRoutePerformanceResult(
        JSON.parse(line.slice(PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX.length)),
      );
    } catch {
      reject(new Error(`Cold-routing sample ${sampleIndex} emitted malformed JSON`));
      return;
    }
    try {
      assertPrecompiledWorkerExecutionCoverage(sample);
    } catch {
      reject(new Error(`Cold-routing sample ${sampleIndex} is missing valid Worker execution evidence`));
      return;
    }
    resolve(sample);
  });
});

const sampleCount = parsePrecompiledDisplayRouteSampleCount(
  process.env.DISPLAY_ROUTING_COLD_SAMPLE_COUNT,
);
const samples = await collectJournaledRoutingSamples({ kind: 'cold', sampleCount,
  runSample: runOneSample, sourceCommit: process.env.GITHUB_SHA ?? null,
  onSample: index => process.stdout.write(`cold-routing sample ${index}/${sampleCount} complete\n`),
});

const summary = summarizePrecompiledDisplayRoutePerformance(samples, sampleCount, presetIds);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
assertPrecompiledDisplayRoutePerformanceBudget(summary);
