// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBaseReactFlowFitController } from '../useBaseReactFlowFitController';

const node: Node = {
  id: 'node',
  position: { x: 20, y: 30 },
  width: 100,
  height: 60,
  data: {},
};

const createInstance = (nodes: Node[] = [node]) => ({
  fitView: vi.fn(),
  getNodes: vi.fn(() => nodes),
  setViewport: vi.fn(),
}) as unknown as ReactFlowInstance<any, any>;

const createParams = (rfInstance: ReactFlowInstance<any, any>) => ({
  rfInstance,
  renderNodes: [node],
  visibleNodeCount: 1,
  edges: [],
  containerSize: { width: 800, height: 600 },
  fitMode: 'fitAll' as const,
  pinFit: true,
  fitPadding: 16,
  minZoom: 0.1,
  maxZoom: 4,
  defaultDebounceMs: 100,
});

describe('useBaseReactFlowFitController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('schedules fit-all and cancels pending work when unmounted', () => {
    const instance = createInstance();
    const first = renderHook(() => useBaseReactFlowFitController(createParams(instance)));
    act(() => vi.advanceTimersByTime(200));
    expect(instance.fitView).toHaveBeenCalledWith({ padding: 16 });

    const pendingInstance = createInstance();
    const pending = renderHook(() => useBaseReactFlowFitController(createParams(pendingInstance)));
    pending.unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(pendingInstance.fitView).not.toHaveBeenCalled();
    first.unmount();
  });

  it('does not fit empty graphs or invalid container dimensions', () => {
    const emptyInstance = createInstance([]);
    const empty = renderHook(() => useBaseReactFlowFitController({
      ...createParams(emptyInstance),
      renderNodes: [],
      visibleNodeCount: 0,
    }));
    act(() => vi.advanceTimersByTime(500));
    expect(emptyInstance.fitView).not.toHaveBeenCalled();

    const invalidSizeInstance = createInstance();
    const invalidSize = renderHook(() => useBaseReactFlowFitController({
      ...createParams(invalidSizeInstance),
      fitMode: 'fitWidthTop',
      containerSize: { width: 0, height: 600 },
    }));
    act(() => vi.advanceTimersByTime(500));
    expect(invalidSizeInstance.setViewport).not.toHaveBeenCalled();
    empty.unmount();
    invalidSize.unmount();
  });

  it('computes and applies a bounded fit-width-top viewport', () => {
    const instance = createInstance();
    const hook = renderHook(() => useBaseReactFlowFitController({
      ...createParams(instance),
      fitMode: 'fitWidthTop',
    }));
    act(() => vi.advanceTimersByTime(200));
    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    expect(instance.setViewport).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        zoom: expect.any(Number),
      }),
      { duration: 0 },
    );
    hook.unmount();
  });

  it('preserves the user viewport when unpinned nodes are deleted or restored', () => {
    const instance = createInstance();
    const childNode = { ...node, id: 'child-node' };
    const { rerender, unmount } = renderHook(
      ({ renderNodes }) => useBaseReactFlowFitController({
        ...createParams(instance),
        renderNodes,
        visibleNodeCount: renderNodes.length,
        pinFit: false,
      }),
      { initialProps: { renderNodes: [node, childNode] } },
    );

    act(() => vi.advanceTimersByTime(200));
    expect(instance.fitView).toHaveBeenCalledTimes(1);

    rerender({ renderNodes: [node] });
    act(() => vi.advanceTimersByTime(500));
    expect(instance.fitView).toHaveBeenCalledTimes(1);

    rerender({ renderNodes: [node, childNode] });
    act(() => vi.advanceTimersByTime(500));

    expect(instance.fitView).toHaveBeenCalledTimes(1);
    unmount();
  });
});
