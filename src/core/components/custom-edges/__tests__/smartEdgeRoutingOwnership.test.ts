import { describe, expect, it } from 'vitest';

import {
  ROUTING_SESSION_EDGE_RENDER_ADAPTER,
  STANDALONE_EDGE_RENDER_ADAPTER,
  smartEdgeRenderAdapterAcceptsCommittedGeometry,
} from '../smartEdgeRoutingRenderAdapter';

describe('smart edge routing render authority', () => {
  it('accepts only the current hard-gated Routing Session adapter', () => {
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      ROUTING_SESSION_EDGE_RENDER_ADAPTER,
    )).toBe(true);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      STANDALONE_EDGE_RENDER_ADAPTER,
    )).toBe(false);
  });

  it.each([
    null,
    {},
    [],
    { ...ROUTING_SESSION_EDGE_RENDER_ADAPTER, routingVersion: 'stale' },
    { ...ROUTING_SESSION_EDGE_RENDER_ADAPTER, qualityContract: 'none' },
    { ...ROUTING_SESSION_EDGE_RENDER_ADAPTER, acceptsCommittedGeometry: false },
  ])('fails closed for malformed, stale, or downgraded authority: %j', value => {
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(value)).toBe(false);
  });
});
