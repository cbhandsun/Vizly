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

describe('diagramContextMenuLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts clipboard availability failures', async () => {
    const { logDiagramContextMenuFailure } = await import('../diagramContextMenuLogging');

    logDiagramContextMenuFailure('checkClipboardAvailability', new Error('Authorization: Bearer clipboard-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[DiagramContextMenu] checkClipboardAvailability failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('clipboard-secret');
  });
});
