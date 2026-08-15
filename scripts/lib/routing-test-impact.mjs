export const ROUTING_TEST_IMPACT_SHARDS = Object.freeze([
  'test:ci:routing-core',
  'test:ci:routing-services-core',
  'test:ci:routing-quality',
  'test:ci:routing-services-performance',
  'test:ci:routing-layout-strategies',
  'test:ci:routing-layout-utils',
  'test:ci:core-components-c',
  'test:ci:dom-utils-misc',
  'test:ci:core-components-shared-flow',
  'test:ci:core-components-shared-flow-quality',
  'test:ci:core-components-shared-flow-logistics',
  'test:ci:core-components-shared-worker-boundary',
  'test:ci:data-main',
]);

const normalizePath = value => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return null;
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  return normalized.includes('\0') ? null : normalized;
};

export const resolveRoutingTestImpact = rawPaths => {
  const selected = new Set();
  for (const rawPath of Array.isArray(rawPaths) ? rawPaths.slice(0, 20_000) : []) {
    const path = normalizePath(rawPath);
    if (!path) continue;

    if (
      path.startsWith('src/core/routing/')
      || path.startsWith('src/core/factories/')
      || path.startsWith('src/core/plugins/')
    ) selected.add('test:ci:routing-core');

    if (path.startsWith('src/core/services/')) {
      selected.add('test:ci:routing-services-core');
    }
    if (path.startsWith('src/core/strategies/shared/')) {
      selected.add('test:ci:routing-quality');
      if (path.includes('edgeSharedEndpointPortOrder')) {
        selected.add('test:ci:routing-services-performance');
      }
    } else if (path.startsWith('src/core/strategies/')) {
      selected.add('test:ci:routing-layout-strategies');
    }
    if (path.startsWith('src/core/utils/layout/')) {
      selected.add('test:ci:routing-layout-utils');
    }

    if (
      path.startsWith('src/core/components/custom-edges/')
      || path.startsWith('src/core/rendering/')
    ) {
      selected.add('test:ci:core-components-c');
      selected.add('test:ci:dom-utils-misc');
    }
    if (path.startsWith('src/core/export/')) {
      selected.add('test:ci:dom-utils-misc');
    }

    if (
      path.startsWith('src/core/components/shared/baseReactFlow')
      || path.startsWith('src/core/components/shared/BaseReactFlow')
      || path.startsWith('src/core/components/shared/useBaseReactFlow')
    ) {
      selected.add('test:ci:core-components-shared-flow');
      selected.add('test:ci:core-components-shared-flow-quality');
      selected.add('test:ci:core-components-shared-flow-logistics');
      if (/Worker|Cache|Precompiled|GeometryBarrier|CommercialQuality/i.test(path)) {
        selected.add('test:ci:core-components-shared-worker-boundary');
      }
    }
    if (
      path.startsWith('scripts/lib/display-routing-')
      || path.startsWith('scripts/lib/precompiled-display-route-')
      || path === 'scripts/verify-display-routing-browser.mjs'
      || path === 'scripts/generate-precompiled-display-routes.mjs'
    ) selected.add('test:ci:core-components-shared-worker-boundary');

    if (path.startsWith('src/data/standardized/')) {
      selected.add('test:ci:data-main');
      selected.add('test:ci:core-components-shared-flow-logistics');
    }
  }
  return ROUTING_TEST_IMPACT_SHARDS.filter(shard => selected.has(shard));
};
