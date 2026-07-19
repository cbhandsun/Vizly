import { describe, expect, it } from 'vitest';

import {
  TEST_CI_GROUP_NAMES,
  TEST_CI_COVERAGE_EXEMPT_SHARDS,
  TEST_CI_SHARDS,
  TEST_CI_SHARD_GROUPS,
  resolveTestCiShardSelection,
  getTestCiCoverageReportName,
  isTestCiTimingSensitiveShard,
  shouldCollectTestCiCoverage,
} from './test-ci-shards.mjs';

describe('test:ci shard catalog', () => {
  it('keeps every shard in exactly one non-empty CI group', () => {
    const grouped = Object.values(TEST_CI_SHARD_GROUPS).flat();
    expect(TEST_CI_GROUP_NAMES).toEqual(['foundation', 'ui', 'flow', 'core', 'routing']);
    expect(grouped).toHaveLength(35);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(TEST_CI_SHARDS).toEqual(grouped);
    expect(Object.values(TEST_CI_SHARD_GROUPS).every((shards) => shards.length > 0)).toBe(true);
  });

  it('selects all shards by default or one explicit group', () => {
    expect(resolveTestCiShardSelection()).toEqual(TEST_CI_SHARDS);
    expect(resolveTestCiShardSelection('')).toEqual(TEST_CI_SHARDS);
    expect(resolveTestCiShardSelection(' ui ')).toEqual(TEST_CI_SHARD_GROUPS.ui);
  });

  it('rejects unknown groups instead of silently skipping tests', () => {
    expect(() => resolveTestCiShardSelection('missing')).toThrow(/Unknown TEST_CI_GROUP/);
  });

  it('exempts only isolated timing-sensitive shards from instrumentation', () => {
    expect(TEST_CI_COVERAGE_EXEMPT_SHARDS).toEqual([
      'test:ci:core-components-shared-flow-logistics',
      'test:ci:routing-services-performance',
    ]);
    expect(shouldCollectTestCiCoverage('test:ci:routing-services', true)).toBe(true);
    expect(shouldCollectTestCiCoverage('test:ci:routing-services-performance', true)).toBe(false);
    expect(shouldCollectTestCiCoverage('test:ci:routing-services', false)).toBe(false);
    expect(isTestCiTimingSensitiveShard('test:ci:core-components-shared-flow-logistics')).toBe(true);
    expect(isTestCiTimingSensitiveShard('test:ci:routing-services')).toBe(false);
    expect(getTestCiCoverageReportName('test:ci:routing-services')).toBe('test-ci-routing-services');
  });
});
