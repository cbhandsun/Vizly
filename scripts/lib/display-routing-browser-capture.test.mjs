import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from './display-routing-browser-capture.mjs';

describe('display routing browser capture', () => {
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
    const window = { Worker: TestWorker };
    const context = vm.createContext({
      Date: { now: () => 1234 },
      PerformanceObserver: class {
        observe() {}
      },
      document: { querySelectorAll: () => [] },
      performance: { now: vi.fn(() => 10), timeOrigin: 0 },
      queueMicrotask: callback => queuedMicrotasks.push(callback),
      requestAnimationFrame: () => 1,
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
    worker.addEventListener('message', () => {
      order.push('application');
      context.queueMicrotask(() => order.push('application-continuation'));
    });
    worker.emit({ requestId: 'request-1', routingPatches: [] });

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
    });
  });
});
