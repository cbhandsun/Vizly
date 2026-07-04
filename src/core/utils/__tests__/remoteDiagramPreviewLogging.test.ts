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

describe('remoteDiagramPreviewLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts invalidation and fetch failures', async () => {
    const logging = await import('../remoteDiagramPreviewLogging');

    logging.logRemoteDiagramPreviewInvalidationFailure('diagram-1', new Error('Authorization: Bearer invalidation-secret'));
    logging.logRemoteDiagramPreviewFetchFailure('diagram-2', new Error('cookie=fetch-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[remoteDiagramPreview] Failed to dispatch invalidation event for "diagram-1":');
    expect(warnMessages).toContain('[remoteDiagramPreview] Failed to fetch preview for "diagram-2":');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('invalidation-secret');
    expect(warnPayload).not.toContain('fetch-secret');
  });
});
