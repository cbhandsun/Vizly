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
    expect(grouped).toHaveLength(47);
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
    expect(shouldCollectTestCiCoverage('test:ci:routing-services-core', true)).toBe(true);
    expect(shouldCollectTestCiCoverage('test:ci:routing-services-performance', true)).toBe(false);
    expect(shouldCollectTestCiCoverage('test:ci:routing-services-core', false)).toBe(false);
    expect(isTestCiTimingSensitiveShard('test:ci:core-components-shared-flow-logistics')).toBe(true);
    expect(isTestCiTimingSensitiveShard('test:ci:routing-services-core')).toBe(false);
    expect(getTestCiCoverageReportName('test:ci:routing-services-core')).toBe('test-ci-routing-services-core');
  });

  it('isolates the resource-sensitive diagram interactions without slowing the full shard', () => {
    const fullShards = [
      packageJson.scripts['test:ci:core-components-extra-a'],
      packageJson.scripts['test:ci:core-components-extra-b'],
    ];
    const interactionShard = packageJson.scripts['test:ci:core-components-extra-interactions'];

    expect(fullShards[0]).toContain('--maxWorkers=2');
    expect(fullShards[0]).toContain('--shard=1/2');
    expect(fullShards[1]).toContain('--maxWorkers=2');
    expect(fullShards[1]).toContain('--shard=2/2');
    expect(interactionShard).toContain('--maxWorkers=1');
    for (const fileName of [
      'TopActionButtons.test.tsx',
      'CommentPanel.test.tsx',
      'AnnotationLayer.accessibility.test.tsx',
    ]) {
      for (const fullShard of fullShards) {
        expect(fullShard).toContain(`--exclude src/core/components/diagrams/__tests__/${fileName}`);
      }
      expect(interactionShard).toContain(`src/core/components/diagrams/__tests__/${fileName}`);
    }
  });

  it('isolates resource-sensitive auth and property panels without widening timeouts', () => {
    const primitiveShard = packageJson.scripts['test:ci:ui-components-primitives'];
    const authShard = packageJson.scripts['test:ci:ui-components-auth'];
    const fullShards = [
      packageJson.scripts['test:ci:core-components-extra-a'],
      packageJson.scripts['test:ci:core-components-extra-b'],
    ];
    const propertyShard = packageJson.scripts['test:ci:core-components-extra-properties'];

    expect(primitiveShard).not.toContain('src/components/auth/__tests__');
    expect(authShard).toContain('--maxWorkers=1');
    expect(authShard).toContain('src/components/auth/__tests__');
    expect(authShard).not.toContain('testTimeout');
    expect(propertyShard).toContain('--maxWorkers=1');
    expect(propertyShard).not.toContain('testTimeout');
    for (const fileName of [
      'PropertyPanel.test.tsx',
      'EdgeEditingCommercialAudit.test.tsx',
    ]) {
      for (const fullShard of fullShards) {
        expect(fullShard).toContain(`--exclude src/core/components/diagrams/__tests__/${fileName}`);
      }
      expect(propertyShard).toContain(`src/core/components/diagrams/__tests__/${fileName}`);
    }
  });
});
