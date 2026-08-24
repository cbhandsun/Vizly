export const TEST_CI_SHARD_GROUPS = Object.freeze({
  foundation: Object.freeze([
    'test:ci:node',
    'test:ci:dom-utils-security',
    'test:ci:dom-utils-storage',
    'test:ci:dom-utils-import',
    'test:ci:dom-utils-layout-node',
    'test:ci:dom-utils-layout-dom',
    'test:ci:dom-utils-misc',
    'test:ci:dom-utils-app-node',
    'test:ci:dom-utils-app-dom',
    'test:ci:dom-services',
    'test:ci:dom-workers',
    'test:ci:context',
  ]),
  ui: Object.freeze([
    'test:ci:ui-app-node',
    'test:ci:ui-app-dom',
    'test:ci:ui-components-diagram',
    'test:ci:ui-components-support',
    'test:ci:ui-components-primitives',
    'test:ci:ui-components-auth',
    'test:ci:ui-components-warehouse',
    'test:ci:ui-diagrams',
  ]),
  flow: Object.freeze([
    'test:ci:core-components-shared-bounded-seed-policy',
    'test:ci:core-components-shared-cold-performance',
    'test:ci:core-components-shared-browser-contracts',
    'test:ci:core-components-shared-flow',
    'test:ci:core-components-shared-flow-quality',
    'test:ci:core-components-shared-flow-logistics',
    'test:ci:core-components-shared-flow-hub-port-role',
    'test:ci:core-components-shared-flow-measured-outcome',
    'test:ci:core-components-shared-flow-routing-quality',
    'test:ci:core-components-shared-worker-boundary',
  ]),
  core: Object.freeze([
    'test:ci:core-components-shared-misc',
    'test:ci:core-components-ui',
    'test:ci:core-hooks-node',
    'test:ci:core-hooks-dom',
    'test:ci:core-components-b-node',
    'test:ci:core-components-b-dom',
    'test:ci:core-components-c',
    'test:ci:core-components-extra-a',
    'test:ci:core-components-extra-b',
    'test:ci:core-components-extra-interactions',
    'test:ci:core-components-extra-properties',
    'test:ci:data-main',
    'test:ci:mindmap',
  ]),
  routing: Object.freeze([
    'test:ci:routing-core',
    'test:ci:routing-services-core',
    'test:ci:routing-quality',
    'test:ci:routing-services-performance',
    'test:ci:routing-layout-strategies',
    'test:ci:routing-layout-utils',
  ]),
});

export const TEST_CI_SHARDS = Object.freeze(Object.values(TEST_CI_SHARD_GROUPS).flat());
export const TEST_CI_GROUP_NAMES = Object.freeze(Object.keys(TEST_CI_SHARD_GROUPS));
export const TEST_CI_SLOW_SHARDS = Object.freeze([
  'test:ci:core-components-shared-flow-quality',
  'test:ci:core-components-shared-flow-logistics',
  'test:ci:routing-services-performance',
]);
export const TEST_CI_COVERAGE_EXEMPT_SHARDS = TEST_CI_SLOW_SHARDS;

const uniqueShardCount = new Set(TEST_CI_SHARDS).size;
if (uniqueShardCount !== TEST_CI_SHARDS.length) {
  throw new Error('test:ci shard groups contain duplicate scripts');
}

export const resolveTestCiShardSelection = (rawGroup) => {
  const group = typeof rawGroup === 'string' && rawGroup.trim() ? rawGroup.trim() : 'all';
  if (group === 'all') return [...TEST_CI_SHARDS];
  if (group === 'fast') {
    return TEST_CI_SHARDS.filter(shard => !TEST_CI_SLOW_SHARDS.includes(shard));
  }
  if (group === 'slow') return [...TEST_CI_SLOW_SHARDS];
  const shards = TEST_CI_SHARD_GROUPS[group];
  if (!shards) {
    throw new Error(
      `Unknown TEST_CI_GROUP "${group}"; expected all, fast, slow, or ${TEST_CI_GROUP_NAMES.join(', ')}`,
    );
  }
  return [...shards];
};

export const isTestCiTimingSensitiveShard = (shardName) => (
  TEST_CI_SLOW_SHARDS.includes(shardName)
);

export const shouldCollectTestCiCoverage = (shardName, coverageEnabled) => (
  Boolean(coverageEnabled) && !isTestCiTimingSensitiveShard(shardName)
);

export const getTestCiCoverageReportName = (shardName) => (
  shardName.replace(/[^A-Za-z0-9_.-]/g, '-')
);
