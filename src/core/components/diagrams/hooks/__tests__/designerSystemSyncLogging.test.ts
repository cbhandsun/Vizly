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

describe('designerSystemSyncLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values before logging sync failures', async () => {
    const logging = await import('../designerSystemSyncLogging');

    logging.logDesignerSystemSyncImportDataFailure(new Error('Authorization: Bearer import-secret'));
    logging.logDesignerSystemSyncAutoSaveFailure({ token: 'autosave-secret' });
    logging.logDesignerSystemSyncPresetLoadFailure(new Error('cookie=preset-secret'));
    logging.logDesignerSystemSyncStaleAutosaveDetected('expected-id', 'actual-id');
    logging.logDesignerSystemSyncAutosaveRecalculationFailure(new Error('api_key=recalc-secret'));
    logging.logDesignerSystemSyncStandardDataToCanvasFailure('preset', new Error('password=canvas-secret'));
    logging.logDesignerSystemSyncDesignerUtilsImportFailure(new Error('secret=designer-utils-secret'));
    logging.logDesignerSystemSyncDataRegistryImportFailure(new Error('credential=data-registry-secret'));
    logging.logDesignerSystemSyncFreshSeedClearFailure('autosave:key', new Error('Authorization: Bearer clear-secret'));
    logging.logDesignerSystemSyncDataRegistryWriteFailure('diagram-1', new Error('cookie=registry-write-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(errorPayload).toContain('[DesignerSystemSync] importData failed:');
    expect(errorPayload).toContain('[DesignerSystemSync] Auto-save failed:');
    expect(errorPayload).toContain('[DesignerSystemSync] load standard preset failed:');
    expect(warnPayload).toContain('[DesignerSystemSync] Stale autosave detected. Clearing mismatched payload:');
    expect(errorPayload).toContain('[DesignerSystemSync] autosave size recalculation failed:');
    expect(errorPayload).toContain('[DesignerSystemSync] standardDataToCanvas failed (preset):');
    expect(errorPayload).toContain('[DesignerSystemSync] Import designerUtils failed:');
    expect(errorPayload).toContain('[DesignerSystemSync] import DataRegistry failed:');
    expect(warnMessages).toContain('[DesignerSystemSync] Failed to clear fresh-seed flag for "autosave:key":');
    expect(warnMessages).toContain('[DesignerSystemSync] Failed to register imported diagram "diagram-1" in DataRegistry:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('expected-id');
    expect(warnPayload).toContain('actual-id');
    expect(errorPayload).not.toContain('import-secret');
    expect(errorPayload).not.toContain('autosave-secret');
    expect(errorPayload).not.toContain('preset-secret');
    expect(errorPayload).not.toContain('recalc-secret');
    expect(errorPayload).not.toContain('canvas-secret');
    expect(errorPayload).not.toContain('designer-utils-secret');
    expect(errorPayload).not.toContain('data-registry-secret');
    expect(warnPayload).not.toContain('clear-secret');
    expect(warnPayload).not.toContain('registry-write-secret');
  });
});
