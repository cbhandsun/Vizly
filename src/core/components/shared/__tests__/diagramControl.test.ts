import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clampDiagramFullFitZoom,
    computeDiagramFitViewport,
    coerceDiagramSidebarOffset,
    DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET,
    MAX_DIAGRAM_FULL_FIT_ZOOM,
  MIN_DIAGRAM_FULL_FIT_ZOOM,
  resolveDiagramFitLayout,
} from '../diagramControlFit';
import {
  claimLayoutCommitFitRequest,
  DIAGRAM_CONTROL_REQUEST_EVENT,
  requestLayoutCommitFit,
  resolveLayoutCommitFitRequest,
} from '../diagramControlRequest';

const { logDiagramControlDispatchFailure } = vi.hoisted(() => ({
  logDiagramControlDispatchFailure: vi.fn(),
}));

vi.mock('../diagramControlLogging', () => ({
  logDiagramControlDispatchFailure,
}));

describe('diagramControl', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    logDiagramControlDispatchFailure.mockReset();
  });

  it('logs dispatch failures without throwing', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('Authorization: Bearer diagram-control-secret');
    });

    const { dispatchDiagramControl } = await import('../diagramControl');

    expect(() => dispatchDiagramControl('fit', 'diagram-1')).not.toThrow();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(logDiagramControlDispatchFailure).toHaveBeenCalledWith(
      'fit',
      expect.any(Error)
    );
  });

  it('fits an overview below reading-mode zoom limits', () => {
    expect(clampDiagramFullFitZoom(0.3)).toBeCloseTo(0.294);
    expect(clampDiagramFullFitZoom(0.01)).toBeCloseTo(0.0098);
  });

  it.each([
    [9845, 3304, 1948, 1037],
    [3304, 9845, 1948, 1037],
    [1_000_000, 1_000_000, 390, 844],
  ])('contains a %i by %i graph in a %i by %i viewport', (width, height, vw, vh) => {
    const layout = resolveDiagramFitLayout({ viewportWidth: vw, leftSidebarOffset: 76, rightSidebarOffset: 60 });
    const bounds = { minX: -200, minY: -400, width, height };
    const result = computeDiagramFitViewport({ bounds, viewportWidth: vw, viewportHeight: vh, ...layout });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.x + bounds.minX * result.zoom).toBeGreaterThanOrEqual(layout.safeArea.left + layout.padding);
    expect(result.y + bounds.minY * result.zoom).toBeGreaterThanOrEqual(layout.safeArea.top + layout.padding);
    expect(result.x + (bounds.minX + width) * result.zoom).toBeLessThanOrEqual(vw - layout.safeArea.right - layout.padding);
    expect(result.y + (bounds.minY + height) * result.zoom).toBeLessThanOrEqual(vh - layout.safeArea.bottom - layout.padding);
  });

  it('clamps invalid and extreme full-fit zoom values', () => {
    expect(clampDiagramFullFitZoom(Number.NaN)).toBe(MIN_DIAGRAM_FULL_FIT_ZOOM);
    expect(clampDiagramFullFitZoom(Number.POSITIVE_INFINITY)).toBe(MIN_DIAGRAM_FULL_FIT_ZOOM);
    expect(clampDiagramFullFitZoom(-1)).toBe(MIN_DIAGRAM_FULL_FIT_ZOOM);
    expect(clampDiagramFullFitZoom(100)).toBe(MAX_DIAGRAM_FULL_FIT_ZOOM);
  });

  it('uses the actual bounded sidebar offset when fitting editor content', () => {
    expect(coerceDiagramSidebarOffset('60px')).toBe(60);
    expect(coerceDiagramSidebarOffset('316')).toBe(316);
    expect(coerceDiagramSidebarOffset('')).toBe(DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET);
    expect(coerceDiagramSidebarOffset('not-a-size')).toBe(DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET);
    expect(coerceDiagramSidebarOffset(-1)).toBe(DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET);
    expect(coerceDiagramSidebarOffset(50_000)).toBe(800);
  });

  it('computes a centered viewport inside the real panel-safe canvas area', () => {
    expect(computeDiagramFitViewport({
      bounds: { minX: 100, minY: 50, width: 800, height: 400 },
      viewportWidth: 1_280,
      viewportHeight: 720,
      safeArea: { top: 84, right: 320, bottom: 64, left: 68 },
      padding: 8,
    })).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
      zoom: expect.any(Number),
    }));
  });

  it('returns unhandled when no bridge claims a layout commit fit', async () => {
    const controller = new AbortController();
    await expect(requestLayoutCommitFit({ signal: controller.signal })).resolves.toBe('unhandled');
  });

  it('keeps request capabilities private and resolves a claimed request once', async () => {
    const controller = new AbortController();
    let claimedEvent: Event | null = null;
    const listener = (event: Event) => {
      claimedEvent = event;
      const request = claimLayoutCommitFitRequest(event);
      expect(request).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect((event as CustomEvent).detail).not.toHaveProperty('resolve');
    };
    window.addEventListener(DIAGRAM_CONTROL_REQUEST_EVENT, listener);

    const result = requestLayoutCommitFit({ diagramId: 'diagram-1', signal: controller.signal });
    expect(claimedEvent).not.toBeNull();
    expect(resolveLayoutCommitFitRequest(claimedEvent!, 'applied')).toBe(true);
    expect(resolveLayoutCommitFitRequest(claimedEvent!, 'failed')).toBe(false);
    await expect(result).resolves.toBe('applied');

    window.removeEventListener(DIAGRAM_CONTROL_REQUEST_EVENT, listener);
  });

  it('rejects forged events and cancels or times out claimed requests', async () => {
    expect(claimLayoutCommitFitRequest(new CustomEvent(DIAGRAM_CONTROL_REQUEST_EVENT, {
      detail: { schema: 'vizly-diagram-control-request-v1', action: 'fit', mode: 'layout-commit' },
    }))).toBeNull();

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(requestLayoutCommitFit({ signal: preAborted.signal })).resolves.toBe('cancelled');

    vi.useFakeTimers();
    const controller = new AbortController();
    const listener = (event: Event) => { claimLayoutCommitFitRequest(event); };
    window.addEventListener(DIAGRAM_CONTROL_REQUEST_EVENT, listener);
    const timedOut = requestLayoutCommitFit({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(500);
    await expect(timedOut).resolves.toBe('timed-out');
    window.removeEventListener(DIAGRAM_CONTROL_REQUEST_EVENT, listener);
  });

  it('reserves mobile chrome and quick-action space when fitting content', () => {
    const layout = resolveDiagramFitLayout({
      viewportWidth: 390,
      leftSidebarOffset: '76px',
      rightSidebarOffset: '316px',
    });
    expect(layout).toEqual({
      safeArea: { top: 104, right: 20, bottom: 148, left: 20 },
      padding: 32,
    });

    const bounds = { minX: 0, minY: 0, width: 600, height: 500 };
    const viewport = computeDiagramFitViewport({
      bounds,
      viewportWidth: 390,
      viewportHeight: 844,
      ...layout,
    });
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    expect(viewport.x + bounds.minX * viewport.zoom).toBeGreaterThanOrEqual(
      layout.safeArea.left + layout.padding,
    );
    expect(viewport.y + bounds.minY * viewport.zoom).toBeGreaterThanOrEqual(
      layout.safeArea.top + layout.padding,
    );
    expect(viewport.x + (bounds.minX + bounds.width) * viewport.zoom).toBeLessThanOrEqual(
      390 - layout.safeArea.right - layout.padding,
    );
    expect(viewport.y + (bounds.minY + bounds.height) * viewport.zoom).toBeLessThanOrEqual(
      844 - layout.safeArea.bottom - layout.padding,
    );
  });

  it('rejects invalid viewport geometry', () => {
    expect(computeDiagramFitViewport({
      bounds: { minX: 0, minY: 0, width: 0, height: 10 },
      viewportWidth: 1_280,
      viewportHeight: 720,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    })).toBeNull();
    expect(computeDiagramFitViewport({
      bounds: { minX: 0, minY: 0, width: 100, height: 100 },
      viewportWidth: 100, viewportHeight: 100,
      safeArea: { top: 70, right: 0, bottom: 70, left: 0 },
    })).toBeNull();
  });
});
