import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('dataRegistryLogging', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach((mock) => mock.mockReset());
  });

  it('redacts sensitive failures before logging registry errors', async () => {
    const {
      logDataRegistryInitializationFailure,
      logInvalidRemoteTemplateContent,
      logRemoteTemplateFetchFailure,
      logInvalidLocalDiagram,
      logLocalDiagramLoadFailure,
    } = await import('../dataRegistryLogging');

    logDataRegistryInitializationFailure(new Error('Bearer secret-init'));
    logInvalidRemoteTemplateContent({ token: 'remote-secret' });
    logRemoteTemplateFetchFailure({ authorization: 'Bearer fetch-secret' });
    logInvalidLocalDiagram({ cookie: 'local-secret' });
    logLocalDiagramLoadFailure({ apiKey: 'db-secret' });

    const payload = JSON.stringify({
      warn: safeLogState.warn.mock.calls,
      error: safeLogState.error.mock.calls,
    });

    expect(payload).toContain('[DataRegistry] Initialization failed:');
    expect(payload).toContain('[DataRegistry] Skipped invalid remote template content.');
    expect(payload).toContain('[DataRegistry] Failed to fetch remote templates, falling back to local static JSONs.');
    expect(payload).toContain('[DataRegistry] Skipped invalid local diagram from IndexedDB.');
    expect(payload).toContain('[DataRegistry] Failed to load local diagrams from IndexedDB.');
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('secret-init');
    expect(payload).not.toContain('remote-secret');
    expect(payload).not.toContain('fetch-secret');
    expect(payload).not.toContain('local-secret');
    expect(payload).not.toContain('db-secret');
  });

  it('logs bounded diagram names for missing diagram content warnings', async () => {
    const { logDiagramMissingNodes, logDiagramMissingEdges } = await import('../dataRegistryLogging');

    const oversizedName = `${'A'.repeat(140)} token-secret`;
    logDiagramMissingNodes(oversizedName);
    logDiagramMissingEdges(oversizedName);

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DataRegistry] Diagram is missing node data.',
      expect.objectContaining({
        name: expect.any(String),
      })
    );
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DataRegistry] Diagram is missing edge data.',
      expect.objectContaining({
        name: expect.any(String),
      })
    );

    const warnPayload = safeLogState.warn.mock.calls[0]?.[1] as { name?: string } | undefined;
    expect(warnPayload?.name).toHaveLength(120);
    const payload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(payload).not.toContain('token-secret');
  });
});
