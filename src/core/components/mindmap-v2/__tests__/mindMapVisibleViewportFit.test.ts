import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MindElixirInstance } from 'mind-elixir';
import {
  computeMindMapViewportFitPlan,
  fitMindMapToVisibleViewport,
  resolveMindMapVisibleRect,
} from '../mindMapVisibleViewportFit';

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  top,
  width,
  x: left,
  y: top,
  toJSON: () => ({}),
});

const createMind = ({
  containerRect = rect(0, 60, 820, 960),
  nodesRect = rect(100, 350, 630, 340),
  nodesSize = { width: 630, height: 340 },
  scaleMax = 3,
  scaleMin = 0.2,
} = {}) => {
  const mind = {
    container: {
      getBoundingClientRect: vi.fn(() => containerRect),
    },
    move: vi.fn(),
    nodes: {
      getBoundingClientRect: vi.fn(() => nodesRect),
      offsetHeight: nodesSize.height,
      offsetWidth: nodesSize.width,
    },
    scale: vi.fn(),
    scaleMax,
    scaleMin,
    toCenter: vi.fn(),
  } as unknown as MindElixirInstance;

  return mind;
};

describe('mind map visible viewport fitting', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('clips the usable viewport only when a right-edge occluder intersects the canvas', () => {
    expect(resolveMindMapVisibleRect(rect(0, 60, 820, 960), rect(512, 60, 308, 960)))
      .toMatchObject({ left: 0, right: 512, width: 512 });
    expect(resolveMindMapVisibleRect(rect(0, 60, 820, 960), rect(300, 0, 100, 40)))
      .toMatchObject({ left: 0, right: 820, width: 820 });
    expect(resolveMindMapVisibleRect(rect(0, 60, 820, 960), rect(300, 60, 100, 960)))
      .toMatchObject({ left: 0, right: 820, width: 820 });
  });

  it('rejects empty and invalid geometry instead of publishing a false fit', () => {
    expect(resolveMindMapVisibleRect(rect(0, 0, 0, 100))).toBeNull();
    expect(computeMindMapViewportFitPlan({
      contentHeight: 100,
      contentWidth: Number.NaN,
      maxScale: 3,
      minScale: 0.2,
      visibleRect: rect(0, 0, 500, 500),
    })).toBeNull();
    expect(computeMindMapViewportFitPlan({
      contentHeight: 100,
      contentWidth: 100,
      maxScale: 3,
      minScale: 0.2,
      padding: 300,
      visibleRect: rect(0, 0, 500, 500),
    })).toBeNull();
  });

  it('uses safe padding and respects the commercial zoom bounds', () => {
    expect(computeMindMapViewportFitPlan({
      contentHeight: 340,
      contentWidth: 630,
      maxScale: 3,
      minScale: 0.2,
      visibleRect: rect(0, 60, 512, 960),
    })?.scale).toBeCloseTo(448 / 630);
    expect(computeMindMapViewportFitPlan({
      contentHeight: 20,
      contentWidth: 20,
      maxScale: 3,
      minScale: 0.2,
      visibleRect: rect(0, 0, 1000, 1000),
    })?.scale).toBe(1);
    expect(computeMindMapViewportFitPlan({
      contentHeight: 10_000,
      contentWidth: 10_000,
      maxScale: 3,
      minScale: 0.2,
      visibleRect: rect(0, 0, 500, 500),
    })?.scale).toBe(0.2);
  });

  it('fits and centers content inside the sidebar-free interaction area', () => {
    const sidebar = document.createElement('aside');
    sidebar.className = 'designer-right-sidebar';
    sidebar.getBoundingClientRect = vi.fn(() => rect(512, 60, 308, 960));
    document.body.appendChild(sidebar);
    const mind = createMind({ nodesRect: rect(0, 350, 448, 340) });

    const result = fitMindMapToVisibleViewport(mind);

    expect(mind.scale).toHaveBeenCalledWith(expect.closeTo(448 / 630));
    expect(mind.toCenter).toHaveBeenCalledOnce();
    expect(mind.move).toHaveBeenCalledWith(32, 20, true);
    expect(result).toMatchObject({ mode: 'fit', dx: 32, dy: 20 });
  });

  it('ignores a hidden sidebar and centers against the full canvas', () => {
    const sidebar = document.createElement('aside');
    sidebar.className = 'designer-right-sidebar';
    sidebar.style.display = 'none';
    sidebar.getBoundingClientRect = vi.fn(() => rect(512, 60, 308, 960));
    document.body.appendChild(sidebar);
    const mind = createMind({ nodesRect: rect(95, 370, 630, 340) });

    const result = fitMindMapToVisibleViewport(mind);

    expect(mind.scale).toHaveBeenCalledWith(1);
    expect(mind.move).not.toHaveBeenCalled();
    expect(result?.visibleRect).toMatchObject({ left: 0, right: 820 });
  });

  it('falls back to vendor centering when container or content dimensions are unavailable', () => {
    const mind = createMind({ nodesSize: { width: 0, height: 340 } });

    expect(fitMindMapToVisibleViewport(mind)).toBeNull();
    expect(mind.toCenter).toHaveBeenCalledOnce();
    expect(mind.scale).not.toHaveBeenCalled();
    expect(mind.move).not.toHaveBeenCalled();
  });
});
