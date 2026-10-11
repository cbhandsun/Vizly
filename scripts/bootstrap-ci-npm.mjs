import { bootstrapIsolatedCiNpm } from './lib/isolatedCiNpm.mjs';

try {
  const result = await bootstrapIsolatedCiNpm({
    runnerTemp: process.env.RUNNER_TEMP,
    githubPath: process.env.GITHUB_PATH,
  });
  process.stdout.write(`Isolated CI npm ${result.version} verified\n`);
} catch {
  process.stderr.write('Isolated CI npm bootstrap failed; PATH was not activated\n');
  process.exitCode = 1;
}
