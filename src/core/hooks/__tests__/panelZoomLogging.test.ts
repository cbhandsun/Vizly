import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('panelZoomLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts panel zoom storage failures', async () => {
    const logging = await import('../panelZoomLogging');

    logging.logPanelZoomStorageReadFailure('panel.zoom', new Error('Authorization: Bearer zoom-read-secret'));
    logging.logPanelZoomStorageWriteFailure('panel.zoom', new Error('api_key=zoom-write-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[usePanelZoom] Failed to read "panel.zoom":');
    expect(warnMessages).toContain('[usePanelZoom] Failed to write "panel.zoom":');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('zoom-read-secret');
    expect(warnPayload).not.toContain('zoom-write-secret');
  });
});
