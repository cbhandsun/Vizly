// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  viewport: { x: 0, y: 0, zoom: 0.01 }, minZoom: 1e-9, maxZoom: 4, setViewport: vi.fn(),
}));
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ getViewport: () => h.viewport, getNodes: () => [], setViewport: h.setViewport }),
  useStoreApi: () => ({ getState: () => ({ minZoom: h.minZoom, maxZoom: h.maxZoom }) }),
}));
vi.mock('@/core/config/DiagramConfig', () => ({
  diagramConfigManager: { getConfig: () => ({ canvas: { zoom: { min: 0.05, max: 8, sensitivity: 1 } } }) },
}));
import { useMinimapNavigation } from '../hooks/useMinimapNavigation';

describe('minimap overview continuity', () => {
  const frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames.length = 0;
    h.viewport = { x: 0, y: 0, zoom: 0.01 };
    h.minZoom = 1e-9;
    h.maxZoom = 4;
    h.setViewport.mockReset().mockImplementation(next => { h.viewport = next; });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const renderNavigation = () => {
    const anchor = document.createElement('div');
    const minimap = document.createElement('div');
    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    return renderHook(function useTestNavigation() {
      return useMinimapNavigation({ current: anchor }, { current: minimap }, h.viewport, () => 1);
    });
  };

  it('uses the main canvas limits for wheel and buttons instead of the separate config minimum', () => {
    const { result } = renderNavigation();
    act(() => result.current.handleMiniMapWheel(new WheelEvent('wheel', { clientX: 100, clientY: 50, deltaY: 40 })));
    expect(h.viewport.zoom).toBeLessThan(0.01);
    const before = h.viewport.zoom;
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    act(() => result.current.zoomOut());
    now.mockReturnValue(300);
    act(() => frames.shift()?.(300));
    expect(h.viewport.zoom).toBeCloseTo(before / 1.5);
  });

  it('does not reverse an outward gesture below an explicit canvas minimum', () => {
    h.minZoom = 0.1;
    const { result } = renderNavigation();
    act(() => result.current.handleMiniMapWheel(new WheelEvent('wheel', { clientX: 100, clientY: 50, deltaY: 40 })));
    expect(h.viewport.zoom).toBe(0.01);
    act(() => result.current.handleMiniMapWheel(new WheelEvent('wheel', { clientX: 100, clientY: 50, deltaY: -40 })));
    expect(h.viewport.zoom).toBeGreaterThan(0.01);
    expect(h.viewport.zoom).toBeLessThan(0.1);
  });

  it('lets a newer wheel gesture cancel a pending button animation', () => {
    const { result } = renderNavigation();
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    act(() => result.current.zoomIn());
    act(() => result.current.handleMiniMapWheel(new WheelEvent('wheel', { clientX: 100, clientY: 50, deltaY: 40 })));
    const userViewport = { ...h.viewport };
    h.setViewport.mockClear();
    now.mockReturnValue(300);
    act(() => frames.shift()?.(300));
    expect(h.viewport).toEqual(userViewport);
    expect(h.setViewport).not.toHaveBeenCalled();
  });

  it('yields animation ownership to an external pan or fit between frames', () => {
    const { result } = renderNavigation();
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    act(() => result.current.zoomIn());
    now.mockReturnValue(50);
    act(() => frames.shift()?.(50));
    const userViewport = { x: 900, y: 450, zoom: 0.3 };
    h.viewport = userViewport;
    h.setViewport.mockClear();
    now.mockReturnValue(300);
    act(() => frames.shift()?.(300));
    expect(h.viewport).toEqual(userViewport);
    expect(h.setViewport).not.toHaveBeenCalled();
  });

  it('cleans up pending animation on unmount and respects explicit bounds when resetting', () => {
    h.maxZoom = 0.5;
    const { result, unmount } = renderNavigation();
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    act(() => result.current.resetZoom());
    now.mockReturnValue(300);
    act(() => frames.shift()?.(300));
    expect(h.viewport.zoom).toBe(0.5);
    act(() => result.current.zoomOut());
    unmount();
    h.setViewport.mockClear();
    now.mockReturnValue(600);
    act(() => frames.shift()?.(600));
    expect(h.setViewport).not.toHaveBeenCalled();
  });
});
