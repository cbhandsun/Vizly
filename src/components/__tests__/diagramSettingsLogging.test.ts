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

describe('diagramSettingsLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts layout sync failures', async () => {
    const { logDiagramSettingsLayoutSyncFailure } = await import('../diagramSettingsLogging');

    logDiagramSettingsLayoutSyncFailure('resolveNodeLayoutForHierarchy', new Error('Authorization: Bearer hierarchy-secret'));
    logDiagramSettingsLayoutSyncFailure('applyCompoundLayoutPreset', new Error('cookie=preset-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[DiagramSettingsPanel] resolveNodeLayoutForHierarchy failed:');
    expect(warnPayload).toContain('[DiagramSettingsPanel] applyCompoundLayoutPreset failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('hierarchy-secret');
    expect(warnPayload).not.toContain('preset-secret');
  });
});
