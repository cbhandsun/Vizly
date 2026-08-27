// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingRenderAuthority,
  type DisplayRoutingRenderAuthority,
} from '../../../routing/displayRoutingRenderAuthority';
import { RoutingSessionEdgeRenderProvider } from '../RoutingSessionEdgeRenderProvider';
import {
  smartEdgeRenderAdapterAcceptsCommittedGeometry,
  useSmartEdgeRoutingRenderAdapter,
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

const Probe = () => {
  const adapter = useSmartEdgeRoutingRenderAdapter();
  return (
    <output data-testid="adapter">
      {adapter.kind}:{String(smartEdgeRenderAdapterAcceptsCommittedGeometry(
        adapter,
        'edge-a',
        computedPath,
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
