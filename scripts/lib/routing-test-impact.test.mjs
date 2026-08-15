import { describe, expect, it } from 'vitest';

import { resolveRoutingTestImpact } from './routing-test-impact.mjs';

describe('routing test impact', () => {
  it('selects only the line-jump service shard for an isolated engine change', () => {
    expect(resolveRoutingTestImpact([
      'src/core/services/LineJumpEngine.ts',
    ])).toEqual(['test:ci:routing-services-core']);
  });

  it('selects shared quality and its exclusive performance case together', () => {
    expect(resolveRoutingTestImpact([
      'src\\core\\strategies\\shared\\edgeSharedEndpointPortOrderRepair.ts',
    ])).toEqual([
      'test:ci:routing-quality',
      'test:ci:routing-services-performance',
    ]);
  });

  it('keeps layout strategy and layout utility shards independent', () => {
    expect(resolveRoutingTestImpact([
      'src/core/strategies/DomainDagreLayoutStrategy.ts',
    ])).toEqual(['test:ci:routing-layout-strategies']);
    expect(resolveRoutingTestImpact([
      'src/core/utils/layout/domainLayout.ts',
    ])).toEqual(['test:ci:routing-layout-utils']);
  });

  it('routes shared display changes to flow quality and browser boundary coverage', () => {
    expect(resolveRoutingTestImpact([
      'src/core/components/shared/baseReactFlowDisplayWorkerClient.ts',
    ])).toEqual([
      'test:ci:core-components-shared-flow',
      'test:ci:core-components-shared-flow-quality',
      'test:ci:core-components-shared-flow-logistics',
      'test:ci:core-components-shared-worker-boundary',
    ]);
  });

  it('ignores unrelated, empty, malformed, and excessive path input safely', () => {
    expect(resolveRoutingTestImpact([
      '',
      null,
      'src/pages/SettingsPage.tsx',
      'x'.repeat(501),
    ])).toEqual([]);
    expect(resolveRoutingTestImpact(null)).toEqual([]);
  });
});
