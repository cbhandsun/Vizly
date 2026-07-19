import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const shardCoverageDirectory = path.join(projectRoot, 'coverage', 'shards');

rmSync(shardCoverageDirectory, { recursive: true, force: true });
mkdirSync(shardCoverageDirectory, { recursive: true });

process.env.TEST_CI_COVERAGE = '1';
process.env.TEST_CI_GROUP = 'all';
process.env.TEST_CI_CONCURRENCY ||= '2';

await import('./run-test-ci.mjs');
await import('./merge-test-coverage.mjs');
