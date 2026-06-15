import { afterEach, describe, expect, it, vi } from 'vitest';

describe('globalErrorHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('loads development notifications only when an error is handled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const toast = vi.fn();
    const log = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listeners: Partial<Record<string, EventListenerOrEventListenerObject[]>> = {};
    const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners[type] = [...(listeners[type] || []), listener];
    });

    vi.stubGlobal('addEventListener', addEventListener);
    vi.doMock('../errorLogger', () => ({
      errorLogger: { log },
    }));
    vi.doMock('../errorNotification', () => ({
      errorNotification: { toast },
    }));

    const { initGlobalErrorHandling } = await import('../globalErrorHandler');

    initGlobalErrorHandling();

    expect(toast).not.toHaveBeenCalled();
    expect(listeners.error).toHaveLength(1);

    const event = new ErrorEvent('error', {
      error: new Error('boom'),
      message: 'boom',
    });
    Object.defineProperty(event, 'target', { value: window });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    (listeners.error![0] as EventListener)(event);

    await vi.waitFor(() => {
      expect(toast).toHaveBeenCalledWith('全局错误: boom');
    });
    expect(consoleError).toHaveBeenCalledWith('Global error:', expect.objectContaining({
      message: 'boom',
    }));
    expect(log).toHaveBeenCalledWith(expect.any(Error), {
      level: 'error',
      source: 'globalError',
    });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('redacts sensitive values before writing global errors to console', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const log = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listeners: Partial<Record<string, EventListenerOrEventListenerObject[]>> = {};
    const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners[type] = [...(listeners[type] || []), listener];
    });

    vi.stubGlobal('addEventListener', addEventListener);
    vi.doMock('../errorLogger', () => ({
      errorLogger: { log },
    }));

    const { initGlobalErrorHandling } = await import('../globalErrorHandler');

    initGlobalErrorHandling();

    const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
      reason: new Error('request failed with Authorization: Bearer live-token'),
      promise: Promise.resolve(),
    });
    rejectionEvent.preventDefault();
    (listeners.unhandledrejection![0] as EventListener)(rejectionEvent);

    const error = new Error('api_key=sk-live-secret-value');
    error.stack = 'Error: failed\nBearer stack-token';
    const errorEvent = new ErrorEvent('error', {
      error,
      message: error.message,
    });
    Object.defineProperty(errorEvent, 'target', { value: window });
    (listeners.error![0] as EventListener)(errorEvent);

    const consolePayload = JSON.stringify(consoleError.mock.calls);
    expect(consolePayload).not.toContain('live-token');
    expect(consolePayload).not.toContain('sk-live-secret-value');
    expect(consolePayload).not.toContain('stack-token');
    expect(consolePayload).toContain('[redacted]');
  });
});
