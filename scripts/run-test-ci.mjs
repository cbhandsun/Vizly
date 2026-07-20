import { spawn } from 'node:child_process';

import {
  isRetryableTestCiInfrastructureFailure,
  rankSlowestTestCiShards,
  resolveTestCiConcurrency,
  resolveTestCiCoverageEnabled,
  resolveTestCiShardRetries,
  resolveTestCiShardTimeoutMs,
} from './lib/test-ci-runner-policy.mjs';
import {
  getTestCiCoverageReportName,
  isTestCiTimingSensitiveShard,
  resolveTestCiShardSelection,
  shouldCollectTestCiCoverage,
} from './lib/test-ci-shards.mjs';

const requestedGroup = process.argv[2]?.trim() || process.env.TEST_CI_GROUP?.trim() || 'all';
const shardNames = resolveTestCiShardSelection(requestedGroup);
const coverageEnabled = resolveTestCiCoverageEnabled(process.env.TEST_CI_COVERAGE);

const commandForScript = (name, collectCoverage) => {
  const coverageArgs = collectCoverage ? ['--', '--coverage'] : [];
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', 'run', name, ...coverageArgs],
    };
  }

  return {
    command: 'npm',
    args: ['run', name, ...coverageArgs],
  };
};

const killProcessTree = (pid) => new Promise((resolve) => {
  if (!pid) {
    resolve();
    return;
  }

  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process may already have exited.
    }
    resolve();
    return;
  }

  const killer = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'taskkill', '/pid', String(pid), '/t', '/f'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  killer.on('error', resolve);
  killer.on('exit', resolve);
});

const concurrency = resolveTestCiConcurrency({ raw: process.env.TEST_CI_CONCURRENCY });
const shardTimeoutMs = resolveTestCiShardTimeoutMs(process.env.TEST_CI_SHARD_TIMEOUT_MS);
const shardRetries = resolveTestCiShardRetries(process.env.TEST_CI_SHARD_RETRIES);
const pending = [...shardNames];
const failures = [];
const results = [];
let running = 0;
let runningExclusive = false;

const log = (message) => {
  process.stdout.write(`${message}\n`);
};

const runShard = (name) => new Promise((resolve) => {
  const startedAt = Date.now();
  let outputTail = '';
  const captureOutput = (chunk, target) => {
    target.write(chunk);
    outputTail = `${outputTail}${chunk.toString('utf8')}`.slice(-64 * 1024);
  };
  log(`\n[${name}] starting`);
  const collectCoverage = shouldCollectTestCiCoverage(name, coverageEnabled);
  const { command, args } = commandForScript(name, collectCoverage);
  let child;
  try {
    child = spawn(command, args, {
      env: {
        ...process.env,
        ...(collectCoverage ? {
          VIZLY_COVERAGE_REPORTS_DIR: `coverage/shards/${getTestCiCoverageReportName(name)}`,
        } : {}),
      },
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    results.push({ name, durationMs });
    failures.push({ name, error });
    log(`[${name}] failed in ${Math.round(durationMs / 100) / 10}s (${error.message})`);
    resolve();
    return;
  }

  child.stdout?.on('data', (chunk) => captureOutput(chunk, process.stdout));
  child.stderr?.on('data', (chunk) => captureOutput(chunk, process.stderr));

  let settled = false;
  let timedOut = false;
  const finish = ({ code, signal, error }) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);

    const durationMs = Date.now() - startedAt;
    const seconds = Math.round(durationMs / 100) / 10;
    results.push({ name, durationMs });
    if (error) {
      failures.push({ name, error });
      log(`[${name}] failed in ${seconds}s (${error.message})`);
    } else if (timedOut) {
      failures.push({ name, timedOut: true });
      log(`[${name}] timed out in ${seconds}s`);
    } else if (code === 0) {
      log(`[${name}] passed in ${seconds}s`);
    } else {
      const retryable = isRetryableTestCiInfrastructureFailure(outputTail);
      failures.push({ name, code, signal, retryable });
      log(`[${name}] failed in ${seconds}s${signal ? ` (${signal})` : ''}${retryable ? ' (retryable worker startup timeout)' : ''}`);
    }
    resolve();
  };

  const timeout = setTimeout(async () => {
    timedOut = true;
    log(`[${name}] exceeded ${shardTimeoutMs}ms timeout; terminating process tree`);
    await killProcessTree(child.pid);
    finish({ code: null, signal: 'TIMEOUT' });
  }, shardTimeoutMs);

  child.on('error', (error) => {
    finish({ error });
  });

  child.on('exit', (code, signal) => {
    finish({ code, signal });
  });
});

const schedule = async () => {
  while (pending.length > 0) {
    const nextName = pending[0];
    const nextIsExclusive = isTestCiTimingSensitiveShard(nextName);
    if (running >= concurrency || runningExclusive || (nextIsExclusive && running > 0)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    const name = pending.shift();
    running += 1;
    if (nextIsExclusive) runningExclusive = true;
    runShard(name).finally(() => {
      running -= 1;
      if (nextIsExclusive) runningExclusive = false;
    });
  }

  while (running > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

log(`Running test:ci group ${requestedGroup} (${shardNames.length} shards) with concurrency ${concurrency}, shard timeout ${shardTimeoutMs}ms, infrastructure retries ${shardRetries}, coverage ${coverageEnabled ? 'enabled' : 'disabled'}.`);
const suiteStartedAt = Date.now();
await schedule();

let retryAttempts = 0;
for (let retry = 1; retry <= shardRetries; retry += 1) {
  const retryNames = [...new Set(
    failures.filter(({ retryable }) => retryable).map(({ name }) => name),
  )];
  if (retryNames.length === 0) break;

  const retainedFailures = failures.filter(({ retryable }) => !retryable);
  failures.splice(0, failures.length, ...retainedFailures);
  pending.push(...retryNames);
  retryAttempts += retryNames.length;
  log(`\nRetrying ${retryNames.length} shard${retryNames.length === 1 ? '' : 's'} after Vitest worker startup timeout (${retry}/${shardRetries}).`);
  await schedule();
}

const suiteSeconds = Math.round((Date.now() - suiteStartedAt) / 100) / 10;
const slowestShards = rankSlowestTestCiShards(results, Math.min(5, results.length));
log(`\nCompleted ${shardNames.length} test:ci shards in ${suiteSeconds}s${retryAttempts > 0 ? ` with ${retryAttempts} infrastructure retry attempt${retryAttempts === 1 ? '' : 's'}` : ''}.`);
if (slowestShards.length > 0) {
  log('Slowest test:ci shards:');
  for (const { name, durationMs } of slowestShards) {
    log(`- ${name}: ${Math.round(durationMs / 100) / 10}s`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} test:ci shard${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) {
    const detail = failure.error?.message ?? failure.signal ?? `exit ${failure.code}`;
    if (failure.timedOut) {
      console.error(`- ${failure.name}: timed out after ${shardTimeoutMs}ms`);
      continue;
    }
    console.error(`- ${failure.name}: ${detail}`);
  }
  process.exit(1);
}

log(`\nAll ${shardNames.length} test:ci shards passed.`);
