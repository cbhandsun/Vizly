import { spawn } from 'node:child_process';

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
  'test:ci:ui',
  'test:ci:core-components-a',
  'test:ci:core-components-b',
  'test:ci:core-components-c',
  'test:ci:mindmap',
  'test:ci:routing-core',
  'test:ci:routing-services',
  'test:ci:routing-layout',
];

const parseConcurrency = () => {
  const raw = process.env.TEST_CI_CONCURRENCY;
  if (!raw) return 3;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid TEST_CI_CONCURRENCY value: ${raw}`);
  }
  return value;
};

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

const concurrency = parseConcurrency();
const pending = [...shardNames];
const failures = [];
let running = 0;
let completed = 0;

const log = (message) => {
  process.stdout.write(`${message}\n`);
};

const runShard = (name) => new Promise((resolve) => {
  const startedAt = Date.now();
  log(`\n[${name}] starting`);
  const { command, args } = commandForScript(name);
  let child;
  try {
    child = spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
  } catch (error) {
    failures.push({ name, error });
    resolve();
    return;
  }

  child.on('error', (error) => {
    failures.push({ name, error });
    resolve();
  });

  child.on('exit', (code, signal) => {
    const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
    if (code === 0) {
      log(`[${name}] passed in ${seconds}s`);
    } else {
      failures.push({ name, code, signal });
      log(`[${name}] failed in ${seconds}s${signal ? ` (${signal})` : ''}`);
    }
    resolve();
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
      completed += 1;
    });
  }

  while (running > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

log(`Running ${shardNames.length} test:ci shards with concurrency ${concurrency}.`);
await schedule();

if (failures.length > 0) {
  console.error(`\n${failures.length} test:ci shard${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) {
    const detail = failure.error?.message ?? failure.signal ?? `exit ${failure.code}`;
    console.error(`- ${failure.name}: ${detail}`);
  }
  process.exit(1);
}

log(`\nAll ${completed} test:ci shards passed.`);
