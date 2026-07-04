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

function stringifyMockArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

describe('themePerformanceLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts optimization strategy failures before logging', async () => {
    const { logThemeOptimizationStrategyFailure } = await import('../themePerformanceLogging');

    logThemeOptimizationStrategyFailure('cache', new Error('Authorization: Bearer theme-secret'));

    const warnPayload = safeLogState.warn.mock.calls.flat().map(stringifyMockArg).join('\n');
    expect(warnPayload).toContain('[ThemePerformanceOptimizer] Optimization strategy "cache" failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('theme-secret');
  });
});
