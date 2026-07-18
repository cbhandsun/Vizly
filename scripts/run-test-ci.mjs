import { spawn } from 'node:child_process';

import {
  isRetryableTestCiInfrastructureFailure,
  rankSlowestTestCiShards,
  resolveTestCiConcurrency,
  resolveTestCiShardRetries,
  resolveTestCiShardTimeoutMs,
} from './lib/test-ci-runner-policy.mjs';

const shardNames = [
  'test:ci:node',
  'test:ci:dom-utils-security',
  'test:ci:dom-utils-storage',
  'test:ci:dom-utils-import',
  'test:ci:dom-utils-layout',
  'test:ci:dom-utils-misc',
  'test:ci:dom-utils-app',
  'test:ci:dom-services',
  'test:ci:dom-workers',
  'test:ci:context',
  'test:ci:ui-app',
  'test:ci:ui-components-diagram',
  'test:ci:ui-components-support',
  'test:ci:ui-components-primitives',
  'test:ci:ui-components-warehouse',
  'test:ci:ui-diagrams',
  'test:ci:core-components-shared-flow',
  'test:ci:core-components-shared-flow-logistics',
  'test:ci:core-components-shared-flow-hub-port-role',
  'test:ci:core-components-shared-flow-measured-outcome',
  'test:ci:core-components-shared-flow-routing-quality',
  'test:ci:core-components-shared-worker-boundary',
  'test:ci:core-components-shared-misc',
  'test:ci:core-components-ui',
  'test:ci:core-hooks',
  'test:ci:core-components-b',
  'test:ci:core-components-c',
  'test:ci:core-components-extra',
  'test:ci:data-main',
  'test:ci:mindmap',
  'test:ci:routing-core',
  'test:ci:routing-services',
  'test:ci:routing-layout',
];

const commandForScript = (name) => {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', 'run', name],
    };
  }

  return {
    command: 'npm',
    args: ['run', name],
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
  const { command, args } = commandForScript(name);
  let child;
  try {
    child = spawn(command, args, {
      env: process.env,
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
    if (running >= concurrency) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    const name = pending.shift();
    running += 1;
    runShard(name).finally(() => {
      running -= 1;
    });
  }

  while (running > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

log(`Running ${shardNames.length} test:ci shards with concurrency ${concurrency}, shard timeout ${shardTimeoutMs}ms, infrastructure retries ${shardRetries}.`);
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
