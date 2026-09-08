import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Vitest fakes global timers, but not node:timers/promises. Route the polling
// delay through that same clock so renderer and evidence deadlines are tested.
vi.mock('node:timers/promises', async importOriginal => {
  const actual = await importOriginal();
  const setTimeoutMock = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  return { ...actual, setTimeout: setTimeoutMock,
    default: { ...actual.default, setTimeout: setTimeoutMock } };
});

import { waitForDisplayRoutingBrowserValue } from './display-routing-browser-wait.mjs';
import {
  displayRoutingLayoutVisualSnapshotExpression,
  readDisplayRoutingLayoutVisualSnapshot,
  resolveDisplayRoutingLayoutVisualStability,
  waitForStableDisplayRoutingLayoutVisual,
} from './display-routing-layout-visual-settle.mjs';

describe('display routing browser wait', () => {
  it.each([null, 7, '', 'x'.repeat(1_000_001)])('rejects invalid custom evidence expression', async value => {
    const session = { evaluate: vi.fn() };
    await expect(waitForDisplayRoutingBrowserValue(session, 'false', 100,
      { diagnosticsExpression: value })).rejects.toThrow('Invalid browser wait options');
    expect(session.evaluate).not.toHaveBeenCalled();
  });

  it('retains custom safe evidence when subsequent evaluation and evidence collection hang', async () => {
    vi.useFakeTimers();
    try {
      const session = { evaluate: vi.fn()
        .mockImplementationOnce(source => vm.runInNewContext(source, {}))
        .mockImplementation(() => new Promise(() => {})) };
      const pending = waitForDisplayRoutingBrowserValue(session, 'false', 200,
        { diagnosticsExpression: '({ visibility: { available: true, edges: [{ index: 0, rendered: false }] } })' })
        .catch(error => error);
      await vi.advanceTimersByTimeAsync(1_200);
      const failure = await pending;
      const diagnostics = JSON.parse(failure.message.split('\n').slice(1).join('\n'));
      expect(diagnostics).toMatchObject({ waitStatus: 'evaluation-timeout', evidenceStatus: 'evaluation-timeout',
        diagnostics: null, lastObservedDiagnostics: { visibility: { available: true, edges: [{ index: 0, rendered: false }] } } });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([null, '10', -1, NaN, Infinity, 600_001])('rejects invalid timeout %s', async value => {
    const session = { evaluate: vi.fn() };
    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', value)).rejects.toThrow(/Invalid/);
    expect(session.evaluate).not.toHaveBeenCalled();
  });

  it('bounds a stuck renderer and its evidence read, without leaking CDP failures', async () => {
    vi.useFakeTimers();
    try {
      const session = { evaluate: vi.fn(() => new Promise(() => {})) };
      const result = expect(waitForDisplayRoutingBrowserValue(session, 'ready', 50))
        .rejects.toThrow(/"evidenceStatus": "evaluation-timeout"/);
      await vi.advanceTimersByTimeAsync(1_050);
      await result;
      expect(vi.getTimerCount()).toBe(0);
      session.evaluate.mockRejectedValue(new Error('Bearer private-content'));
      const failure = await waitForDisplayRoutingBrowserValue(session, 'ready', 50).catch(error => error);
      expect(failure.message).toContain('evaluation-failed');
      expect(failure.message).not.toMatch(/Bearer|private-content/);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds and sanitizes malformed routing evidence and milestone values', async () => {
    let evidence;
    const session = { evaluate: async expression => {
      evidence = vm.runInNewContext(expression, {
        window: {
          __vizlyBaseReactFlowDisplayRouting: { stage: 'secret', workerStartCount: Infinity },
          __vizlyRoutingRequests: Array.from({ length: 100 }, () => ({ operation: 'secret' })),
          __vizlyRoutingResponses: 'secret',
          __vizlyBrowserBootMilestones: { workerRequestMs: 42, rootObservedMs: 'secret', pathObservedMs: Infinity },
        },
        document: { querySelector: () => null, querySelectorAll: () => [] },
      });
      return evidence;
    } };
    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', 0)).rejects.toThrow(/workerRequestMs/);
    expect(evidence.requests).toHaveLength(16);
    expect(evidence.responses).toHaveLength(0);
    expect(evidence.milestones).toMatchObject({ workerRequestMs: 42, rootObservedMs: null, pathObservedMs: null });
    expect(JSON.stringify(evidence)).not.toMatch(/secret|Infinity/);
  });

  it.each(['ready', 'Promise.resolve(ready)'])('returns the resolved ready browser value: %s', async expression => {
    const ready = { stage: 'final-applied' };
    const session = { evaluate: vi.fn(source => vm.runInNewContext(source, { ready })) };

    await expect(waitForDisplayRoutingBrowserValue(session, expression, 1_000))
      .resolves.toBe(ready);
    expect(session.evaluate).toHaveBeenCalledOnce();
  });

  it('awaits false async predicates and safely classifies rejected predicates', async () => {
    let calls = 0;
    const context = {
      next: () => Promise.resolve(++calls > 1 ? { ready: true } : null),
      window: {},
      document: { querySelector: () => null, querySelectorAll: () => [] },
    };
    const session = { evaluate: source => vm.runInNewContext(source, context) };
    await expect(waitForDisplayRoutingBrowserValue(session, 'next()', 1_000))
      .resolves.toEqual({ ready: true });
    expect(calls).toBe(2);
    const error = await waitForDisplayRoutingBrowserValue(session,
      'Promise.reject(new Error("private-content"))', 1_000).catch(value => value);
    expect(error.message).toContain('predicate-failed');
    expect(error.message).not.toContain('private-content');
  });

  it('retains the last host-side evidence when the renderer and final evidence read stop responding', async () => {
    vi.useFakeTimers();
    try {
      const session = { evaluate: vi.fn()
        .mockImplementationOnce(source => vm.runInNewContext(source, {
          window: { __vizlyBaseReactFlowDisplayRouting: { stage: 'worker-post' } },
          document: { querySelector: () => null, querySelectorAll: () => [] },
        }))
        .mockImplementation(() => new Promise(() => {})) };
      const pending = waitForDisplayRoutingBrowserValue(session, 'false', 200).catch(error => error);
      await vi.advanceTimersByTimeAsync(1_200);
      const failure = await pending;
      const diagnostic = JSON.parse(failure.message.split('\n').slice(1).join('\n'));
      expect(diagnostic).toMatchObject({ waitStatus: 'evaluation-timeout', evidenceStatus: 'evaluation-timeout',
        diagnostics: null, lastObservedDiagnostics: { routing: { stage: 'worker-post' } } });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('distinguishes quality rejection and predicate failure without logging thrown contents', async () => {
    const session = { evaluate: source => vm.runInNewContext(source, {
      window: { __vizlyBaseReactFlowDisplayRouting: { stage: 'final-quality-rejected' },
        __vizlyPrecompiledRoutePageErrors: ['secret private message'],
        __vizlyPrecompiledRouteResponse: { error: 'secret private response', edges: [] } },
      document: { body: { innerText: 'secret private page' }, querySelector: () => null, querySelectorAll: () => [] },
    }) };
    const quality = await waitForDisplayRoutingBrowserValue(session, 'false', 1_000,
      { stopOnQualityRejection: true }).catch(error => error);
    expect(quality.message).toContain('quality-rejected');
    expect(quality.message).toContain('routing-failed');
    const predicate = await waitForDisplayRoutingBrowserValue(session,
      '(() => { throw new Error("secret private exception"); })()', 1_000).catch(error => error);
    expect(predicate.message).toContain('predicate-failed');
    expect(quality.message + predicate.message).not.toMatch(/secret|private/);
  });

  it('reports bounded routing diagnostics after timeout', async () => {
    const diagnostics = { routing: { stage: 'routing' }, requestCount: 1 };
    const session = { evaluate: vi.fn().mockResolvedValue(diagnostics) };

    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', 0))
      .rejects.toThrow(/"requestCount": 1/);
    expect(session.evaluate).toHaveBeenCalledOnce();
  });

  it.each([
    ['complete', 'http:', { script: 2, resource: 1, rejection: 0 }, 1],
    ['loading', 'about:', undefined, undefined],
    ['complete', 'chrome-error:', undefined, 0],
    ['secret', 'secret', { script: Infinity, resource: -1, rejection: 'secret' }, NaN],
    ['interactive', 'https:', { script: 999_999, resource: 0, rejection: 0 }, 999_999],
  ])('reports safe page startup diagnostics for %s / %s', async (readyState, protocol, errors, children) => {
    let diagnostics;
    const session = { evaluate: async expression => {
      diagnostics = vm.runInNewContext(expression, {
        window: {
          location: { protocol, href: 'https://private/?token=secret#user-document' },
          __vizlyBrowserBootErrors: errors,
        },
        document: {
          readyState,
          body: { textContent: 'secret user-document' },
          querySelector: () => children === undefined ? null : { childElementCount: children },
          querySelectorAll: () => [],
        },
      });
      return diagnostics;
    } };
    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', 0)).rejects.toThrow(/"page"/);
    expect(diagnostics.page).toMatchObject({
      readyState: readyState === 'secret' ? 'unknown' : readyState,
      protocol: protocol === 'secret' ? 'other' : protocol,
      captureInstalled: !!errors,
      rootChildCount: Number.isSafeInteger(children) ? Math.min(100_000, children) : null,
      scriptErrors: errors?.script === 2 ? 2 : (errors?.script === 999_999 ? 100_000 : null),
    });
    expect(JSON.stringify(diagnostics)).not.toMatch(/secret|user-document|https:\/\//);
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
