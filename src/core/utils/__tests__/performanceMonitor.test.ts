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

describe('performanceMonitor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubGlobal('setInterval', vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>));
    vi.spyOn(window, 'addEventListener').mockImplementation(() => undefined);
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'loading',
    });
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('redacts development error and performance reports before logging them', async () => {
    const mod = await import('../performanceMonitor');

    mod.recordError(
      new Error('Authorization: Bearer live-token'),
      { apiKey: 'test-api-key-placeholder-0003', requestId: 'req-1' }
    );
    mod.recordComponentRender('Widget', 20);
    mod.performanceMonitor.flush();

    expect(safeLogState.error).toHaveBeenCalledWith(
      'Error Report:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
        additionalData: expect.objectContaining({
          apiKey: '[redacted]',
          requestId: 'req-1',
        }),
      })
    );

    expect(safeLogState.info).toHaveBeenCalledWith('Performance: Component Widget render time: 20ms');
    expect(safeLogState.info).toHaveBeenCalledWith(
      'Performance Report:',
      expect.objectContaining({
        metrics: expect.objectContaining({
          componentRenderTime: 20,
        }),
      })
    );

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const infoPayload = JSON.stringify(safeLogState.info.mock.calls);
    expect(errorPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('live-token');
    expect(infoPayload).not.toContain('test-api-key-placeholder-0003');
  });
});
