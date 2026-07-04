import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('errorBoundaryLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values before logging boundary errors', async () => {
    const {
      logAppBoundaryError,
      logPluginBoundaryError,
      logUiBoundaryError,
    } = await import('../errorBoundaryLogging');

    logAppBoundaryError(
      new Error('Authorization: Bearer app-secret'),
      { token: 'details-secret' }
    );
    logUiBoundaryError(
      new Error('api_key=ui-secret'),
      { componentStack: 'stack token=stack-secret' }
    );
    logPluginBoundaryError(
      'plugin-alpha',
      'toolbar',
      new Error('cookie=plugin-secret'),
      { componentStack: 'trace token=plugin-refresh' }
    );

    const payload = JSON.stringify(safeLogState.error.mock.calls);
    expect(payload).toContain('应用程序错误:');
    expect(payload).toContain('错误详情:');
    expect(payload).toContain('Uncaught error:');
    expect(payload).toContain('PluginErrorBoundary');
    expect(payload).toContain('plugin-alpha');
    expect(payload).toContain('toolbar');
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('app-secret');
    expect(payload).not.toContain('details-secret');
    expect(payload).not.toContain('ui-secret');
    expect(payload).not.toContain('stack-secret');
    expect(payload).not.toContain('plugin-secret');
    expect(payload).not.toContain('plugin-refresh');
  });
});
