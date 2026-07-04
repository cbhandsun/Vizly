import { describe, expect, it, vi } from 'vitest';

import {
  computeBaseReactFlowIsLargeGraph,
  createBaseReactFlowDefaultEdgeOptions,
  createBaseReactFlowProOptions,
  DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG,
  detectBaseReactFlowTouchDevice,
  readBaseReactFlowPerformanceConfig,
  readBaseReactFlowZoomSensitivity,
  resolveBaseReactFlowInteractionFlags,
} from '../baseReactFlowRuntimeConfig';

describe('baseReactFlowRuntimeConfig', () => {
  it('reads zoom sensitivity with a safe fallback', () => {
    expect(readBaseReactFlowZoomSensitivity({
      readConfig: () => ({ canvas: { zoom: { sensitivity: 1.5 } } }),
    })).toBe(1.5);

    const onReadFailure = vi.fn();
    expect(readBaseReactFlowZoomSensitivity({
      readConfig: () => {
        throw new Error('boom');
      },
      onReadFailure,
    })).toBe(1);
    expect(onReadFailure).toHaveBeenCalledTimes(1);
  });

  it('derives touch and interaction flags explicitly', () => {
    expect(detectBaseReactFlowTouchDevice({
      hasTouchStart: false,
      maxTouchPoints: 2,
    })).toBe(true);

    expect(resolveBaseReactFlowInteractionFlags({
      panOnScroll: false,
      panOnDrag: false,
      isTouchDevice: true,
      isMobileScreen: false,
    })).toEqual({
      effectivePreventScrolling: true,
      effectivePanOnScroll: true,
    });

    expect(resolveBaseReactFlowInteractionFlags({
      preventScrolling: false,
      panOnScroll: false,
      panOnDrag: true,
      isTouchDevice: true,
      isMobileScreen: true,
    })).toEqual({
      effectivePreventScrolling: false,
      effectivePanOnScroll: false,
    });
  });

  it('reads performance config and computes large-graph mode', () => {
    expect(readBaseReactFlowPerformanceConfig({
      readConfig: () => ({ performance: { enableVirtualization: false, batchSize: 20, debounceMs: 40 } }),
    })).toEqual({
      enableVirtualization: false,
      batchSize: 20,
      debounceMs: 40,
    });

    expect(readBaseReactFlowPerformanceConfig({
      readConfig: () => ({}),
    })).toEqual(DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG);

    expect(computeBaseReactFlowIsLargeGraph({
      nodeCount: 90,
      edgeCount: 70,
      performanceConfig: DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG,
    })).toBe(true);
  });

  it('creates stable rendering options from mode flags', () => {
    expect(createBaseReactFlowProOptions({ isLargeGraph: true })).toEqual({
      onlyRenderVisibleElements: true,
      hideAttribution: true,
    });

    expect(createBaseReactFlowDefaultEdgeOptions({ isLargeGraph: false })).toEqual({
      type: 'advanced-smart-step',
      markerEnd: { type: 'arrowclosed', width: 10, height: 10 },
      style: {
        strokeOpacity: 0.98,
        filter: 'drop-shadow(0 0 0.6px rgba(0,0,0,0.35))',
      },
    });
  });
});
