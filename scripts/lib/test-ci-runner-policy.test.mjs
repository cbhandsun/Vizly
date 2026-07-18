import { describe, expect, it } from 'vitest';

import {
  rankSlowestTestCiShards,
  resolveTestCiConcurrency,
  resolveTestCiShardTimeoutMs,
} from './test-ci-runner-policy.mjs';

describe('test:ci runner policy', () => {
  it('uses one shard on Windows and two elsewhere by default', () => {
    expect(resolveTestCiConcurrency({ platform: 'win32' })).toBe(1);
    expect(resolveTestCiConcurrency({ platform: 'linux' })).toBe(2);
  });

  it('honors valid explicit concurrency and timeout values', () => {
    expect(resolveTestCiConcurrency({ raw: '3', platform: 'win32' })).toBe(3);
    expect(resolveTestCiShardTimeoutMs('120000')).toBe(120_000);
    expect(resolveTestCiShardTimeoutMs()).toBe(900_000);
  });

  it('rejects empty, negative, fractional, and non-numeric overrides', () => {
    for (const raw of ['0', '-1', '1.5', 'NaN']) {
      expect(() => resolveTestCiConcurrency({ raw })).toThrow(/Invalid TEST_CI_CONCURRENCY/);
      expect(() => resolveTestCiShardTimeoutMs(raw)).toThrow(/Invalid TEST_CI_SHARD_TIMEOUT_MS/);
    }
  });

  it('ranks valid shard timings deterministically and applies the report limit', () => {
    expect(rankSlowestTestCiShards([
      { name: 'fast', durationMs: 10 },
      { name: 'slow-b', durationMs: 30 },
      { name: 'slow-a', durationMs: 30 },
      { name: 'invalid', durationMs: Number.NaN },
    ], 2)).toEqual([
      { name: 'slow-a', durationMs: 30 },
      { name: 'slow-b', durationMs: 30 },
    ]);
  });
});
