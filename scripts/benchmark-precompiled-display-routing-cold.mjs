import { spawn } from 'node:child_process';

import {
  assertPrecompiledDisplayRoutePerformanceBudget,
  parsePrecompiledDisplayRoutePerformanceResult,
  parsePrecompiledDisplayRouteSampleCount,
  PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX,
  summarizePrecompiledDisplayRoutePerformance,
} from './lib/precompiled-display-route-performance.mjs';

const MAX_CHILD_OUTPUT_BYTES = 4 * 1024 * 1024;

const runOneSample = sampleIndex => new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    ['scripts/generate-precompiled-display-routes.mjs', '--check', '--machine'],
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
    try {
      resolve(parsePrecompiledDisplayRoutePerformanceResult(
        JSON.parse(line.slice(PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX.length)),
      ));
    } catch {
      reject(new Error(`Cold-routing sample ${sampleIndex} emitted malformed JSON`));
    }
  });
});

const sampleCount = parsePrecompiledDisplayRouteSampleCount(
  process.env.DISPLAY_ROUTING_COLD_SAMPLE_COUNT,
);
const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
  samples.push(await runOneSample(index + 1));
  process.stdout.write(`cold-routing sample ${index + 1}/${sampleCount} complete\n`);
}

const summary = summarizePrecompiledDisplayRoutePerformance(samples, sampleCount);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
assertPrecompiledDisplayRoutePerformanceBudget(summary);
