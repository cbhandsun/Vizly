import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('smartPathWorkerLogging', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach((mock) => mock.mockReset());
  });

  it('redacts smart worker warnings and failures', async () => {
    const {
      logSmartPathWorkerMissingNode,
      logSmartPathWorkerEmptyResult,
      logSmartPathWorkerFallback,
      logSmartPathWorkerFailure,
    } = await import('../smartPathWorkerLogging');

    logSmartPathWorkerMissingNode({
      edgeId: 'edge-1',
      source: 'source-secret',
      target: 'target-secret',
      mapSize: 12,
    });
    logSmartPathWorkerEmptyResult('edge-1', { authorization: 'Bearer empty-secret' });
    logSmartPathWorkerFallback('edge-1', 'fallback-secret');
    logSmartPathWorkerFailure('edge-1', { apiKey: 'worker-secret' });

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);

    expect(warnPayload).toContain('[SmartWorker:edge-1] Node not found in simpleNodeMap - retrying next frame.');
    expect(warnPayload).toContain('[SmartWorker:edge-1] Worker returned error or empty path:');
    expect(warnPayload).toContain('[SmartWorker:edge-1] Using fallback path.');
    expect(errorPayload).toContain('[useSmartPathWorker] Worker failed for edge-1:');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('source-secret');
    expect(warnPayload).not.toContain('target-secret');
    expect(warnPayload).not.toContain('fallback-secret');
    expect(errorPayload).not.toContain('worker-secret');
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[SmartWorker:edge-1] Node not found in simpleNodeMap - retrying next frame.',
      { mapSize: 12 }
    );
  });
});
