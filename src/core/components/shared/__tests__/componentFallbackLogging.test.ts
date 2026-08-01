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

describe('componentFallbackLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('logs fallback warnings for component placeholder scenarios', async () => {
    const {
      logArchitectureNodeMissingData,
      logUnifiedDesignerInitialDataFallback,
      logUnifiedDesignerBatchUpdateUnavailable,
      logUnifiedDesignerUnsupportedAction,
    } = await import('../componentFallbackLogging');

    logArchitectureNodeMissingData();
    logUnifiedDesignerBatchUpdateUnavailable('updateNodesBatch');
    logUnifiedDesignerBatchUpdateUnavailable('updateEdgesBatch');
    logUnifiedDesignerUnsupportedAction('takeSnapshot', 'flowchart');
    logUnifiedDesignerUnsupportedAction('addNode', 'flowchart');
    logUnifiedDesignerInitialDataFallback('flowchart', new Error('bad input'));

    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[ArchitectureNode] Rendered without data. Falling back to invalid-node placeholder.');
    expect(warnMessages).toContain('[UnifiedDesigner] updateNodesBatch is not implemented in the placeholder context.');
    expect(warnMessages).toContain('[UnifiedDesigner] updateEdgesBatch is not implemented in the placeholder context.');
    expect(warnMessages).toContain('[UnifiedDesigner] takeSnapshot is not implemented in the placeholder context for plugin "flowchart".');
    expect(warnMessages).toContain('[UnifiedDesigner] addNode is not implemented in the placeholder context for plugin "flowchart".');
    expect(warnMessages).toContain('[UnifiedDesigner] Failed to parse initialData for plugin "flowchart". Falling back to empty state.');
    expect(redactSensitiveLogValue).toHaveBeenCalledWith(expect.any(Error));
  });
});
