import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const redactSensitiveLogValue = vi.hoisted(() => vi.fn((value: unknown) => value));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('@/core/utils/logSecurity', () => ({
  redactSensitiveLogValue,
}));

describe('mindmapFloatingLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    redactSensitiveLogValue.mockReset();
    redactSensitiveLogValue.mockImplementation((value: unknown) => value);
  });

  it('logs redacted floating-bar action failures', async () => {
    const { logMindMapFloatingActionFailure } = await import('../mindmapFloatingLogging');

    logMindMapFloatingActionFailure('applySuggestion', new Error('token=apply-secret'));
    logMindMapFloatingActionFailure('addChild', new Error('token=add-child-secret'));
    logMindMapFloatingActionFailure('duplicateNode', new Error('Authorization: Bearer duplicate-secret'));
    logMindMapFloatingActionFailure('setBranchColor', new Error('cookie=color-secret'));
    logMindMapFloatingActionFailure('setShapeClass', new Error('api_key=shape-secret'));
    logMindMapFloatingActionFailure('clearNote', new Error('password=clear-note-secret'));
    logMindMapFloatingActionFailure('saveNote', new Error('secret=save-note-secret'));

    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toEqual([
      '[MindMapFloatingBar] applySuggestion failed:',
      '[MindMapFloatingBar] addChild failed:',
      '[MindMapFloatingBar] duplicateNode failed:',
      '[MindMapFloatingBar] setBranchColor failed:',
      '[MindMapFloatingBar] setShapeClass failed:',
      '[MindMapFloatingBar] clearNote failed:',
      '[MindMapFloatingBar] saveNote failed:',
    ]);
    expect(redactSensitiveLogValue).toHaveBeenCalledTimes(7);
  });
});
