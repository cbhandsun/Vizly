import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('usePanelZoom', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach((mock) => mock.mockReset());
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('falls back to the default scale when stored zoom cannot be read', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer zoom-read-secret');
    });

    const { usePanelZoom } = await import('../usePanelZoom');
    const { result } = renderHook(() => usePanelZoom({
      storageKey: 'panel.zoom',
      defaultScale: 1.1,
      minScale: 0.7,
      maxScale: 1.4,
    }));

    expect(result.current.scale).toBe(1.1);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[usePanelZoom] Failed to read "panel.zoom":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('zoom-read-secret');

    getItemSpy.mockRestore();
  });

  it('keeps runtime zoom updates when persistence writes fail', async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'panel.zoom') {
        throw new Error('api_key=zoom-write-secret');
      }
      return originalSetItem.call(this, key, value);
    });

    const { usePanelZoom } = await import('../usePanelZoom');
    const { result } = renderHook(() => usePanelZoom({
      storageKey: 'panel.zoom',
      defaultScale: 1,
      minScale: 0.7,
      maxScale: 1.4,
    }));

    act(() => {
      result.current.setPercent(120);
    });

    expect(result.current.scale).toBe(1.2);
    expect(localStorage.getItem('panel.zoom')).toBeNull();
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[usePanelZoom] Failed to write "panel.zoom":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).not.toContain('zoom-write-secret');

    setItemSpy.mockRestore();
  });
});
