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

describe('diagramStorageLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for version history and cloud storage failures', async () => {
    const logging = await import('../diagramStorageLogging');

    logging.logVersionHistoryLoadFailure(new Error('Authorization: Bearer versions-secret'));
    logging.logVersionHistorySaveFailure({ token: 'save-version-secret' });
    logging.logVersionHistoryPayloadLoadFailure(new Error('cookie=payload-secret'));
    logging.logVersionHistoryRestoreFailure(new Error('api_key=restore-secret'));
    logging.logCloudSaveFailure('useCloudSave', new Error('password=cloud-save-secret'));
    logging.logCloudSaveEnsureFailure('diagram-1', new Error('secret=ensure-cloud-secret'));
    logging.logCloudSaveFailure('ExportTools', new Error('secret=export-cloud-secret'));
    logging.logDiagramStorageTemplateFetchFailure(new Error('credential=template-fetch-secret'));
    logging.logDiagramStorageTemplateFetchException(new Error('token=template-exception-secret'));
    logging.logDiagramStorageCloudListFailure('s3', new Error('Authorization: Bearer s3-list-secret'));
    logging.logDiagramStorageCloudListFailure('supabase', new Error('cookie=supabase-list-secret'));
    logging.logCloudStorageManagerSharedLoadFailure(new Error('Authorization: Bearer shared-secret'));
    logging.logCloudStorageManagerListFailure(new Error('cookie=list-secret'));
    logging.logCloudStorageManagerOpenFailure(new Error('api_key=open-secret'));
    logging.logCloudStorageManagerBatchDeleteFailure('diagram-42', new Error('secret=batch-delete-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(errorPayload).toContain('[useVersionHistory] Failed to load versions:');
    expect(errorPayload).toContain('[useVersionHistory] Failed to save version:');
    expect(errorPayload).toContain('[useVersionHistory] Failed to load version payload:');
    expect(errorPayload).toContain('[useVersionHistory] Failed to restore version:');
    expect(errorPayload).toContain('[useCloudSave] Cloud save failed:');
    expect(errorPayload).toContain('[ExportTools] Cloud save failed:');
    expect(warnMessages).toContain('[useCloudSave] Failed to ensure cloud save for diagram "diagram-1":');
    expect(errorPayload).toContain('[useDiagramStorage] Error fetching system templates:');
    expect(errorPayload).toContain('[useDiagramStorage] Exception fetching system templates:');
    expect(errorPayload).toContain('[useDiagramStorage] Failed to list diagrams from s3:');
    expect(errorPayload).toContain('[useDiagramStorage] Failed to list diagrams from supabase:');
    expect(errorPayload).toContain('[CloudStorageManagerModal] Failed to load shared diagrams:');
    expect(errorPayload).toContain('[CloudStorageManagerModal] Failed to list diagrams:');
    expect(errorPayload).toContain('[CloudStorageManagerModal] Failed to open cloud diagram:');
    expect(warnMessages).toContain('[CloudStorageManagerModal] Failed to delete cloud diagram "diagram-42" during batch delete:');
    expect(errorPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('versions-secret');
    expect(errorPayload).not.toContain('save-version-secret');
    expect(errorPayload).not.toContain('payload-secret');
    expect(errorPayload).not.toContain('restore-secret');
    expect(errorPayload).not.toContain('cloud-save-secret');
    expect(errorPayload).not.toContain('export-cloud-secret');
    expect(warnPayload).not.toContain('ensure-cloud-secret');
    expect(errorPayload).not.toContain('template-fetch-secret');
    expect(errorPayload).not.toContain('template-exception-secret');
    expect(errorPayload).not.toContain('s3-list-secret');
    expect(errorPayload).not.toContain('supabase-list-secret');
    expect(errorPayload).not.toContain('shared-secret');
    expect(errorPayload).not.toContain('list-secret');
    expect(errorPayload).not.toContain('open-secret');
    expect(warnPayload).not.toContain('batch-delete-secret');
  });
});
