import { describe, expect, it } from 'vitest';
import { readDisplayRoutingRenderSessionContract } from '../../../routing/displayRoutingRenderAuthority';
import { createTestDisplayRoutingRenderAuthority } from '../../../routing/__tests__/displayRoutingRenderAuthorityTestFixture';
import { EDGE_ROUTING_WORKER_PROTOCOL_VERSION } from '../../../routing/routingVersion';

import {
  createRoutingSessionEdgeRenderAdapter,
  STANDALONE_EDGE_RENDER_ADAPTER,
  smartEdgeRenderAdapterAcceptsCommittedGeometry,
} from '../smartEdgeRoutingRenderAdapter';

const computedPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const claim = {
  edgeId: 'edge-a',
  source: 'source',
  target: 'target',
  sourceHandle: null,
  targetHandle: null,
  rendererType: 'stablePath',
  computedPath,
};

const authority = createTestDisplayRoutingRenderAuthority({
  authorizedEdges: [{ edgeId: 'edge-a', computedPath }],
});
if (!authority) throw new Error('expected valid routing render authority');
const routingAdapter = createRoutingSessionEdgeRenderAdapter(authority);

describe('smart edge routing render authority', () => {
  it('accepts only the current hard-gated Routing Session adapter', () => {
    expect(routingAdapter.kind).toBe('routing-session');
    expect(routingAdapter.session).toBe(readDisplayRoutingRenderSessionContract(authority));
    expect(routingAdapter.session?.protocolVersion).toBe(EDGE_ROUTING_WORKER_PROTOCOL_VERSION);
    expect(routingAdapter.session?.hardReport.hardClean).toBe(true);
    expect(STANDALONE_EDGE_RENDER_ADAPTER.session).toBeNull();
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      claim,
    )).toBe(true);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      STANDALONE_EDGE_RENDER_ADAPTER,
      claim,
    )).toBe(false);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      { ...claim, computedPath: [...computedPath] },
    )).toBe(false);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      { ...claim, edgeId: 'edge-b' },
    )).toBe(false);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      { ...claim, targetHandle: 'right' },
    )).toBe(false);
    expect(smartEdgeRenderAdapterAcceptsCommittedGeometry(
      routingAdapter,
      { ...claim, rendererType: 'advanced-smart-step' },
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
      claim,
    )).toBe(false);
  });
});
