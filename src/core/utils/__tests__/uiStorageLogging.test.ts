// @vitest-environment node

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

describe('uiStorageLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts shared UI storage read and write failures', async () => {
    const logging = await import('../uiStorageLogging');

    logging.logUiStorageReadFailure('layoutStorage', 'layout.menuWidth', new Error('Authorization: Bearer layout-secret'));
    logging.logUiStorageWriteFailure('layerStorage', 'flowchart.layers', new Error('cookie=layer-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[layoutStorage] Failed to read "layout.menuWidth":');
    expect(warnMessages).toContain('[layerStorage] Failed to write "flowchart.layers":');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('layout-secret');
    expect(warnPayload).not.toContain('layer-secret');
  });
});
