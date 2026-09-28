import { spawn } from 'node:child_process';

const gates = ['typecheck', 'lint', 'test', 'build'];
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const runGate = (name) => new Promise((resolve) => {
  const startedAt = Date.now();
  const child = spawn(npmBin, ['run', name], {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on('error', (error) => {
    resolve({ name, status: 'error', durationMs: Date.now() - startedAt, detail: error.message });
  });
  child.on('close', (code, signal) => {
    resolve({
      name,
      status: code === 0 ? 'passed' : 'failed',
      durationMs: Date.now() - startedAt,
      detail: signal ? `signal ${signal}` : `exit ${code}`,
    });
  });
});

const results = await Promise.all(gates.map(runGate));
const failed = results.filter((result) => result.status !== 'passed');

for (const result of results) {
  console.log(`${result.name}: ${result.status} (${result.durationMs} ms, ${result.detail})`);
}

if (failed.length > 0) {
  console.error(`check failed: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}
