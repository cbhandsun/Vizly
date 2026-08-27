import { describe, expect, it } from 'vitest';
import {
  createDisplayRoutingRenderAuthority,
  readDisplayRoutingRenderSessionContract,
} from '../../../routing/displayRoutingRenderAuthority';

import {
  createRoutingSessionEdgeRenderAdapter,
  STANDALONE_EDGE_RENDER_ADAPTER,
  smartEdgeRenderAdapterAcceptsCommittedGeometry,
} from '../smartEdgeRoutingRenderAdapter';

const computedPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

const authority = createDisplayRoutingRenderAuthority({
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  hardReportDigest: 'hard-report-v1:0123456789abcdef',
  authorizedEdges: [{ edgeId: 'edge-a', computedPath }],
});
if (!authority) throw new Error('expected valid routing render authority');
const routingAdapter = createRoutingSessionEdgeRenderAdapter(authority);

describe('smart edge routing render authority', () => {
  it('accepts only the current hard-gated Routing Session adapter', () => {
    expect(routingAdapter.kind).toBe('routing-session');
    expect(routingAdapter.session).toBe(readDisplayRoutingRenderSessionContract(authority));
    expect(STANDALONE_EDGE_RENDER_ADAPTER.session).toBeNull();
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      'edge-a',
      computedPath,
    )).toBe(true);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      STANDALONE_EDGE_RENDER_ADAPTER,
      'edge-a',
      computedPath,
    )).toBe(false);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      'edge-a',
      [...computedPath],
    )).toBe(false);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      'edge-b',
      computedPath,
    )).toBe(false);
  });

  it.each([
    null,
    {},
    [],
    { ...routingAdapter, authority: { ...authority } },
    { ...routingAdapter, session: routingAdapter.session && { ...routingAdapter.session } },
    { ...routingAdapter, authority: null },
    { ...routingAdapter, acceptsCommittedGeometry: false },
  ])('fails closed for malformed, stale, or downgraded authority: %j', value => {
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      value,
      'edge-a',
      computedPath,
    )).toBe(false);
  });
});
