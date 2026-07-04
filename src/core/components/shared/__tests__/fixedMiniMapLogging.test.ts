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

describe('fixedMiniMapLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts minimap event binding failures', async () => {
    const { logFixedMiniMapFailure } = await import('../fixedMiniMapLogging');

    logFixedMiniMapFailure('bindWheelHandlerPassive', new Error('api_key=minimap-bind-secret'));
    logFixedMiniMapFailure('unbindWheelHandler', new Error('token=minimap-unbind-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[FixedMiniMap] bindWheelHandlerPassive failed:');
    expect(warnMessages).toContain('[FixedMiniMap] unbindWheelHandler failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('minimap-bind-secret');
    expect(warnPayload).not.toContain('minimap-unbind-secret');
  });
});
