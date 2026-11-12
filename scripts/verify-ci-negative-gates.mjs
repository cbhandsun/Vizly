import { spawnSync } from 'node:child_process';
import { assertGateProcessCompleted, verifyCiNegativeGates } from './lib/ciNegativeGateProbe.mjs';

if (process.argv.length !== 2) throw new Error('This probe accepts no command-line arguments');
const receipts = await verifyCiNegativeGates({
  root: process.cwd(),
  run: async args => {
    const started = performance.now();
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: process.cwd(), env: process.env, shell: process.platform === 'win32',
      encoding: 'utf8', maxBuffer: 2_000_000, timeout: 120_000,
    });
    assertGateProcessCompleted(result, args[1], performance.now() - started);
    return { exitCode: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  },
});
process.stdout.write(`${JSON.stringify({ accepted: true, fixtureRemoved: true, receipts })}\n`);
