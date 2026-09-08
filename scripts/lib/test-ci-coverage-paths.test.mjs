// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ciShardCoversTest, extractCiTestPaths } from './test-ci-coverage-paths.mjs';
import { TEST_CI_SHARDS } from './test-ci-shards.mjs';

const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('test CI repository paths', () => {
  it('normalizes quoted Windows filters and keeps exclusions separate', () => {
    const shard = extractCiTestPaths('vitest run --environment node "scripts\\lib" src/tests --exclude scripts/lib/private.test.mjs');
    expect(shard).toEqual({ paths: ['scripts/lib', 'src/tests'],
      excludes: ['scripts/lib/private.test.mjs'], invalidPaths: [] });
    expect(ciShardCoversTest(shard, 'scripts/lib/public.test.mjs')).toBe(true);
    expect(ciShardCoversTest(shard, 'scripts/lib/private.test.mjs')).toBe(false);
    expect(ciShardCoversTest(shard, 'scripts/library/other.test.mjs')).toBe(false);
  });

  it('applies exclusions per shard so another executing shard can cover the file', () => {
    const broad = extractCiTestPaths('vitest run scripts/lib --exclude=scripts/lib/*private*.test.mjs');
    const dedicated = extractCiTestPaths('vitest run scripts/lib/private.test.mjs');
    expect(ciShardCoversTest(broad, 'scripts/lib/private.test.mjs')).toBe(false);
    expect(ciShardCoversTest(dedicated, 'scripts/lib/private.test.mjs')).toBe(true);
  });

  it.each(['scripts/lib/../../outside.test.mjs', 'C:\\private\\case.test.mjs',
    '/private/case.test.mjs', 'scripts/lib/*.test.mjs', 'scripts/lib/./case.test.mjs'])('rejects unsafe or ambiguous filters: %s', filter => {
    const shard = extractCiTestPaths(`vitest run ${filter}`);
    expect(shard.paths).toEqual([]);
    expect(shard.invalidPaths).toHaveLength(1);
  });

  it('does not infer execution from arbitrary shell text or missing exclusions', () => {
    expect(extractCiTestPaths(null).paths).toEqual([]);
    expect(extractCiTestPaths('echo vitest run scripts/lib').invalidPaths).toHaveLength(1);
    expect(extractCiTestPaths('vitest run src && echo scripts/lib').invalidPaths).toHaveLength(1);
    expect(extractCiTestPaths('vitest run scripts/lib --exclude').invalidPaths).toHaveLength(1);
  });

  it('discovers missing mjs tests through the real gate and accepts them only after registration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vizly-ci-coverage-test-'));
    directories.push(directory);
    await mkdir(join(directory, 'scripts/lib'), { recursive: true });
    await writeFile(join(directory, 'scripts/lib/present.test.mjs'), '');
    await writeFile(join(directory, 'scripts/lib/missing.test.mjs'), '');
    const packageFile = join(directory, 'package.json');
    const scripts = Object.fromEntries(TEST_CI_SHARDS.map(name => [name,
      'vitest run scripts/lib/present.test.mjs']));
    await writeFile(packageFile, JSON.stringify({ scripts }));
    const check = () => execFileSync(process.execPath, [resolve('scripts/check-test-ci-coverage.mjs')],
      { cwd: directory, encoding: 'utf8', stdio: 'pipe', windowsHide: true });
    let failure;
    try { check(); } catch (error) { failure = error; }
    expect(failure?.status).toBe(1);
    expect(String(failure?.stderr)).toContain('scripts/lib/missing.test.mjs');
    scripts[TEST_CI_SHARDS[0]] += ' scripts/lib/missing.test.mjs';
    await writeFile(packageFile, JSON.stringify({ scripts }));
    expect(check()).toContain('All 2 test files');
    scripts[TEST_CI_SHARDS[0]] += ' scripts/lib/absent.test.mjs';
    await writeFile(packageFile, JSON.stringify({ scripts }));
    expect(check).toThrow();
  });
});
