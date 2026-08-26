import { describe, expect, it } from 'vitest';
import { createDisplayRoutingRenderAuthority } from '../../../routing/displayRoutingRenderAuthority';

import {
  createRoutingSessionEdgeRenderAdapter,
  STANDALONE_EDGE_RENDER_ADAPTER,
  smartEdgeRenderAdapterAcceptsCommittedGeometry,
} from '../smartEdgeRoutingRenderAdapter';

const authority = createDisplayRoutingRenderAuthority({
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  hardReportDigest: 'hard-report-v1:0123456789abcdef',
  authorizedEdgeIds: ['edge-a'],
});
if (!authority) throw new Error('expected valid routing render authority');
const routingAdapter = createRoutingSessionEdgeRenderAdapter(authority);

describe('smart edge routing render authority', () => {
  it('accepts only the current hard-gated Routing Session adapter', () => {
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      'edge-a',
    )).toBe(true);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      STANDALONE_EDGE_RENDER_ADAPTER,
      'edge-a',
    )).toBe(false);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(routingAdapter, 'edge-b')).toBe(false);
  });

  it.each([
    null,
    {},
    [],
    { ...routingAdapter, authority: { ...authority } },
    { ...routingAdapter, authority: null },
    { ...routingAdapter, acceptsCommittedGeometry: false },
  ])('fails closed for malformed, stale, or downgraded authority: %j', value => {
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(value, 'edge-a')).toBe(false);
  });
});
