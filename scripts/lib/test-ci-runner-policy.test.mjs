import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import viteConfig from '../../vite.config.ts';

import {
  isRetryableTestCiInfrastructureFailure,
  rankSlowestTestCiShards,
  resolveTestCiConcurrency,
  resolveTestCiCoverageEnabled,
  resolveTestCiShardRetries,
  resolveTestCiShardTimeoutMs,
} from './test-ci-runner-policy.mjs';

describe('test:ci runner policy', () => {
  it('excludes repository mirrors from every Vitest shard', () => {
    expect(viteConfig.test?.exclude).toContain('.codex-audit/**');
    expect(viteConfig.test?.exclude).toEqual(expect.arrayContaining([
      '**/node_modules/**',
      '**/.git/**',
    ]));
  });

  it('requires DOM-backed hook tests in the Node shard to declare jsdom', () => {
    const hookTestsDirectory = resolve(
      process.cwd(),
      'src/core/components/diagrams/hooks/__tests__',
    );
    const missingEnvironmentDeclaration = readdirSync(hookTestsDirectory)
      .filter(fileName => /\.test\.[cm]?[jt]sx?$/.test(fileName))
      .filter((fileName) => {
        const source = readFileSync(resolve(hookTestsDirectory, fileName), 'utf8');
        return source.includes('@testing-library/react')
          && !source.slice(0, 256).includes('@vitest-environment jsdom');
      });

    expect(missingEnvironmentDeclaration).toEqual([]);
  });

  it('uses one shard on Windows and two elsewhere by default', () => {
    expect(resolveTestCiConcurrency({ platform: 'win32' })).toBe(1);
    expect(resolveTestCiConcurrency({ platform: 'linux' })).toBe(2);
  });

  it('honors valid explicit concurrency and timeout values', () => {
    expect(resolveTestCiConcurrency({ raw: '3', platform: 'win32' })).toBe(3);
    expect(resolveTestCiShardTimeoutMs('120000')).toBe(120_000);
    expect(resolveTestCiShardTimeoutMs()).toBe(900_000);
    expect(resolveTestCiShardRetries()).toBe(1);
    expect(resolveTestCiShardRetries('0')).toBe(0);
    expect(resolveTestCiShardRetries('2')).toBe(2);
    expect(resolveTestCiCoverageEnabled()).toBe(false);
    expect(resolveTestCiCoverageEnabled('0')).toBe(false);
    expect(resolveTestCiCoverageEnabled('1')).toBe(true);
  });

  it('rejects empty, negative, fractional, and non-numeric overrides', () => {
    for (const raw of ['0', '-1', '1.5', 'NaN']) {
      expect(() => resolveTestCiConcurrency({ raw })).toThrow(/Invalid TEST_CI_CONCURRENCY/);
      expect(() => resolveTestCiShardTimeoutMs(raw)).toThrow(/Invalid TEST_CI_SHARD_TIMEOUT_MS/);
    }
    for (const raw of ['-1', '1.5', 'NaN']) {
      expect(() => resolveTestCiShardRetries(raw)).toThrow(/Invalid TEST_CI_SHARD_RETRIES/);
    }
    expect(() => resolveTestCiCoverageEnabled('true')).toThrow(/Invalid TEST_CI_COVERAGE/);
  });

  it('ranks valid shard timings deterministically and applies the report limit', () => {
    expect(rankSlowestTestCiShards([
      { name: 'fast', durationMs: 10 },
      { name: 'slow-b', durationMs: 30 },
      { name: 'slow-a', durationMs: 30 },
      { name: 'fast', durationMs: 25 },
      { name: 'invalid', durationMs: Number.NaN },
    ], 2)).toEqual([
      { name: 'fast', durationMs: 35 },
      { name: 'slow-a', durationMs: 30 },
    ]);
  });

  it('retries only Vitest worker startup timeouts', () => {
    expect(isRetryableTestCiInfrastructureFailure(
      '[vitest-pool]: Failed to start threads worker. Timeout waiting for worker to respond',
    )).toBe(true);
    expect(isRetryableTestCiInfrastructureFailure(
      'AssertionError: expected 1 to be 2',
    )).toBe(false);
  });
});
