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

describe('diagramThemeLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts global theme sync failures before logging', async () => {
    const { logDiagramGlobalThemeSyncFailure } = await import('../diagramThemeLogging');

    logDiagramGlobalThemeSyncFailure('FlowchartDesigner', 'dark', new Error('token=diagram-theme-secret'));

    const warnPayload = safeLogState.warn.mock.calls.flat().map(stringifyMockArg).join('\n');
    expect(warnPayload).toContain('[FlowchartDesigner] Failed to sync global theme "dark":');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('diagram-theme-secret');
  });
});
