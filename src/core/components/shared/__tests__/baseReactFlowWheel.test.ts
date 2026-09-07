import { describe, expect, it, vi } from 'vitest';

import {
  bindBaseReactFlowWheelHandler,
  createBaseReactFlowWheelHandler,
} from '../baseReactFlowWheel';
import { resolveDiagramInteractiveZoom } from '../diagramInteractiveZoom';
import { MIN_DIAGRAM_FULL_FIT_ZOOM } from '../diagramControlFit';

describe('baseReactFlowWheel', () => {
  it('keeps explicit bounds while gestures below the minimum never snap in the wrong direction', () => {
    expect(resolveDiagramInteractiveZoom(0.06, 0.05, 0.1, 4)).toBe(0.06);
    expect(resolveDiagramInteractiveZoom(0.06, 0.07, 0.1, 4)).toBe(0.07);
    expect(resolveDiagramInteractiveZoom(0.11, 0.09, 0.1, 4)).toBe(0.1);
    expect(resolveDiagramInteractiveZoom(0.06, 0.05, MIN_DIAGRAM_FULL_FIT_ZOOM, 4)).toBe(0.05);
    for (const invalid of [NaN, Infinity, -1, 0]) {
      expect(resolveDiagramInteractiveZoom(invalid, 1, 0.1, 4)).toBeNull();
      expect(resolveDiagramInteractiveZoom(1, invalid, 0.1, 4)).toBeNull();
    }
    expect(resolveDiagramInteractiveZoom(1, 2, 4, 1)).toBeNull();
  });

  it('continues outward from a large-graph overview without jumping to ten percent', () => {
    const setViewport = vi.fn();
    createBaseReactFlowWheelHandler({
      preventScrolling: false, minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 4, sensitivity: 1,
      pane: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
      rfInstance: { getViewport: () => ({ x: 0, y: 0, zoom: 0.06 }), setViewport },
    })({
      clientX: 600, clientY: 400, deltaY: 40, cancelable: true,
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    });
    expect(setViewport.mock.calls[0][0].zoom).toBeLessThan(0.06);
    const next = setViewport.mock.calls[0][0];
    expect((600 - next.x) / next.zoom).toBeCloseTo(600 / 0.06);
  });

  it('ignores events missing wheel coordinates at the listener boundary', () => {
    const setViewport = vi.fn();
    const handler = createBaseReactFlowWheelHandler({
      preventScrolling: true, minZoom: 0.1, maxZoom: 4, sensitivity: 1,
      pane: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
      rfInstance: { getViewport: () => ({ x: 0, y: 0, zoom: 1 }), setViewport },
    });
    handler(new Event('wheel'));
    handler({ clientX: NaN, clientY: 0, deltaY: 1, cancelable: true,
      preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(setViewport).not.toHaveBeenCalled();
  });

  it('keeps the cursor anchor stable while zooming', () => {
    const setViewport = vi.fn();
    const handler = createBaseReactFlowWheelHandler({
      preventScrolling: false,
      minZoom: 0.5,
      maxZoom: 2,
      sensitivity: 1,
      pane: {
        getBoundingClientRect: () => ({ left: 10, top: 20 } as DOMRect),
      },
      rfInstance: {
        getViewport: () => ({ x: 100, y: 50, zoom: 1 }),
        setViewport,
      },
    });

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handler({
      clientX: 210,
      clientY: 120,
      deltaY: -40,
      cancelable: true,
      preventDefault,
      stopPropagation,
    } as unknown as WheelEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(setViewport).toHaveBeenCalledTimes(1);
    const nextViewport = setViewport.mock.calls[0][0];
    expect(nextViewport.zoom).toBeGreaterThan(1);
    expect(nextViewport.x).toBeLessThan(100);
    expect(nextViewport.y).toBeLessThan(50);
  });

  it('prevents scrolling and clamps zoom within bounds', () => {
    const setViewport = vi.fn();
    const handler = createBaseReactFlowWheelHandler({
      preventScrolling: true,
      minZoom: 0.5,
      maxZoom: 1.2,
      sensitivity: 2,
      pane: {
        getBoundingClientRect: () => ({ left: 0, top: 0 } as DOMRect),
      },
      rfInstance: {
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
        setViewport,
      },
    });

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handler({
      clientX: 100,
      clientY: 50,
      deltaY: -1000,
      cancelable: true,
      preventDefault,
      stopPropagation,
    } as unknown as WheelEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(setViewport.mock.calls[0][0].zoom).toBe(1.2);
  });

  it('falls back to non-passive binding when the passive bind throws', () => {
    const addEventListener = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('passive not supported');
      })
      .mockImplementationOnce(() => undefined);
    const removeEventListener = vi.fn();
    const onPassiveBindFailure = vi.fn();
    const handler = vi.fn();

    const unbind = bindBaseReactFlowWheelHandler({
      pane: {
        addEventListener,
        removeEventListener,
      },
      wheelHandler: handler,
      onPassiveBindFailure,
    });

    expect(onPassiveBindFailure).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenNthCalledWith(1, 'wheel', handler, { passive: false });
    expect(addEventListener).toHaveBeenNthCalledWith(2, 'wheel', handler);

    unbind();
    expect(removeEventListener).toHaveBeenCalledWith('wheel', handler);
  });
});
