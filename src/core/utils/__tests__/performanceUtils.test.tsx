import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('performanceUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses safeLog to warn about slow renders', async () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(124.5);

    const mod = await import('../performanceUtils');
    const { unmount } = renderHook(() => mod.usePerformanceMonitor('HeavyWidget', true));

    unmount();

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '🐌 HeavyWidget 渲染耗时 24.50ms，可能影响用户体验'
    );
  });

  it('uses safeLog to warn about high memory usage', async () => {
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: {
        usedJSHeapSize: 90 * 1048576,
        totalJSHeapSize: 100 * 1048576,
        jsHeapSizeLimit: 100 * 1048576,
      },
    });

    const mod = await import('../performanceUtils');
    renderHook(() => mod.useMemoryMonitor(true));

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '🚨 内存使用率过高: 90% (90MB/100MB)'
    );
  });
});
