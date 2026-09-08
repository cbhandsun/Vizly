import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { PRECOMPILED_DISPLAY_ROUTE_BROWSER_CAPTURE_SCRIPT } from './precompiled-display-route-browser-capture.mjs';
import { displayRoutingBrowserLifecycleExpression } from './display-routing-browser-lifecycle.mjs';

describe('cold browser capture safety', () => {
  it('captures bounded error codes, milestones and clone failures without exception or page content', () => {
    const listeners = new Map();
    class NativeWorker {
      listeners = new Map();
      addEventListener(type, callback) { this.listeners.set(type, callback); }
      postMessage() {}
    }
    let cloneFails = false;
    let now = 100;
    let frame;
    const window = { Worker: NativeWorker, addEventListener: (type, callback) => {
      listeners.set(type, [...(listeners.get(type) || []), callback]);
    } };
    const context = vm.createContext({ window, Date: { now: () => now },
      performance: { now: () => now },
      requestAnimationFrame: callback => { frame = callback; },
      document: { querySelector: selector => selector === '#root' ? { childElementCount: 1 }
        : { getAttribute: () => 'M private path' }, querySelectorAll: () => [],
        body: { innerText: 'private body' } },
      structuredClone: value => { if (cloneFails) throw new Error('private clone exception'); return structuredClone(value); },
    });
    vm.runInContext(PRECOMPILED_DISPLAY_ROUTE_BROWSER_CAPTURE_SCRIPT, context);
    const worker = new window.Worker();
    now = 110;
    frame();
    for (let i = 0; i < 20; i += 1) {
      for (const callback of listeners.get('error')) callback({ target: window, message: 'private token' });
      for (const callback of listeners.get('unhandledrejection')) callback({ reason: 'private content' });
      worker.listeners.get('error')({ message: 'private Worker URL' });
      worker.listeners.get('messageerror')({ data: 'private message' });
    }
    worker.postMessage({ operation: 'route', requestId: 'private-request', nodes: [], edges: [] });
    now = 120;
    worker.listeners.get('message')({ data: { requestId: 'private-request' } });
    cloneFails = true;
    worker.postMessage({ operation: 'route', requestId: 'private-request' });
    worker.listeners.get('message')({ data: { requestId: 'private-request' } });
    const evidence = vm.runInContext(displayRoutingBrowserLifecycleExpression, context);
    expect(evidence).toMatchObject({ requestCount: 1, responseCount: 1, workerErrorCount: 8,
      legacyPageErrorCount: 8, captureErrorCount: 2, page: { scriptErrors: 20, unhandledRejections: 20 },
      milestones: { workerConstructedMs: 0, workerRequestMs: 10, workerResponseMs: 20,
        rootObservedMs: 10, pathObservedMs: 10 } });
    expect(JSON.stringify([evidence, window.__vizlyPrecompiledRoutePageErrors,
      window.__vizlyPrecompiledRouteWorkerErrors, window.__vizlyPrecompiledRouteCaptureErrors])).not.toContain('private');
  });
});

import {
  createPrecompiledDisplayRouteTimingRecorder,
  projectPrecompiledDisplayRouteTimings,
  createPrecompiledDisplayRoutePatches,
  isFreshFullRouteResolution,
  isFreshFullRouteRequestResponse,
  isMatchingHardCleanDisplayWorkerResponse,
  precompiledDisplayRouteContractsMatch,
  replayPrecompiledDisplayRoutePatches,
  replayTrustedDisplayRoutePatches,
  renderPrecompiledDisplayRouteCaptureExpression,
} from './precompiled-display-route-capture.mjs';

const source = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  type: 'advanced-smart-step',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
}];

const routed = [{
  ...source[0],
  type: 'stablePath',
  data: {
    computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }],
    sharedTrunkAware: true,
    overextendedTargetTrunkCorridorReclaimed: true,
  },
}];

describe('precompiled display route capture', () => {
  it('times only matching replies and resets between requests', () => {
    const recorder = createPrecompiledDisplayRouteTimingRecorder(100);
    expect(recorder.received({ requestId: 'first' }, 110)).toBeNull();
    recorder.posted('first', 120);
    expect(recorder.received({ requestId: 'stale', edges: [] }, 130)).toBeNull();
    expect(recorder.received({ requestId: 'first', phaseProgress: {} }, 140)).toEqual({
      createdAt: 100, postedAt: 120, firstResponseAt: 140, finalResponseAt: null,
      postedMonotonicAt: 120, finalResponseMonotonicAt: null,
    });
    const result = recorder.received({ requestId: 'first', edges: [] }, 180);
    expect(result.finalResponseAt).toBe(180);
    result.finalResponseAt = 0;
    expect(recorder.received({ requestId: 'first', edges: [] }, 200).finalResponseAt).toBe(180);
    recorder.posted('second', 210);
    expect(recorder.received({ requestId: 'first' }, 220)).toBeNull();
    expect(recorder.received({ requestId: 'second', error: 'failed' }, 230)).toEqual({
      createdAt: 100, postedAt: 210, firstResponseAt: 230, finalResponseAt: 230,
      postedMonotonicAt: 210, finalResponseMonotonicAt: 230,
    });
    for (const id of [null, '', 123, 'x'.repeat(501)]) {
      recorder.posted(id, 240);
      expect(recorder.received({ requestId: id }, 250)).toBeNull();
    }
  });

  it('projects only ordered bounded timing durations', () => {
    const timing = { createdAt: 100, postedAt: 220, firstResponseAt: 230, finalResponseAt: 700,
      postedMonotonicAt: 20.5, finalResponseMonotonicAt: 500.5 };
    const routing = { workerStartedAt: 200, workerResponseParsedAt: 720, finalAppliedAt: 730 };
    expect(projectPrecompiledDisplayRouteTimings(timing, routing, 400)).toEqual({
      prewarmLeadMs: 120, requestPreparationMs: 20, firstResponseMs: 10,
      workerDeliveryOverheadMs: 80, responseParseMs: 20, responseApplyMs: 10,
      workerMonotonicDeliveryOverheadMs: 80,
    });
    // A worker created on demand is valid, but has less prewarm lead.
    expect(projectPrecompiledDisplayRouteTimings({ ...timing, createdAt: 210 }, routing, 400)
      .prewarmLeadMs).toBe(10);
    expect(projectPrecompiledDisplayRouteTimings(timing, routing, 480.5)
      .workerDeliveryOverheadMs).toBe(0);
    for (const value of [null, {}, [], { ...timing, createdAt: 221 },
      { ...timing, firstResponseAt: 701 }, { ...timing, finalResponseAt: 600_900 },
      ...[NaN, Infinity, -1, '700', 700.1, '<script>'].map(finalResponseAt => ({ ...timing, finalResponseAt }))]) {
      expect(projectPrecompiledDisplayRouteTimings(value, routing, 400)).toBeNull();
    }
    for (const value of [NaN, Infinity, -1, 482, '400']) {
      expect(projectPrecompiledDisplayRouteTimings(timing, routing, value)).toBeNull();
    }
    expect(projectPrecompiledDisplayRouteTimings(timing, null, 400)).toBeNull();
    expect(projectPrecompiledDisplayRouteTimings(timing, { ...routing, finalAppliedAt: 719 }, 400)).toBeNull();
    expect(projectPrecompiledDisplayRouteTimings({ ...timing, finalResponseMonotonicAt: Infinity }, routing, 400)).toBeNull();
    expect(projectPrecompiledDisplayRouteTimings({ ...timing, finalResponseMonotonicAt: 400 }, routing, 400)).toBeNull();
    expect(projectPrecompiledDisplayRouteTimings({ ...timing, finalResponseMonotonicAt: 421 }, routing, 400)
      .workerMonotonicDeliveryOverheadMs).toBe(0.5);
  });

  it('captures bounded worker compute duration for cold-route diagnostics', () => {
    expect(renderPrecompiledDisplayRouteCaptureExpression('safe-preset'))
      .toContain('workerDurationMs: isLayoutCapture ? routing.routeMs : response.workerDurationMs');
  });

  it('binds layout capture to the exact committed variant and fresh provenance', () => {
    const expression = renderPrecompiledDisplayRouteCaptureExpression(
      'wms-process-flow-v1',
      'domain-lanes-lr',
    );
    expect(expression).toContain('const expectedVariantId = "domain-lanes-lr"');
    expect(expression).toContain("committed?.variantId === expectedVariantId");
    expect(expression).toContain("committed?.provenance === 'fresh-full-route'");
    expect(expression).toContain("operation: isLayoutCapture ? 'layout-committed'");
    expect(expression).toContain('const currentWorkerMatches = isLayoutCapture || (');
  });

  it('treats an in-job final repair as a fresh full route', () => {
    expect(isFreshFullRouteResolution('full-route')).toBe(true);
    expect(isFreshFullRouteResolution('full-route-repaired')).toBe(true);
    expect(isFreshFullRouteResolution('validated-candidate')).toBe(false);
    expect(isFreshFullRouteResolution('repaired-candidate')).toBe(false);
    expect(isFreshFullRouteResolution(null)).toBe(false);
  });

  it('requires a candidate-free route request for regeneration capture', () => {
    const response = { routeResolution: 'full-route' };
    expect(isFreshFullRouteRequestResponse({ operation: 'route' }, response)).toBe(true);
    expect(isFreshFullRouteRequestResponse({
      operation: 'route',
      candidateEdges: [],
    }, response)).toBe(false);
    expect(isFreshFullRouteRequestResponse({
      operation: 'validate-or-route',
    }, response)).toBe(false);
    expect(isFreshFullRouteRequestResponse({ operation: 'route' }, {
      routeResolution: 'validated-candidate',
    })).toBe(false);
  });

  it('accepts only the matching final hard-clean worker response', () => {
    const request = { operation: 'route', requestId: 'request-1', edges: source };
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      hardClean: true,
      routeResolution: 'full-route',
      edges: routed,
    })).toBe(true);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      hardClean: true,
      routeResolution: 'full-route-repaired',
      edges: routed,
    })).toBe(true);
    expect(isMatchingHardCleanDisplayWorkerResponse({
      ...request,
      operation: 'validate-or-route',
    }, {
      requestId: 'request-1',
      hardClean: true,
      routeResolution: 'repaired-candidate',
      edges: routed,
    })).toBe(true);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-2',
      hardClean: true,
      routeResolution: 'full-route',
      edges: routed,
    })).toBe(false);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1:repair',
      hardClean: true,
      routeResolution: 'repair',
      edges: routed,
    })).toBe(false);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      boundedCandidate: {},
    })).toBe(false);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      hardClean: false,
      routeResolution: 'full-route',
      edges: routed,
    })).toBe(false);
  });

  it('projects only explicit routing fields including authorized trunk intent', () => {
    expect(createPrecompiledDisplayRoutePatches(source, routed)).toEqual([{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }],
        sharedTrunkAware: true,
        overextendedTargetTrunkCorridorReclaimed: true,
      },
    }]);
    expect(createPrecompiledDisplayRoutePatches(
      [{ ...source[0], sourceHandle: undefined }],
      [{ ...routed[0], sourceHandle: undefined }],
    )?.[0]).not.toHaveProperty('sourceHandle');
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }])).toMatchObject([{
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }]);
  });

  it('captures unchanged projected terminals so replay is independent of raw source defaults', () => {
    const patches = createPrecompiledDisplayRoutePatches(source, routed);
    expect(patches?.[0]).toMatchObject({
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
    });
  });

  it('captures only bounded line-hop quality identity', () => {
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, h: ';50,50;' },
    }])?.[0].data).toMatchObject({ h: ';50,50;' });
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, h: 'x'.repeat(129) },
    }])).toBeNull();
  });

  it('rejects malformed intent and routing-field deletion', () => {
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, sharedTrunkAware: 'yes' },
    }])).toBeNull();
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, overextendedTargetTrunkCorridorReclaimed: 1 },
    }])).toBeNull();
    const missingHandle = { ...routed[0] };
    delete missingHandle.sourceHandle;
    expect(createPrecompiledDisplayRoutePatches(source, [missingHandle])).toBeNull();
  });

  it('replaces the complete tree-routing contract instead of retaining stale source fields', () => {
    const sourceWithStaleTree = [{
      ...source[0],
      data: {
        ...source[0].data,
        businessLabel: 'preserved',
        treeRouting: {
          effectiveSourceHandle: 'right',
          effectiveTargetHandle: 'left',
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        },
      },
    }];
    const routedWithoutTreeFields = [{
      ...routed[0],
      data: {
        ...routed[0].data,
        businessLabel: 'preserved',
        treeRouting: {},
      },
    }];
    const patches = createPrecompiledDisplayRoutePatches(
      sourceWithStaleTree,
      routedWithoutTreeFields,
    );
    expect(patches).not.toBeNull();
    const replayed = replayPrecompiledDisplayRoutePatches(sourceWithStaleTree, patches);

    expect(replayed?.[0].data).toMatchObject({
      businessLabel: 'preserved',
      treeRouting: {},
    });
    expect(replayed?.[0].data.treeRouting).toEqual({});
    expect(precompiledDisplayRouteContractsMatch(replayed, routedWithoutTreeFields)).toBe(true);
  });

  it('fails replay proof when any route-signature field differs', () => {
    const patches = createPrecompiledDisplayRoutePatches(source, routed);
    const replayed = replayPrecompiledDisplayRoutePatches(source, patches);
    expect(precompiledDisplayRouteContractsMatch(replayed, routed)).toBe(true);
    expect(precompiledDisplayRouteContractsMatch(replayed, [{
      ...routed[0],
      data: {
        ...routed[0].data,
        computedPath: [{ x: 0, y: 0 }, { x: 101, y: 0 }],
      },
    }])).toBe(false);
  });

  it('replays committed display patches before projecting the generated artifact', () => {
    const committedPatches = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      data: {
        computedPath: routed[0].data.computedPath,
        treeRouting: {
          effectiveSourceHandle: 'right',
          points: [{ x: 0, y: 0 }, { x: 100, y: 50 }],
        },
      },
    }];
    const replayed = replayTrustedDisplayRoutePatches(source, committedPatches);
    expect(replayed?.[0]).toMatchObject({
      type: 'stablePath',
      data: {
        computedPath: routed[0].data.computedPath,
        treeRouting: {
          effectiveSourceHandle: 'right',
          points: [{ x: 0, y: 0 }, { x: 100, y: 50 }],
        },
      },
    });
    expect(replayTrustedDisplayRoutePatches(source, [{
      ...committedPatches[0],
      id: 'wrong-edge',
    }])).toBeNull();
  });
});
