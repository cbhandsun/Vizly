import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  TEST_CI_GROUP_NAMES,
  TEST_CI_COVERAGE_EXEMPT_SHARDS,
  TEST_CI_SHARDS,
  TEST_CI_SHARD_GROUPS,
  TEST_CI_SLOW_SHARDS,
  resolveTestCiShardSelection,
  getTestCiCoverageReportName,
  isTestCiTimingSensitiveShard,
  shouldCollectTestCiCoverage,
} from './test-ci-shards.mjs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

describe('test:ci shard catalog', () => {
  it('keeps every shard in exactly one non-empty CI group', () => {
    const grouped = Object.values(TEST_CI_SHARD_GROUPS).flat();
    expect(TEST_CI_GROUP_NAMES).toEqual(['foundation', 'ui', 'flow', 'core', 'routing']);
    expect(grouped).toHaveLength(41);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(TEST_CI_SHARDS).toEqual(grouped);
    expect(Object.values(TEST_CI_SHARD_GROUPS).every((shards) => shards.length > 0)).toBe(true);
  });

  it('selects all shards by default or one explicit group', () => {
    expect(resolveTestCiShardSelection()).toEqual(TEST_CI_SHARDS);
    expect(resolveTestCiShardSelection('')).toEqual(TEST_CI_SHARDS);
    expect(resolveTestCiShardSelection(' ui ')).toEqual(TEST_CI_SHARD_GROUPS.ui);
    expect(resolveTestCiShardSelection('slow')).toEqual(TEST_CI_SLOW_SHARDS);
    expect(resolveTestCiShardSelection('fast')).toEqual(
      TEST_CI_SHARDS.filter(shard => !TEST_CI_SLOW_SHARDS.includes(shard)),
    );
  });

  it('rejects unknown groups instead of silently skipping tests', () => {
    expect(() => resolveTestCiShardSelection('missing')).toThrow(/Unknown TEST_CI_GROUP/);
  });

  it('exempts only isolated timing-sensitive shards from instrumentation', () => {
    expect(TEST_CI_COVERAGE_EXEMPT_SHARDS).toEqual([
      'test:ci:core-components-shared-flow-quality',
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

  it('isolates the resource-sensitive diagram interactions without slowing the full shard', () => {
    const fullShard = packageJson.scripts['test:ci:core-components-extra'];
    const interactionShard = packageJson.scripts['test:ci:core-components-extra-interactions'];

    expect(fullShard).toContain('--maxWorkers=2');
    expect(interactionShard).toContain('--maxWorkers=1');
    for (const fileName of [
      'TopActionButtons.test.tsx',
      'CommentPanel.test.tsx',
      'AnnotationLayer.accessibility.test.tsx',
    ]) {
      expect(fullShard).toContain(`--exclude src/core/components/diagrams/__tests__/${fileName}`);
      expect(interactionShard).toContain(`src/core/components/diagrams/__tests__/${fileName}`);
    }
  });
});
