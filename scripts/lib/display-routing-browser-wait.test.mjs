import { describe, expect, it, vi } from 'vitest';

import { waitForDisplayRoutingBrowserValue } from './display-routing-browser-wait.mjs';
import {
  displayRoutingLayoutVisualSnapshotExpression,
  readDisplayRoutingLayoutVisualSnapshot,
  resolveDisplayRoutingLayoutVisualStability,
  waitForStableDisplayRoutingLayoutVisual,
} from './display-routing-layout-visual-settle.mjs';

describe('display routing browser wait', () => {
  it('returns the first ready browser value', async () => {
    const ready = { stage: 'final-applied' };
    const session = { evaluate: vi.fn().mockResolvedValue(ready) };

    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', 1_000))
      .resolves.toBe(ready);
    expect(session.evaluate).toHaveBeenCalledWith('ready');
  });

  it('reports bounded routing diagnostics after timeout', async () => {
    const diagnostics = { routing: { stage: 'routing' }, requestCount: 1 };
    const session = { evaluate: vi.fn().mockResolvedValue(diagnostics) };

    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', 0))
      .rejects.toThrow(/"requestCount": 1/);
    expect(session.evaluate).toHaveBeenCalledOnce();
  });
});

const visualSample = (sampledAt, overrides = {}) => ({
  sampledAt,
  ready: true,
  requestId: 'layout:one',
  nodeCount: 2,
  edgeCount: 1,
  renderedNodeCount: 2,
  renderedEdgeCount: 1,
  renderedPathCount: 1,
  viewport: { x: 10, y: 20, zoom: 1 },
  nodeGeometryFingerprint: 'node-a',
  pathFingerprint: 'path-a',
  ...overrides,
});

describe('display routing layout visual settle', () => {
  it('reports the start and confirmation of the final continuous quiet window', () => {
    expect(resolveDisplayRoutingLayoutVisualStability([
      visualSample(1_000),
      visualSample(1_100),
      visualSample(1_260),
    ], 250)).toEqual({
      stableSinceAt: 1_000,
      confirmedAt: 1_260,
      sampleCount: 3,
    });
  });

  it('restarts the quiet window after viewport, geometry, or readiness changes', () => {
    expect(resolveDisplayRoutingLayoutVisualStability([
      visualSample(1_000),
      visualSample(1_100, { viewport: { x: 11, y: 20, zoom: 1 } }),
      visualSample(1_200, { pathFingerprint: 'path-b' }),
      visualSample(1_300, { pathFingerprint: 'path-b' }),
      visualSample(1_560, { pathFingerprint: 'path-b' }),
    ], 250)).toEqual({
      stableSinceAt: 1_200,
      confirmedAt: 1_560,
      sampleCount: 3,
    });
    expect(resolveDisplayRoutingLayoutVisualStability([
      visualSample(1_000),
      visualSample(1_400, { ready: false, layoutBusy: true }),
    ], 250)).toBeNull();
  });

  it('reads aggregate browser evidence without returning diagram geometry or paths', () => {
    const node = {
      getAttribute: name => name === 'data-id' ? 'node-private' : null,
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 100, height: 50 }),
    };
    const path = { getAttribute: name => name === 'd' ? 'M 1 2 L 3 4' : null };
    const edge = {
      getAttribute: name => name === 'data-id' ? 'edge-private' : null,
      querySelector: selector => selector === '.shared-trunk-edge-interaction' ? path : null,
    };
    const layoutButton = {
      getAttribute: name => name === 'aria-label'
        ? 'Auto layout'
        : (name === 'aria-busy' ? 'false' : null),
    };
    vi.stubGlobal('window', {
      __vizlyBaseReactFlowDisplayRouting: {
        stage: 'final-applied',
        renderAuthorityStatus: 'accepted',
        requestId: 'layout:one',
      },
      reactFlowInstance: {
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
        getNodes: () => [{}],
        getEdges: () => [{}],
      },
    });
    vi.stubGlobal('document', {
      querySelector: () => null,
      querySelectorAll: selector => ({
        '.react-flow__node[data-id]': [node],
        '.react-flow__edge[data-id]': [edge],
        button: [layoutButton],
      }[selector] || []),
    });

    const snapshot = readDisplayRoutingLayoutVisualSnapshot({
      expectedRequestId: 'layout:one',
      expectedNodeCount: 1,
      expectedEdgeCount: 1,
    });

    expect(snapshot).toMatchObject({
      ready: true,
      renderedNodeCount: 1,
      renderedEdgeCount: 1,
      renderedPathCount: 1,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/node-private|edge-private|M 1 2/);
    vi.unstubAllGlobals();
  });

  it('waits for stable evidence and fails closed on invalid bounds', async () => {
    const samples = [visualSample(1_000), visualSample(1_100), visualSample(1_260)];
    const session = { evaluate: vi.fn().mockImplementation(async () => samples.shift()) };
    let hostNow = 0;

    await expect(waitForStableDisplayRoutingLayoutVisual({
      session,
      expectedRequestId: 'layout:one',
      expectedNodeCount: 2,
      expectedEdgeCount: 1,
      timeoutMs: 1_000,
      now: () => hostNow,
      wait: async duration => { hostNow += duration; },
    })).resolves.toMatchObject({ stableSinceAt: 1_000, confirmedAt: 1_260 });
    expect(session.evaluate).toHaveBeenCalledWith(
      displayRoutingLayoutVisualSnapshotExpression({
        expectedRequestId: 'layout:one',
        expectedNodeCount: 2,
        expectedEdgeCount: 1,
      }),
    );
    await expect(waitForStableDisplayRoutingLayoutVisual({
      session,
      expectedRequestId: '',
      expectedNodeCount: 2,
      expectedEdgeCount: 1,
    })).rejects.toThrow(/request id/);
  });
});
