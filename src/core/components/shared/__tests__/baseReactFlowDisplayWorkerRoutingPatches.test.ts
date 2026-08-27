import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestBaseReactFlowDisplayEdgesWorker } from '../baseReactFlowDisplayWorkerClient';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import {
  createTestDisplayHardReport,
  withRequiredTestDisplayHardReport,
} from './baseReactFlowDisplayWorkerTestFixtures';

const installWorkerHarness = () => {
  let activeListeners: Map<string, Set<EventListener>> | null = null;
  let activeRequest: unknown;
  class TestWorker {
    private readonly listeners = new Map<string, Set<EventListener>>();

    constructor() {
      activeListeners = this.listeners;
    }

    addEventListener(type: string, listener: EventListener) {
      const listeners = this.listeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: EventListener) {
      this.listeners.get(type)?.delete(listener);
    }

    postMessage(request: unknown) {
      activeRequest = request;
    }

    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  return {
    emitMessage: (data: unknown) => {
      for (const listener of activeListeners?.get('message') ?? []) {
        listener({
          data: withRequiredTestDisplayHardReport(data, activeRequest),
        } as MessageEvent);
      }
    },
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('display Worker routing-only response boundary', () => {
  it('projects a legacy full-edge response into one routing-only transaction', async () => {
    const harness = installWorkerHarness();
    const sourceEdges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      label: 'current label',
      data: { businessMetadata: { owner: 'current' } },
    }];
    const pending = requestBaseReactFlowDisplayEdgesWorker({
      workerRef: { current: null },
      request: {
        operation: 'route',
        requestId: 'legacy-full-response',
        edges: sourceEdges,
        nodes: [],
        enableSmartEdges: true,
        smartEdgePadding: 20,
        isLargeGraph: false,
        displayEdgeEpoch: 1,
        qualityMode: 'full',
        inputIdentity: createDisplayRoutingIdentity(
          '1234',
          `geometry-v1:${'a'.repeat(32)}`,
        ),
      },
    });
    harness.emitMessage({
      requestId: 'legacy-full-response',
      edges: [{
        ...sourceEdges[0],
        label: 'worker must not own this',
        type: 'stablePath',
        data: {
          businessMetadata: { owner: 'worker' },
          computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        },
      }],
      hardClean: true,
      hardReport: createTestDisplayHardReport(),
      routeResolution: 'full-route',
    });

    await expect(pending).resolves.toMatchObject({
      routingPatches: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        type: 'stablePath',
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      }],
      edges: [{
        ...sourceEdges[0],
        type: 'stablePath',
        data: {
          businessMetadata: { owner: 'current' },
          computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        },
      }],
    });
  });
});
