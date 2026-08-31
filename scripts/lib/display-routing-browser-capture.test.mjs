import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from './display-routing-browser-capture.mjs';

describe('display routing browser capture', () => {
  it('retains layout lifecycle events under a flood of diagnostic completions within the original event cap', () => {
    const tasks = [];
    let frame;
    let busy = true;
    let clock = 0;
    class TestWorker {
      listeners = [];
      addEventListener(_type, listener) { this.listeners.push(listener); }
      postMessage() {}
      emit(data) { this.listeners.forEach(listener => listener({ data })); }
    }
    const window = { Worker: TestWorker };
    const context = vm.createContext({
      Date: { now: () => clock },
      PerformanceObserver: class { observe() {} },
      document: {
        querySelectorAll: selector => selector === 'button' ? [{ getAttribute: key => (
          key === 'aria-label' ? '自动布局' : String(busy)
        ) }] : [],
        querySelector: () => busy ? {} : null,
      },
      performance: { now: () => clock, timeOrigin: 0 },
      queueMicrotask: callback => callback(),
      requestAnimationFrame: callback => { frame = callback; return 1; },
      setInterval: () => 1,
      clearInterval: () => undefined,
      setTimeout: callback => { tasks.push(callback); return 1; },
      structuredClone,
      window,
    });
    vm.runInContext(DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT, context);
    frame();
    const worker = new window.Worker('worker.js');
    for (let index = 0; index < 256; index += 1) {
      clock += 1;
      worker.emit({ requestId: 'layout:1', phase: 'repair-progress' });
      while (tasks.length) tasks.shift()();
    }
    busy = false;
    clock += 1;
    frame();
    expect(window.__vizlyLayoutVisualEvents.length).toBeLessThanOrEqual(128);
    for (const type of ['layout-busy', 'layout-progress', 'layout-committing']) {
      expect(window.__vizlyLayoutVisualEvents).toContainEqual({ type, value: true, sampledAt: 0 });
      expect(window.__vizlyLayoutVisualEvents).toContainEqual({ type, value: false, sampledAt: clock });
    }
    expect(window.__vizlyLayoutVisualEvents.at(-4)).toMatchObject({ type: 'diagnostic-clone-backlog-drained' });
    for (let index = 0; index < 256; index += 1) {
      clock += 1;
      busy = !busy;
      frame();
    }
    expect(window.__vizlyLayoutVisualEvents).toHaveLength(128);
  });

  it('observes the awaited layout-commit fit request protocol', () => {
    const listeners = new Map();
    const queuedMicrotasks = [];
    class TestWorker {
      addEventListener() {}
    }
    const window = {
      Worker: TestWorker,
      addEventListener: (type, listener) => listeners.set(type, listener),
    };
    const context = vm.createContext({
      Date,
      PerformanceObserver: class { observe() {} },
      document: { querySelectorAll: () => [] },
      performance: { now: () => 10, timeOrigin: 1_000 },
      queueMicrotask: callback => queuedMicrotasks.push(callback),
      requestAnimationFrame: () => 1,
      setInterval: () => 1,
      clearInterval: () => undefined,
      setTimeout: () => 1,
      structuredClone: value => value,
      window,
    });

    vm.runInContext(DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT, context);
    listeners.get('vizly:diagram-control-request')?.({ detail: {
      schema: 'vizly-diagram-control-request-v1',
      action: 'fit',
      mode: 'layout-commit',
    } });

    expect(window.__vizlyLayoutVisualEvents).toEqual([
      { type: 'fit-dispatched', value: true, sampledAt: 1_010 },
    ]);
    queuedMicrotasks.shift()?.();
    expect(window.__vizlyLayoutVisualEvents.at(-1)).toEqual({
      type: 'fit-listeners-returned',
      value: true,
      sampledAt: 1_010,
    });
  });

  it('timestamps a response without delaying the application Worker listener', () => {
    const queuedMicrotasks = [];
    const queuedTasks = [];
    const order = [];
    class TestWorker {
      listeners = [];

      addEventListener(type, listener) {
        if (type === 'message') this.listeners.push(listener);
      }

      postMessage() {}

      emit(data) {
        for (const listener of this.listeners) listener({ data });
      }
    }
    const window = {
      Worker: TestWorker,
      __vizlyBaseReactFlowDisplayRouting: {
        layoutSeedTerminalsAttached: true,
        layoutSeedTerminalsAnchored: false,
        layoutSeedObstacleHits: 3,
        layoutSeedStrictCrossings: 5,
      },
    };
    const context = vm.createContext({
      Date: { now: () => 1234 },
      PerformanceObserver: class {
        observe() {}
      },
      document: { querySelectorAll: () => [] },
      performance: { now: vi.fn(() => 10), timeOrigin: 0 },
      queueMicrotask: callback => queuedMicrotasks.push(callback),
      requestAnimationFrame: () => 1,
      setInterval: () => 7,
      clearInterval: vi.fn(),
      setTimeout: callback => {
        queuedTasks.push(callback);
        return 1;
      },
      structuredClone: value => {
        order.push('clone');
        return JSON.parse(JSON.stringify(value));
      },
      window,
    });

    vm.runInContext(DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT, context);
    const worker = new window.Worker('worker.js');
    worker.postMessage({
      requestId: 'request-1',
      operation: 'route',
      inputIdentity: { geometryDigest: 'geometry-1' },
    });
    expect(window.__vizlyRoutingRequests[0]).toMatchObject({
      requestId: 'request-1',
      __browserWorkerInstanceId: 'worker-1',
      __browserRequestOrdinal: 1,
      __browserAttemptOrdinal: 1,
      __browserLayoutSeedAudit: {
        terminalsAttached: true,
        terminalsAnchored: false,
        obstacleHits: 3,
        strictCrossings: 5,
      },
    });
    expect(window.__vizlyWorkerHeartbeats).toEqual([expect.objectContaining({
      workerInstanceId: 'worker-1',
      requestOrdinal: 1,
      attemptOrdinal: 1,
      operation: 'route',
      elapsedMs: 0,
    })]);
    order.length = 0;
    worker.addEventListener('message', () => {
      order.push('application');
      context.queueMicrotask(() => order.push('application-continuation'));
    });
    worker.emit({
      requestId: 'request-1',
      routingPatches: [],
      hardClean: true,
      routeResolution: 'full-route',
      commitReceipt: { protocolVersion: 'display-routing-worker-v1' },
    });

    expect(order).toEqual(['application']);
    expect(window.__vizlyRoutingResponses).toEqual([]);
    expect(queuedMicrotasks).toHaveLength(1);
    expect(queuedTasks).toHaveLength(1);

    queuedMicrotasks[0]();
    expect(order).toEqual(['application', 'application-continuation']);
    expect(window.__vizlyRoutingResponses).toEqual([]);
    queuedTasks[0]();

    expect(order).toEqual(['application', 'application-continuation', 'clone']);
    expect(window.__vizlyRoutingResponses).toHaveLength(1);
    expect(window.__vizlyRoutingResponses[0]).toMatchObject({
      requestId: 'request-1',
      __browserCapturedAt: 1234,
      __browserCloneMs: 0,
      __browserWorkerInstanceId: 'worker-1',
      __browserRequestOrdinal: 1,
      __browserAttemptOrdinal: 1,
      __browserResponseOrdinal: 1,
      __browserResponseOrdinalWithinRequest: 1,
      __browserProtocolVersion: 'display-routing-worker-v1',
    });
    expect(context.clearInterval).toHaveBeenCalledWith(7);

    worker.emit({
      requestId: 'completed-repair',
      hardClean: false,
      routeResolution: 'repair',
      edges: [],
    });
    for (let index = 0; index < 240; index += 1) {
      worker.emit({ requestId: `progress-${index}`, phaseProgress: {} });
    }
    queuedTasks.slice(1).forEach(task => task());

    expect(window.__vizlyRoutingResponses).toHaveLength(198);
    expect(window.__vizlyRoutingResponses.find(item => (
      item.requestId === 'completed-repair'
    ))).toMatchObject({
      requestId: 'completed-repair',
      hardClean: false,
      routeResolution: 'repair',
    });
  });
});
