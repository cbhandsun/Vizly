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

describe('diagramMenuLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts diagram menu failures', async () => {
    const logging = await import('../diagramMenuLogging');

    logging.logDiagramMenuStorageFailure('writeMenuScrollTop', new Error('token=scroll-secret'));
    logging.logDiagramMenuStorageFailure('readCollapsedGroups', new Error('cookie=collapsed-secret'));
    logging.logModernDiagramMenuFailure('ensureSelectedVisible', new Error('api_key=visible-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[diagramMenuStorage.writeMenuScrollTop] Failed to write "diagramMenu.scrollTop":');
    expect(warnMessages).toContain('[diagramMenuStorage.readCollapsedGroups] Failed to read "diagramMenu.collapsedGroups":');
    expect(warnMessages).toContain('[ModernDiagramMenu] ensureSelectedVisible failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('scroll-secret');
    expect(warnPayload).not.toContain('collapsed-secret');
    expect(warnPayload).not.toContain('visible-secret');
  });
});
