import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('useUIState', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('redacts restore and persist failures before warning', async () => {
    const panelRef = {
      current: {
        collapse: vi.fn(),
        expand: vi.fn(),
      },
    };

    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer live-token');
    });

    const { useUIState } = await import('../useUIState');
    const { result } = renderHook(() => useUIState(panelRef));

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[useUIState.restoreMenuCollapseState] Failed to read "singleMenuCollapsed":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('live-token');

    getItemSpy.mockRestore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('api_key=test-api-key-placeholder-0005');
    });

    act(() => {
      result.current.handleToggleCollapse();
      vi.runAllTimers();
    });

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[useUIState.persistMenuCollapseState] Failed to write "singleMenuCollapsed":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).not.toContain('test-api-key-placeholder-0005');
    expect(panelRef.current.collapse).toHaveBeenCalled();
  });
});
