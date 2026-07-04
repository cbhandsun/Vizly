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

describe('mindmapBatchLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    redactSensitiveLogValue.mockReset();
    redactSensitiveLogValue.mockImplementation((value: unknown) => value);
  });

  it('logs redacted batch-action failures', async () => {
    const { logMindMapBatchActionFailure } = await import('../mindmapBatchLogging');

    logMindMapBatchActionFailure('reshapeNode', new Error('bad reshape'));
    logMindMapBatchActionFailure('expandNode', new Error('bad expand'));
    logMindMapBatchActionFailure('removeNodes', new Error('bad remove'));

    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toEqual([
      '[MindMapBatchBar] reshapeNode failed:',
      '[MindMapBatchBar] expandNode failed:',
      '[MindMapBatchBar] removeNodes failed:',
    ]);
    expect(redactSensitiveLogValue).toHaveBeenCalledTimes(3);
  });
});
