import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

// This gate owns only fresh, labelled containers. It never targets a cloud project.
if (process.platform !== 'linux' || process.version !== 'v22.23.4') {
  throw Error('Telemetry integration requires the pinned Linux Node 22.23.4 runner');
}
const root = resolve(import.meta.dirname, '..');
const directory = await mkdtemp(join(tmpdir(), 'vizly-telemetry-https-'));
try {
  for (const [entry, name] of [['scripts/fixtures/telemetry-journal/https-client.mjs', 'client.mjs'],
    ['scripts/query-telemetry.mjs', 'query.mjs']]) {
    await build({ entryPoints: [join(root, entry)], outfile: join(directory, name), bundle: true,
      platform: 'node', format: 'esm', external: ['bufferutil', 'utf-8-validate'],
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
  }
  const child = spawn('python3', [join(root, 'scripts/fixtures/telemetry-journal/https-fixture.py'),
    directory, process.execPath, join(root, 'supabase/migrations/20261027211956_bounded_telemetry_journal.sql')],
  { stdio: ['ignore', 'inherit', 'inherit'] });
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept); });
  process.exitCode = code === 0 ? 0 : 1;
} finally { await rm(directory, { recursive: true, force: true }); }
