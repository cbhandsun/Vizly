import { spawn } from 'node:child_process';

import {
  resolveNpmAuditCommand,
  runNpmAuditWithSingleNetworkRetry,
} from './lib/npm-audit-retry.mjs';

const OUTPUT_TAIL_LIMIT = 64 * 1024;

const appendTail = (current, chunk) => (
  `${current}${chunk}`.slice(-OUTPUT_TAIL_LIMIT)
);

const runAudit = () => new Promise((resolve, reject) => {
  const { command, args } = resolveNpmAuditCommand({
    npmExecPath: process.env.npm_execpath,
    nodeExecPath: process.execPath,
  });
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdoutTail = '';
  let stderrTail = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutTail = appendTail(stdoutTail, text);
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrTail = appendTail(stderrTail, text);
    process.stderr.write(text);
  });
  child.once('error', reject);
  child.once('close', (exitCode, signal) => resolve({
    exitCode,
    signal,
    stdoutTail,
    stderrTail,
  }));
});

const result = await runNpmAuditWithSingleNetworkRetry(
  runAudit,
  () => process.stderr.write(
    'npm audit endpoint timed out without a security result; retrying once.\n',
  ),
);

if (result.signal) {
  process.stderr.write('npm audit process ended before producing a security result.\n');
}
process.exitCode = result.exitCode === 0 ? 0 : 1;
