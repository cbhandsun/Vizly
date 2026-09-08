// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBaseReactFlowFitController } from '../useBaseReactFlowFitController';
import { readDiagramOverviewFitInput, diagramOverviewContainsContent } from '../diagramOverviewFit';
import { resolveBaseReactFlowInitialFitMode } from '../baseReactFlowViewport';
import { waitForDiagramControlViewportPaint } from '../diagramControlPaint';
import type { DiagramFitViewport } from '../diagramControlFit';

vi.mock('../diagramControlPaint', () => ({ waitForDiagramControlViewportPaint: vi.fn(async () => true) }));

const node: Node = {
  id: 'node',
  position: { x: 20, y: 30 },
  width: 100,
  height: 60,
  data: {},
};

const createInstance = (nodes: Node[] = [node], edges: Edge[] = []) => {
  let viewport: DiagramFitViewport = { x: 0, y: 0, zoom: 1 };
  return {
    fitView: vi.fn(async () => true), getNodes: vi.fn(() => nodes), getEdges: vi.fn(() => edges),
    getViewport: vi.fn(() => viewport),
    setViewport: vi.fn(async (next: DiagramFitViewport) => { viewport = next; return true; }),
  };
};

const createParams = (rfInstance: ReturnType<typeof createInstance>) => ({
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(waitForDiagramControlViewportPaint).mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.documentElement.style.removeProperty('--left-sidebar-offset');
    document.documentElement.style.removeProperty('--right-sidebar-offset');
  });

  it('schedules the shared overview contract and cancels pending work when unmounted', async () => {
    const instance = createInstance();
    const first = renderHook(() => useBaseReactFlowFitController(createParams(instance)));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(instance.setViewport).toHaveBeenCalled();
    expect(instance.fitView).not.toHaveBeenCalled();

    const pendingInstance = createInstance();
    const pending = renderHook(() => useBaseReactFlowFitController(createParams(pendingInstance)));
    pending.unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(pendingInstance.setViewport).not.toHaveBeenCalled();
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
    expect(emptyInstance.setViewport).not.toHaveBeenCalled();
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

  it('preserves the user viewport when unpinned nodes are deleted or restored', async () => {
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

    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(instance.setViewport).toHaveBeenCalledTimes(1);

    rerender({ renderNodes: [node] });
    act(() => vi.advanceTimersByTime(500));
    expect(instance.setViewport).toHaveBeenCalledTimes(1);

    rerender({ renderNodes: [node, childNode] });
    act(() => vi.advanceTimersByTime(500));

    expect(instance.setViewport).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('fits initial and resized enterprise geometry inside the same final sidebar safe area', async () => {
    document.documentElement.style.setProperty('--left-sidebar-offset', '68px');
    document.documentElement.style.setProperty('--right-sidebar-offset', '376px');
    const nodes: Node[] = [{ ...node, position: { x: 0, y: 0 }, width: 7906, height: 3304 }];
    const instance = createInstance(nodes);
    const syncSemanticViewport = vi.fn();
    const container = document.createElement('div');
    container.className = 'react-flow';
    let width = 1948;
    Object.defineProperty(container, 'clientWidth', { get: () => width });
    Object.defineProperty(container, 'clientHeight', { value: 1084 });
    const containerRef = { current: container };
    const { rerender, unmount } = renderHook(({ containerSize }) => useBaseReactFlowFitController({
      ...createParams(instance), renderNodes: nodes, containerSize, containerRef, pinFit: false, syncSemanticViewport,
    }), { initialProps: { containerSize: { width, height: 1084 } } });
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(instance.getViewport()).toMatchObject({ x: 90.88, zoom: 0.18444725524917785 });
    expect(syncSemanticViewport).toHaveBeenCalled();
    width = 1648;
    rerender({ containerSize: { width, height: 1084 } });
    await act(async () => vi.advanceTimersByTimeAsync(200));
    const fitInput = readDiagramOverviewFitInput({ container, nodes, edges: [], viewport: instance.getViewport() });
    if (!fitInput) throw Error('expected overview input');
    expect(diagramOverviewContainsContent(fitInput, instance.getViewport())).toBe(true);
    expect(instance.setViewport).toHaveBeenCalledTimes(2);
    expect(instance.fitView).not.toHaveBeenCalled();
    unmount();
  });

  it('includes actual routed detours and ignores hidden nodes in initial overview bounds', async () => {
    const nodes: Node[] = [node, { ...node, id: 'target', position: { x: 300, y: 30 } },
      { ...node, id: 'hidden', hidden: true, position: { x: 100000, y: 100000 } }];
    const edges: Edge[] = [{ id: 'edge', source: 'node', target: 'target', data: {
      computedPath: [{ x: 120, y: 60 }, { x: 120, y: 8000 }, { x: 300, y: 8000 }, { x: 300, y: 60 }],
    } }];
    const instance = createInstance(nodes, edges);
    const params = { ...createParams(instance), pinFit: false, renderNodes: nodes, edges };
    const { unmount } = renderHook(() => useBaseReactFlowFitController(params));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    const input = readDiagramOverviewFitInput({ container: null, nodes, edges,
      viewport: instance.getViewport(), fallbackSize: params.containerSize });
    if (!input) throw Error('expected bounds');
    expect(input.bounds.height).toBe(7982);
    expect(diagramOverviewContainsContent(input, instance.getViewport())).toBe(true);
    expect(instance.getViewport().zoom).toBeLessThan(0.1);
    unmount();
  });

  it('fits around its portaled minimap using canvas-relative screen coordinates', async () => {
    const nodes: Node[] = [{ ...node, position: { x: 0, y: 0 }, width: 3000, height: 1200 }];
    const instance = createInstance(nodes);
    const container = document.createElement('div');
    container.className = 'react-flow';
    Object.defineProperties(container, { clientWidth: { value: 1200 }, clientHeight: { value: 800 } });
    container.getBoundingClientRect = () => new DOMRect(100, 50, 1200, 800);
    const anchor = document.createElement('div');
    anchor.dataset.diagramFitOccluder = 'own-minimap';
    container.append(anchor);
    const overlay = document.createElement('div');
    overlay.id = 'own-minimap';
    overlay.getBoundingClientRect = () => new DOMRect(124, 550, 240, 180);
    document.body.append(container, overlay);
    const { unmount } = renderHook(() => useBaseReactFlowFitController({
      ...createParams(instance), renderNodes: nodes, containerRef: { current: container },
      containerSize: { width: 1200, height: 800 }, pinFit: false,
    }));
    try {
      await act(async () => vi.advanceTimersByTimeAsync(200));
      const view = instance.getViewport();
      const overlaps = view.x < 264 && view.x + 3000 * view.zoom > 24
        && view.y < 680 && view.y + 1200 * view.zoom > 500;
      expect(overlaps).toBe(false);
      expect(instance.fitView).not.toHaveBeenCalled();
    } finally {
      unmount(); container.remove(); overlay.remove();
    }
  });

  it('ignores an unrelated, hidden, detached or empty overlay when reading fit input', () => {
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1200 }, clientHeight: { value: 800 } });
    const overlay = document.createElement('div');
    overlay.id = 'other-minimap';
    overlay.getBoundingClientRect = () => new DOMRect(20, 500, 240, 180);
    document.body.append(overlay);
    const read = () => readDiagramOverviewFitInput({ container, nodes: [node], edges: [],
      viewport: { x: 0, y: 0, zoom: 1 } });
    try {
      expect(read()?.occlusion).toBeUndefined();
      const anchor = document.createElement('div');
      anchor.dataset.diagramFitOccluder = overlay.id;
      container.append(anchor);
      expect(read()?.occlusion).toEqual({ x: 20, y: 500, width: 240, height: 180 });
      overlay.style.display = 'none';
      expect(read()?.occlusion).toBeUndefined();
      overlay.style.display = '';
      overlay.getBoundingClientRect = () => new DOMRect(20, 500, 0, 0);
      expect(read()?.occlusion).toBeUndefined();
      overlay.remove();
      expect(read()?.occlusion).toBeUndefined();
    } finally { overlay.remove(); }
  });

  it('leaves a saved viewport authoritative when restoreOrFitAll resolves to none', async () => {
    const instance = createInstance();
    const saved = { x: 210, y: 130, zoom: 0.06 };
    await instance.setViewport(saved);
    instance.setViewport.mockClear();
    const { unmount } = renderHook(() => useBaseReactFlowFitController({ ...createParams(instance),
      fitMode: resolveBaseReactFlowInitialFitMode({ fitMode: 'restoreOrFitAll', lastViewport: saved }),
    }));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(instance.setViewport).not.toHaveBeenCalled();
    expect(instance.fitView).not.toHaveBeenCalled();
    expect(instance.getViewport()).toEqual(saved);
    unmount();
  });

  it('lets a gesture before the queued initial fit own later container resizes', async () => {
    const instance = createInstance();
    const { rerender, unmount } = renderHook(({ width }) => useBaseReactFlowFitController({
      ...createParams(instance), pinFit: false, containerSize: { width, height: 600 },
    }), { initialProps: { width: 800 } });
    const userViewport = { x: 160, y: 90, zoom: 0.75 };
    await instance.setViewport(userViewport);
    instance.setViewport.mockClear();
    await act(async () => vi.advanceTimersByTimeAsync(200));
    rerender({ width: 1000 });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(instance.setViewport).not.toHaveBeenCalled();
    expect(instance.getViewport()).toEqual(userViewport);
    unmount();
  });

  it('does not reclaim a post-fit user viewport on resize but honors a new explicit trigger', async () => {
    const instance = createInstance();
    const { rerender, unmount } = renderHook(({ width, trigger }) => useBaseReactFlowFitController({
      ...createParams(instance), pinFit: false, containerSize: { width, height: 600 }, fitTriggerKey: trigger,
    }), { initialProps: { width: 800, trigger: 0 } });
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await instance.setViewport({ x: 333, y: 444, zoom: 0.5 });
    instance.setViewport.mockClear();
    rerender({ width: 1000, trigger: 0 });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(instance.setViewport).not.toHaveBeenCalled();
    rerender({ width: 1000, trigger: 1 });
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(instance.setViewport).toHaveBeenCalledOnce();
    unmount();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid overview width %s without falling back to an unsafe full-canvas fit', async width => {
    const instance = createInstance();
    const { unmount } = renderHook(() => useBaseReactFlowFitController({ ...createParams(instance),
      containerSize: { width, height: 600 },
    }));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(instance.setViewport).not.toHaveBeenCalled();
    expect(instance.fitView).not.toHaveBeenCalled();
    unmount();
  });

  it('cancels an in-flight paint when unmounted and does not publish a second fit', async () => {
    let finishPaint: (value: boolean) => void = () => { throw Error('paint did not start'); };
    vi.mocked(waitForDiagramControlViewportPaint).mockReturnValueOnce(new Promise(resolve => { finishPaint = resolve; }));
    const instance = createInstance();
    const { unmount } = renderHook(() => useBaseReactFlowFitController(createParams(instance)));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    const signal = vi.mocked(waitForDiagramControlViewportPaint).mock.calls[0]?.[0].signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { finishPaint(true); });
    expect(instance.setViewport).toHaveBeenCalledOnce();
    expect(instance.fitView).not.toHaveBeenCalled();
  });

  it('keeps a failed viewport application from falling back outside the overview contract', async () => {
    const instance = createInstance();
    instance.setViewport.mockResolvedValue(false);
    const { unmount } = renderHook(() => useBaseReactFlowFitController(createParams(instance)));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(instance.setViewport).toHaveBeenCalledOnce();
    expect(instance.fitView).not.toHaveBeenCalled();
    expect(waitForDiagramControlViewportPaint).not.toHaveBeenCalled();
    unmount();
  });
});
