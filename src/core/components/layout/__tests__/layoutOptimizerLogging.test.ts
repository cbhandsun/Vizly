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

describe('layoutOptimizerLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts width and height fallback errors before logging', async () => {
    const {
      logLayoutOptimizerNodeWidthFallback,
      logLayoutOptimizerNodeHeightFallback,
    } = await import('../layoutOptimizerLogging');

    logLayoutOptimizerNodeWidthFallback(new Error('cookie=width-secret'));
    logLayoutOptimizerNodeHeightFallback(new Error('api_key=height-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[LayoutOptimizer] Node width calculation failed, using fallback:');
    expect(warnPayload).toContain('[LayoutOptimizer] Node height calculation failed, using default:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('width-secret');
    expect(warnPayload).not.toContain('height-secret');
  });
});
