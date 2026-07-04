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

function stringifyMockArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

describe('designerUtilsLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts migration and layout failures before logging', async () => {
    const {
      logDesignerUtilsMigrationFailure,
      logDesignerUtilsThemeRestoreFailure,
      logDesignerUtilsDomainLayoutFailure,
    } = await import('../designerUtilsLogging');

    logDesignerUtilsMigrationFailure('architecture', new Error('Authorization: Bearer migration-secret'));
    logDesignerUtilsThemeRestoreFailure('dark', new Error('cookie=theme-restore-secret'));
    logDesignerUtilsDomainLayoutFailure(new Error('api_key=layout-secret'));

    const warnPayload = safeLogState.warn.mock.calls.flat().map(stringifyMockArg).join('\n');
    const errorPayload = safeLogState.error.mock.calls.flat().map(stringifyMockArg).join('\n');

    expect(errorPayload).toContain('[designerUtils] Diagram migration failed for architecture:');
    expect(warnPayload).toContain('[designerUtils] Failed to restore theme "dark":');
    expect(errorPayload).toContain('[designerUtils] Domain layout failed, falling back to flat dagre:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('migration-secret');
    expect(warnPayload).not.toContain('theme-restore-secret');
    expect(errorPayload).not.toContain('layout-secret');
  });
});
