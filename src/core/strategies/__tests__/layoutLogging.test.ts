import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('layoutLogging', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach((mock) => mock.mockReset());
  });

  it('redacts strategy and elk layout failures before logging', async () => {
    const {
      logWorkerLayoutFailure,
      logDomainElkContainerUpdateFailure,
      logElkEdgeRouterFallback,
      logDomainDagreMissingNodeHandle,
      logLayoutDiagnosticsSummary,
      logSubGroupDebugSample,
      logRegisteredLayoutStrategyMetadata,
    } = await import('../layoutLogging');

    logWorkerLayoutFailure('DomainElkLayoutStrategy', { token: 'worker-secret' });
    logDomainElkContainerUpdateFailure({ cookie: 'container-secret' });
    logElkEdgeRouterFallback(new Error('Bearer edge-secret'));
    logDomainDagreMissingNodeHandle('edge-7', true, false);
    logLayoutDiagnosticsSummary([{ domain: 'secret-domain', orphanCount: 2 }]);
    logSubGroupDebugSample([{ id: 'sg-1', secret: 'subgroup-secret' }]);
    logRegisteredLayoutStrategyMetadata(['dagre', 'elk']);

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const debugPayload = JSON.stringify(safeLogState.debug.mock.calls);

    expect(errorPayload).toContain('[DomainElkLayoutStrategy] Worker Layout Failed:');
    expect(warnPayload).toContain('[DomainElkLayout] Container update failed:');
    expect(warnPayload).toContain('[ELK Edge Router] Failed, falling back to default routing:');
    expect(warnPayload).toContain('[DomainDagre] Edge source/target missing in idMap, using default handle.');
    expect(warnPayload).toContain('[LayoutDiagnostics] Summary');
    expect(debugPayload).toContain('[SubGroupDebug] sample');
    expect(debugPayload).toContain('[LayoutStrategy] Registered metadata:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('worker-secret');
    expect(warnPayload).not.toContain('container-secret');
    expect(warnPayload).not.toContain('edge-secret');
    expect(warnPayload).not.toContain('secret-domain');
    expect(debugPayload).not.toContain('subgroup-secret');
  });

  it('logs layout worker timeouts without extra payload', async () => {
    const { logLayoutWorkerTimeout } = await import('../layoutLogging');

    logLayoutWorkerTimeout('DomainElkLayoutStrategy');

    expect(safeLogState.warn).toHaveBeenCalledWith('[DomainElkLayoutStrategy] Layout worker timed out');
  });
});
