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

describe('diagramExportLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts export event dispatch and progress callback failures', async () => {
    const logging = await import('../diagramExportLogging');

    logging.logDiagramExportEventDispatchFailure('useDiagramControls', 'diagramExportStart', new Error('Authorization: Bearer export-event-secret'));
    logging.logDiagramExportEventDispatchFailure('useOptimizedDiagramControls', 'diagramExportError', new Error('cookie=optimized-export-secret'));
    logging.logDiagramExportProgressCallbackFailure(new Error('api_key=gif-progress-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[useDiagramControls] Failed to dispatch export event "diagramExportStart":');
    expect(warnMessages).toContain('[useOptimizedDiagramControls] Failed to dispatch export event "diagramExportError":');
    expect(warnMessages).toContain('[exportUtils] Failed to report GIF export progress:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('export-event-secret');
    expect(warnPayload).not.toContain('optimized-export-secret');
    expect(warnPayload).not.toContain('gif-progress-secret');
  });
});
