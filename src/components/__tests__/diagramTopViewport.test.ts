// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDiagramBackToTopViewport,
  bindDiagramTopControlInterceptor,
  clampDiagramTopAlignZoom,
  clearDiagramViewportSessionStorage,
  coerceDiagramTopSidebarOffset,
  computeDiagramTopAlignedBounds,
  computeDiagramTopAlignedViewport,
  MAX_DIAGRAM_SIDEBAR_OFFSET,
  migrateStaleDesktopViewportSessionStorage,
  MIN_DIAGRAM_TOP_ALIGN_ZOOM,
  resolveDiagramTopViewportLayout,
  TOP_FIT_SESSION_MIGRATION_KEY,
  VIEWPORT_SESSION_STORAGE_PREFIX,
} from '../diagramTopViewport';

describe('diagramTopViewport', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--left-sidebar-offset');
    document.documentElement.style.removeProperty('--right-sidebar-offset');
    delete (window as Window & { reactFlowInstance?: unknown }).reactFlowInstance;
  });

  describe('computeDiagramTopAlignedBounds', () => {
    it('computes bounds for visible nodes and expands for edges and parent offsets', () => {
      const nodes = [
        {
          id: 'group-1',
          position: { x: 100, y: 50 },
          measured: { width: 400, height: 300 },
        },
        {
          id: 'child-1',
          parentId: 'group-1',
          position: { x: 350, y: 260 },
          style: { width: '160px', height: '80px' },
        },
        {
          id: 'hidden-node',
          hidden: true,
          position: { x: -5000, y: -5000 },
          width: 200,
          height: 100,
        },
      ];
      const edges = [
        {
          id: 'edge-1',
          type: 'advancedSmartStepEdge',
          label: 'Flow',
          style: { strokeWidth: 4 },
          data: {
            waypoints: [{ x: 80, y: 20 }],
          },
        },
      ];

      const bounds = computeDiagramTopAlignedBounds(nodes, edges);
      expect(bounds).not.toBeNull();
      expect(bounds?.minX).toBe(80 - (8 + 16));
      expect(bounds?.minY).toBe(20 - (8 + 20 + 20));
      expect(bounds?.maxX).toBe(610 + (8 + 16));
      expect(bounds?.maxY).toBe(390 + (8 + 20));
      expect(bounds?.width).toBe((610 + 24) - (80 - 24));
    });

    it('returns null for empty, non-array, hidden-only, or invalid coordinate inputs', () => {
      expect(computeDiagramTopAlignedBounds([])).toBeNull();
      expect(computeDiagramTopAlignedBounds([
        { id: 'n1', hidden: true, position: { x: 0, y: 0 } },
        { id: 'n2', style: { display: 'none' }, position: { x: 10, y: 10 } },
        { id: 'n3', style: { visibility: 'hidden' }, position: { x: 20, y: 20 } },
      ])).toBeNull();
      expect(computeDiagramTopAlignedBounds([
        { id: 'bad', position: { x: Number.NaN, y: Number.POSITIVE_INFINITY } },
      ])).toBeNull();
    });

    it('guards against circular parentId chains without infinite loops', () => {
      const bounds = computeDiagramTopAlignedBounds([
        { id: 'a', parentId: 'b', position: { x: 10, y: 20 }, width: 100, height: 50 },
        { id: 'b', parentId: 'a', position: { x: 30, y: 40 }, width: 100, height: 50 },
      ]);
      expect(bounds).not.toBeNull();
      expect(Number.isFinite(bounds?.minX)).toBe(true);
      expect(Number.isFinite(bounds?.minY)).toBe(true);
    });
  });

  describe('resolveDiagramTopViewportLayout & coerceDiagramTopSidebarOffset', () => {
    it('coerces sidebar offsets safely and caps extreme values', () => {
      expect(coerceDiagramTopSidebarOffset('320px', 76)).toBe(320);
      expect(coerceDiagramTopSidebarOffset(-20, 76)).toBe(76);
      expect(coerceDiagramTopSidebarOffset('invalid', 60)).toBe(60);
      expect(coerceDiagramTopSidebarOffset(5000, 60)).toBe(MAX_DIAGRAM_SIDEBAR_OFFSET);
    });

    it('uses mobile safe area on narrow viewports and desktop safe area on wide viewports', () => {
      const mobile = resolveDiagramTopViewportLayout({ viewportWidth: 600 });
      expect(mobile.safeArea).toEqual({ top: 104, right: 20, bottom: 148, left: 20 });
      expect(mobile.padding).toBe(24);

      const desktop = resolveDiagramTopViewportLayout({
        viewportWidth: 1440,
        leftSidebarOffset: '280px',
        rightSidebarOffset: '64px',
      });
      expect(desktop.safeArea).toEqual({ top: 84, right: 64, bottom: 64, left: 280 });
      expect(desktop.padding).toBe(16);
    });
  });

  describe('computeDiagramTopAlignedViewport', () => {
    it('fits wide diagrams across the available width and aligns top edge below toolbar', () => {
      const viewport = computeDiagramTopAlignedViewport({
        bounds: {
          minX: 100,
          minY: 200,
          maxX: 2500,
          maxY: 1800,
          width: 2400,
          height: 1600,
        },
        viewportWidth: 1400,
        viewportHeight: 900,
        safeArea: { top: 84, right: 60, bottom: 64, left: 76 },
        padding: 16,
      });

      expect(viewport).not.toBeNull();
      const availableWidth = 1400 - 76 - 60 - 32; // 1232
      const expectedZoom = clampDiagramTopAlignZoom(availableWidth / 2400);
      expect(viewport?.zoom).toBeCloseTo(expectedZoom, 6);
      // Top of content (minY = 200) must map to safeArea.top + padding (84 + 16 = 100)
      expect((viewport?.y ?? 0) + 200 * (viewport?.zoom ?? 0)).toBeCloseTo(100, 5);
    });

    it('clamps zoom to 1x and centers horizontally for narrow tall diagrams', () => {
      const viewport = computeDiagramTopAlignedViewport({
        bounds: {
          minX: 50,
          minY: 300,
          maxX: 450,
          maxY: 2800,
          width: 400,
          height: 2500,
        },
        viewportWidth: 1400,
        viewportHeight: 900,
        safeArea: { top: 84, right: 60, bottom: 64, left: 76 },
        padding: 16,
      });

      expect(viewport).not.toBeNull();
      expect(viewport?.zoom).toBe(1);
      // Horizontally centered within availableWidth (1232):
      // effectiveLeft = 76 + 16 = 92; centeredX = (1232 - 400) / 2 = 416; x = 92 + 416 - 50 = 458
      expect(viewport?.x).toBeCloseTo(458, 5);
      // Top aligned: y = 84 + 16 - 300 * 1 = -200
      expect(viewport?.y).toBeCloseTo(-200, 5);
    });

    it('rejects invalid or non-positive geometry inputs', () => {
      expect(clampDiagramTopAlignZoom(Number.NaN)).toBe(MIN_DIAGRAM_TOP_ALIGN_ZOOM);
      expect(computeDiagramTopAlignedViewport({
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 100 },
        viewportWidth: 1200,
        viewportHeight: 800,
        safeArea: { top: 84, right: 60, bottom: 64, left: 76 },
      })).toBeNull();
    });
  });

  describe('applyDiagramBackToTopViewport', () => {
    it('animates active ReactFlow instance to the top-aligned viewport when container is ready', () => {
      const container = document.createElement('div');
      container.id = 'diagram-flow-1';
      container.className = 'diagram-container';
      Object.defineProperty(container, 'clientWidth', { value: 1400, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 900, configurable: true });
      document.body.appendChild(container);

      const setViewport = vi.fn();
      (window as Window & { reactFlowInstance?: unknown }).reactFlowInstance = {
        getNodes: () => [],
        getEdges: () => [],
        setViewport,
      };
      const fallbackBackToTop = vi.fn();

      const applied = applyDiagramBackToTopViewport({
        diagramId: 'flow-1',
        readSnapshot: () => ({
          nodes: [
            { id: 'n1', position: { x: 100, y: 240 }, width: 400, height: 120 },
            { id: 'n2', position: { x: 100, y: 1200 }, width: 400, height: 120 },
          ],
          edges: [],
        }),
        fallbackBackToTop,
      });

      expect(applied).toBe(true);
      expect(fallbackBackToTop).not.toHaveBeenCalled();
      expect(setViewport).toHaveBeenCalledTimes(1);
      expect(setViewport).toHaveBeenCalledWith(
        expect.objectContaining({
          zoom: 1,
          y: 84 + 16 - 240,
        }),
        { duration: 350 },
      );
    });

    it('falls back to fallbackBackToTop when container or instance is unavailable', () => {
      const fallbackBackToTop = vi.fn();
      const applied = applyDiagramBackToTopViewport({
        diagramId: 'missing-diagram',
        readSnapshot: () => ({ nodes: [{ id: 'n1', position: { x: 0, y: 0 } }] }),
        fallbackBackToTop,
      });

      expect(applied).toBe(false);
      expect(fallbackBackToTop).toHaveBeenCalledTimes(1);
    });
  });

  describe('sessionStorage viewport migration & cleanup', () => {
    it('migrates stale v1 viewports once and preserves subsequent viewports', () => {
      window.sessionStorage.clear();
      window.sessionStorage.setItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-1`, '{"x":0,"y":0,"zoom":1.15}');
      window.sessionStorage.setItem('other:key', 'keep');

      expect(migrateStaleDesktopViewportSessionStorage(window.sessionStorage)).toBe(true);
      expect(window.sessionStorage.getItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-1`)).toBeNull();
      expect(window.sessionStorage.getItem(TOP_FIT_SESSION_MIGRATION_KEY)).toBe('1');
      expect(window.sessionStorage.getItem('other:key')).toBe('keep');

      // Subsequent calls are no-ops so user-saved viewports survive reload
      window.sessionStorage.setItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-1`, '{"x":10,"y":20,"zoom":0.8}');
      expect(migrateStaleDesktopViewportSessionStorage(window.sessionStorage)).toBe(false);
      expect(window.sessionStorage.getItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-1`)).toBe('{"x":10,"y":20,"zoom":0.8}');
    });

    it('clears only matching diagram viewport entries when switching templates', () => {
      window.sessionStorage.clear();
      window.sessionStorage.setItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-1`, '{"x":0,"y":0,"zoom":1}');
      window.sessionStorage.setItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-1%3Apage-1`, '{"x":0,"y":0,"zoom":1}');
      window.sessionStorage.setItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-2`, '{"x":0,"y":0,"zoom":1}');

      const removed = clearDiagramViewportSessionStorage(window.sessionStorage, 'flow-1');
      expect(removed).toBe(2);
      expect(window.sessionStorage.getItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-1`)).toBeNull();
      expect(window.sessionStorage.getItem(`${VIEWPORT_SESSION_STORAGE_PREFIX}flow-2`)).not.toBeNull();
    });
  });

  describe('bindDiagramTopControlInterceptor', () => {
    it('intercepts startup action="top" on desktop, prevents single-node reading zoom, and applies width-fit top view', () => {
      vi.useFakeTimers();
      try {
        const container = document.createElement('div');
        container.id = 'diagram-flow-1';
        container.className = 'diagram-container';
        const pane = document.createElement('div');
        pane.className = 'react-flow';
        container.appendChild(pane);
        Object.defineProperty(container, 'clientWidth', { value: 1440, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 900, configurable: true });
        Object.defineProperty(pane, 'clientWidth', { value: 1440, configurable: true });
        Object.defineProperty(pane, 'clientHeight', { value: 900, configurable: true });
        document.body.appendChild(container);

        const setViewport = vi.fn();
        (window as Window & { reactFlowInstance?: unknown }).reactFlowInstance = {
          getNodes: () => [
            { id: 'n1', position: { x: 100, y: 200 }, width: 1800, height: 120 },
          ],
          getEdges: () => [],
          setViewport,
        };

        const bubbleListener = vi.fn();
        window.addEventListener('diagramControl', bubbleListener);
        const unbind = bindDiagramTopControlInterceptor({
          diagramId: 'flow-1',
        });

        window.dispatchEvent(new CustomEvent('diagramControl', {
          detail: { action: 'top', diagramId: 'flow-1' },
        }));

        expect(bubbleListener).not.toHaveBeenCalled();
        expect(setViewport).toHaveBeenCalledTimes(1);
        const firstViewport = setViewport.mock.calls[0]?.[0] as { x: number; y: number; zoom: number };
        expect(firstViewport.zoom).toBeLessThan(1);

        // User interaction before 140ms cancels follow-up refinement
        pane.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        vi.advanceTimersByTime(200);
        expect(setViewport).toHaveBeenCalledTimes(1);

        unbind();
        window.removeEventListener('diagramControl', bubbleListener);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
