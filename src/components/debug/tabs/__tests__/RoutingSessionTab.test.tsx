// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    stage: 'final-applied',
    signature: 'private-signature',
    requestId: 'private-request-id',
    nodeCount: 4,
    edgeCount: 3,
    routeMs: 81.25,
    totalRouteMs: 120.5,
    workerStartCount: 1,
    workerAbortCount: 0,
    cacheTrustLevel: 'runtime-committed',
    fallbackLevel: 'none',
    hardGateDiagnostics: {
      obstacleHits: 0,
      commercialClearanceViolations: 0,
      quality: {
        nonOrthogonalSegments: 0,
        strictCrossings: 0,
        reverseOverlap: 0,
        unrelatedOverlap: 0,
        unexplainedRelatedOverlap: 0,
        shortEndpointStubs: 0,
        tinyInteriorDoglegs: 0,
        hairpins: 0,
      },
    },
    phaseTrace: [{
      phase: 'hard-gate',
      durationMs: 20,
      exclusiveDurationMs: 8,
      candidateCount: 3,
      changedEdgeCount: 3,
      resolution: 'accepted',
    }],
  },
}));

vi.mock('@/core/components/shared/baseReactFlowDisplayRoutingDebug', () => ({
  readDisplayRoutingDebugState: () => mocks.state,
}));

import { RoutingSessionTab } from '../RoutingSessionTab';

describe('RoutingSessionTab', () => {
  it('shows current atomic-session metrics without exposing graph identifiers', () => {
    render(<RoutingSessionTab />);

    expect(screen.getByText('final-applied')).toBeTruthy();
    expect(screen.getByText('4 nodes / 3 edges')).toBeTruthy();
    expect(screen.getByText('81.3ms')).toBeTruthy();
    expect(screen.getByText('hard-gate')).toBeTruthy();
    expect(screen.getByText('routingSessionSnapshot')).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-signature');
    expect(document.body.textContent).not.toContain('private-request-id');
  });
});
