import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('viewportStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('redacts listener and ui scale failures', async () => {
    const viewportStore = await import('../viewportStore');

    viewportStore.setLastViewport({ x: 12, y: 24, zoom: 2 });
    viewportStore.subscribeViewport(() => {
      throw new Error('Authorization: Bearer initial-secret');
    });

    const listener = vi.fn(() => {
      throw new Error('cookie=notify-secret');
    });
    viewportStore.subscribeViewport(listener);
    viewportStore.setLastViewport({ x: 20, y: 40, zoom: 1.5 });

    const querySpy = vi.spyOn(document, 'querySelector').mockImplementation(() => {
      throw new Error('api_key=query-secret');
    });
    expect(viewportStore.screenToFlowPositionCssZoomAware(10, 20, { x: 0, y: 0, zoom: 1 })).toEqual({ x: 10, y: 20 });
    querySpy.mockRestore();

    const elementSpy = vi.spyOn(document, 'getElementById').mockImplementation(() => {
      throw new Error('token=scale-secret');
    });
    expect(viewportStore.getUiScale()).toBe(1);
    elementSpy.mockRestore();

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[viewportStore] notifyInitialListener failed:');
    expect(warnPayload).toContain('[viewportStore] notifyListener failed:');
    expect(warnPayload).toContain('[viewportStore] screenToFlowPositionCssZoomAware failed:');
    expect(warnPayload).toContain('[viewportStore] getUiScale failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('initial-secret');
    expect(warnPayload).not.toContain('notify-secret');
    expect(warnPayload).not.toContain('query-secret');
    expect(warnPayload).not.toContain('scale-secret');
  });

  it('persists and restores the last viewport only for the requested scope', async () => {
    const viewportStore = await import('../viewportStore');
    const viewport = { x: -80, y: 32, zoom: 1 };

    expect(viewportStore.persistLastViewport(viewport, 'diagram-a:page-1')).toBe(true);

    vi.resetModules();
    const reloadedViewportStore = await import('../viewportStore');
    expect(reloadedViewportStore.getLastViewport('diagram-a:page-1')).toEqual(viewport);
    expect(reloadedViewportStore.getLastViewport('diagram-a:page-2')).toBeNull();
  });

  it('debounces continuous viewport changes and persists the latest value', async () => {
    vi.useFakeTimers();
    const viewportStore = await import('../viewportStore');
    const first = { x: -80, y: 32, zoom: 0.8 };
    const latest = { x: -20, y: 12, zoom: 1 };

    expect(viewportStore.schedulePersistLastViewport(first, 'diagram-a:page-1')).toBe(true);
    expect(viewportStore.schedulePersistLastViewport(latest, 'diagram-a:page-1')).toBe(true);
    expect(sessionStorage.length).toBe(0);

    await vi.advanceTimersByTimeAsync(160);
    vi.resetModules();
    const reloadedViewportStore = await import('../viewportStore');
    expect(reloadedViewportStore.getLastViewport('diagram-a:page-1')).toEqual(latest);
  });

  it('rejects invalid viewport data and contains storage failures', async () => {
    const viewportStore = await import('../viewportStore');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer storage-secret');
    });

    expect(viewportStore.persistLastViewport({ x: 0, y: 0, zoom: 0 }, 'diagram-a:page-1')).toBe(false);
    expect(viewportStore.persistLastViewport({ x: 0, y: 0, zoom: 1 }, 'diagram-a:page-1')).toBe(false);
    expect(setItem).toHaveBeenCalledTimes(1);

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[viewportStore] persistLastViewport failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('storage-secret');
  });
});
