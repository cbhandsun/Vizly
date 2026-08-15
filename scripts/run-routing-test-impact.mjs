import { spawnSync } from 'node:child_process';

import { resolveRoutingTestImpact } from './lib/routing-test-impact.mjs';

const readGitLines = args => {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || '').slice(0, 2_000)}`);
  }
  return String(result.stdout || '').split(/\r?\n/).filter(Boolean);
};

const changedPaths = [
  ...readGitLines(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
  ...readGitLines(['ls-files', '--others', '--exclude-standard']),
];
const shards = resolveRoutingTestImpact([...new Set(changedPaths)]);
if (shards.length === 0) {
  process.stdout.write('No routing-scoped changes require a routing test shard.\n');
  process.exit(0);
}

process.stdout.write(`Routing impact selected ${shards.length} shard(s): ${shards.join(', ')}\n`);
if (process.argv.includes('--list')) process.exit(0);
for (const shard of shards) {
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', 'run', shard]
    : ['run', shard];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
