// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type DisplayRoutingRenderAuthority,
} from '../../../routing/displayRoutingRenderAuthority';
import { createTestDisplayRoutingRenderAuthority } from '../../../routing/__tests__/displayRoutingRenderAuthorityTestFixture';
import { EDGE_ROUTING_WORKER_PROTOCOL_VERSION } from '../../../routing/routingVersion';
import { RoutingSessionEdgeRenderProvider } from '../RoutingSessionEdgeRenderProvider';
import {
  smartEdgeRenderAdapterAcceptsCommittedGeometry,
  useSmartEdgeRoutingRenderAdapter,
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

const Probe = () => {
  const adapter = useSmartEdgeRoutingRenderAdapter();
  return (
    <output
      data-testid="adapter"
      data-protocol-version={adapter.session?.protocolVersion}
      data-hard-clean={String(adapter.session?.hardReport.hardClean ?? false)}
    >
      {adapter.kind}:{String(smartEdgeRenderAdapterAcceptsCommittedGeometry(
        adapter,
        claim,
      ))}
    </output>
  );
};

describe('RoutingSessionEdgeRenderProvider', () => {
  it('shares a realm-issued Routing Session with custom edge consumers', () => {
    render(
      <RoutingSessionEdgeRenderProvider authority={authority}>
        <Probe />
      </RoutingSessionEdgeRenderProvider>,
    );

    expect(screen.getByTestId('adapter').textContent).toBe('routing-session:true');
    expect(screen.getByTestId('adapter').getAttribute('data-protocol-version')).toBe(
      String(EDGE_ROUTING_WORKER_PROTOCOL_VERSION),
    );
    expect(screen.getByTestId('adapter').getAttribute('data-hard-clean')).toBe('true');
  });

  it.each([
    null,
    { ...authority } as DisplayRoutingRenderAuthority,
  ])('fails closed when the Canvas session proof is absent or reconstructed', invalidAuthority => {
    render(
      <RoutingSessionEdgeRenderProvider authority={invalidAuthority}>
        <Probe />
      </RoutingSessionEdgeRenderProvider>,
    );

    expect(screen.getByTestId('adapter').textContent).toBe('standalone-fallback:false');
  });
});
