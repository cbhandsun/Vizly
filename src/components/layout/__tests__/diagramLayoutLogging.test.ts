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

describe('diagramLayoutLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts layout failures', async () => {
    const { logDiagramLayoutFailure } = await import('../diagramLayoutLogging');

    logDiagramLayoutFailure('resolveUiScale', new Error('Authorization: Bearer layout-secret'));
    logDiagramLayoutFailure('removeMouseupListener', new Error('cookie=mouseup-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[DiagramLayout] resolveUiScale failed:');
    expect(warnMessages).toContain('[DiagramLayout] removeMouseupListener failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('layout-secret');
    expect(warnPayload).not.toContain('mouseup-secret');
  });
});
