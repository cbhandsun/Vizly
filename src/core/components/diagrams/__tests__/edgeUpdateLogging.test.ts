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

describe('edgeUpdateLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts theme context failures', async () => {
    const { logEdgeUpdateContextFailure } = await import('../edgeUpdateLogging');

    logEdgeUpdateContextFailure('getCurrentTheme', new Error('cookie=edge-theme-secret'));
    logEdgeUpdateContextFailure('subscribeThemeChange', new Error('api_key=edge-subscribe-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[EdgeUpdateContext] getCurrentTheme failed:');
    expect(warnMessages).toContain('[EdgeUpdateContext] subscribeThemeChange failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('edge-theme-secret');
    expect(warnPayload).not.toContain('edge-subscribe-secret');
  });
});
