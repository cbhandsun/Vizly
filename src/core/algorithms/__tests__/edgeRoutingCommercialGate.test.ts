import { describe, expect, it } from 'vitest';

import { aggregateEdgeRoutingCommercialGate } from '../edgeRoutingCommercialGate';

const warning = (blockingFor?: unknown, nonBlockingReason?: unknown) => ({
  severity: 'warning',
  blockingFor,
  nonBlockingReason,
});

describe('aggregateEdgeRoutingCommercialGate', () => {
  it('reports a fully clean result only when every quality layer is clean', () => {
    expect(aggregateEdgeRoutingCommercialGate({ hardClean: true, findings: [] })).toEqual({
      hardClean: true,
      perceptualClean: true,
      traceable: true,
      multiScaleClean: true,
      commercialClean: true,
      blockerCounts: { geometry: 0, perceptual: 0, interaction: 0, multiScale: 0 },
      unclassifiedWarningCount: 0,
    });
  });

  it.each([
    ['geometry', 'hardClean'],
    ['perceptual', 'perceptualClean'],
    ['interaction', 'traceable'],
    ['multiScale', 'multiScaleClean'],
  ] as const)('blocks %s independently', (layer, cleanField) => {
    const result = aggregateEdgeRoutingCommercialGate({
      hardClean: true,
      findings: [warning([layer])],
    });

    expect(result[cleanField]).toBe(false);
    expect(result.commercialClean).toBe(false);
    expect(result.blockerCounts[layer]).toBe(1);
  });

  it('allows only explicitly explained non-blocking warnings', () => {
    const explained = aggregateEdgeRoutingCommercialGate({
      hardClean: true,
      findings: [warning([], 'Topology-required outer corridor.')],
    });
    const unexplained = aggregateEdgeRoutingCommercialGate({
      hardClean: true,
      findings: [warning([]), warning(undefined), warning(['unknown'])],
    });

    expect(explained.commercialClean).toBe(true);
    expect(unexplained.perceptualClean).toBe(false);
    expect(unexplained.unclassifiedWarningCount).toBe(3);
  });

  it('fails closed for invalid hard-clean input and bounds excessive findings', () => {
    const result = aggregateEdgeRoutingCommercialGate({
      hardClean: 'true',
      findings: Array.from({ length: 100_005 }, () => warning(['interaction'])),
    });

    expect(result.hardClean).toBe(false);
    expect(result.blockerCounts.interaction).toBe(100_000);
    expect(result.commercialClean).toBe(false);
  });
});
