import { spawn } from 'node:child_process';
import { createRoutingSampleFailure } from './display-routing-sample-journal.mjs';
import { assertPrecompiledWorkerExecutionCoverage } from './precompiled-display-route-worker-execution.mjs';
import { buildPrecompiledDisplayRouteSampleArguments, parsePrecompiledDisplayRoutePerformanceResult,
  PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX } from './precompiled-display-route-performance.mjs';

const MAX_CHILD_OUTPUT_CHARS = 4 * 1024 * 1024;
const appendBounded = (current, chunk) => (current + String(chunk)).slice(-MAX_CHILD_OUTPUT_CHARS);

export const runColdRoutingSample = (sampleIndex, spawnChild = spawn) => new Promise((resolve, reject) => {
  if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 1 || sampleIndex > 100) {
    reject(new Error('Invalid cold sample index'));
    return;
  }
  let child;
  try {
    child = spawnChild(process.execPath, buildPrecompiledDisplayRouteSampleArguments(), {
      cwd: process.cwd(), env: { ...process.env, DISPLAY_ROUTING_COLD_SAMPLE_INDEX: String(sampleIndex) },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
  } catch {
    reject(createRoutingSampleFailure('child-spawn-failed'));
    return;
  }
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout = appendBounded(stdout, chunk); });
  child.stderr.on('data', chunk => { stderr = appendBounded(stderr, chunk); });
  child.once('error', () => reject(createRoutingSampleFailure('child-spawn-failed')));
  // close follows stdio drainage; exit alone can precede the last machine-result chunk.
  child.once('close', code => {
    if (code !== 0) {
      reject(createRoutingSampleFailure('child-exit-failed', { message: stderr || stdout }));
      return;
    }
    const line = stdout.split(/\r?\n/).find(candidate => candidate.startsWith(PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX));
    if (!line) {
      reject(createRoutingSampleFailure('machine-result-missing'));
      return;
    }
    let sample;
    try {
      sample = parsePrecompiledDisplayRoutePerformanceResult(JSON.parse(line.slice(PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX.length)));
    } catch {
      reject(createRoutingSampleFailure('machine-result-invalid'));
      return;
    }
    try {
      assertPrecompiledWorkerExecutionCoverage(sample);
    } catch {
      reject(createRoutingSampleFailure('worker-evidence-invalid'));
      return;
    }
    resolve(sample);
  });
});
