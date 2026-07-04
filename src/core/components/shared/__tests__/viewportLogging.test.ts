import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
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
});
