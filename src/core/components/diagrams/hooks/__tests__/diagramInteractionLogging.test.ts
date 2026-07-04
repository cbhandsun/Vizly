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

describe('diagramInteractionLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for hook-level interaction failures', async () => {
    const logging = await import('../diagramInteractionLogging');

    logging.logConnectionMicrointeractionFailure('domRemoveClasses', new Error('Authorization: Bearer dom-secret'));
    logging.logDiagramDragDropImportRejected({ reason: 'token=reject-secret' });
    logging.logDiagramDragDropReverseImportFailure(new Error('cookie=reverse-secret'));
    logging.logDiagramDragDropFailure(new Error('api_key=drop-secret'));
    logging.logLayoutOrphanEdgeDropped({ edgeId: 'edge-1', hasSource: false, hasTarget: true });
    logging.logLayoutNoLayoutableNodes();
    logging.logLayoutStrategyFailure('domain-dagre', new Error('password=layout-secret'));
    logging.logSmartRoutingConfigLayerSyncFailure(new Error('secret=layer-sync-secret'));
    logging.logSmartRoutingConfigSyncFailure(new Error('credential=config-sync-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);

    expect(warnPayload).toContain('[useConnectionMicrointeractions] domRemoveClasses failed:');
    expect(warnPayload).toContain('[useDiagramDragDrop] reverse import rejected:');
    expect(errorPayload).toContain('[useDiagramDragDrop] reverse import failed:');
    expect(errorPayload).toContain('[useDiagramDragDrop] drop failed:');
    expect(warnPayload).toContain('[useLayoutStrategy] Dropping orphan edge after layout sanitation:');
    expect(warnPayload).toContain('[useLayoutStrategy] No layoutable nodes available; skipping layout.');
    expect(errorPayload).toContain('[useLayoutStrategy] Layout failed (domain-dagre):');
    expect(warnPayload).toContain('[useSmartRoutingConfig] Layered config sync failed:');
    expect(warnPayload).toContain('[useSmartRoutingConfig] Config sync failed:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).toContain('edge-1');
    expect(warnPayload).not.toContain('dom-secret');
    expect(warnPayload).not.toContain('reject-secret');
    expect(errorPayload).not.toContain('reverse-secret');
    expect(errorPayload).not.toContain('drop-secret');
    expect(errorPayload).not.toContain('layout-secret');
    expect(warnPayload).not.toContain('layer-sync-secret');
    expect(warnPayload).not.toContain('config-sync-secret');
  });
});
