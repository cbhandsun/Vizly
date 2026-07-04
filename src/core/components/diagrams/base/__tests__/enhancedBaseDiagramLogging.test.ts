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

describe('enhancedBaseDiagramLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts failures and preserves debug metrics for enhanced base diagram logging', async () => {
    const {
      logEnhancedBaseDiagramConfigLoadFailure,
      logEnhancedBaseDiagramThemeLoadFailure,
      logEnhancedBaseDiagramPerformanceMetrics,
      logEnhancedBaseDiagramInvalidConfig,
    } = await import('../enhancedBaseDiagramLogging');

    logEnhancedBaseDiagramConfigLoadFailure(new Error('Authorization: Bearer config-secret'));
    logEnhancedBaseDiagramThemeLoadFailure(new Error('cookie=theme-secret'));
    logEnhancedBaseDiagramPerformanceMetrics({ cacheHitRate: 0.5, memoryUsage: 12.3 });
    logEnhancedBaseDiagramInvalidConfig(
      { token: 'config-token-secret' },
      new Error('api_key=validation-secret')
    );

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const debugPayload = JSON.stringify(safeLogState.debug.mock.calls);

    expect(warnPayload).toContain('[EnhancedBaseDiagram] Failed to load enhanced config, using defaults:');
    expect(warnPayload).toContain('[EnhancedBaseDiagram] Failed to load theme, using fallback:');
    expect(warnPayload).toContain('[EnhancedBaseDiagram] Invalid diagram configuration detected:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('config-secret');
    expect(warnPayload).not.toContain('theme-secret');
    expect(warnPayload).not.toContain('config-token-secret');
    expect(warnPayload).not.toContain('validation-secret');
    expect(debugPayload).toContain('[EnhancedBaseDiagram] Performance metrics:');
    expect(debugPayload).toContain('memoryUsage');
  });
});
