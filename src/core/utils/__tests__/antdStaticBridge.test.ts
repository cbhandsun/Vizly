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

describe('antdStaticBridge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts fallback arguments before warning when the bridge is not ready', async () => {
    const { appMessage } = await import('../antdStaticBridge');

    appMessage.success('Authorization: Bearer live-token');

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[antdStaticBridge] message.success 尚未初始化，调用被忽略。参数:',
      expect.any(Array)
    );

    const warningPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warningPayload).toContain('[redacted]');
    expect(warningPayload).not.toContain('live-token');
  });

  it('delegates to the registered APIs once the bridge is initialized', async () => {
    const { appMessage, registerAntdApi } = await import('../antdStaticBridge');
    const success = vi.fn();

    registerAntdApi(
      { success } as never,
      {} as never,
      {} as never
    );

    appMessage.success('done');

    expect(success).toHaveBeenCalledWith('done');
    expect(safeLogState.warn).not.toHaveBeenCalled();
  });
});
