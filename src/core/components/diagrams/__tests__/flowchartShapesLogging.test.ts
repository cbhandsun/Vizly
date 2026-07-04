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

describe('flowchartShapesLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts drag preview failures', async () => {
    const logging = await import('../flowchartShapesLogging');

    logging.logFlowchartShapesDragPreviewFailure('Circle', new Error('api_key=drag-preview-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[FlowchartShapesPanel] Failed to create drag preview for "Circle":');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('drag-preview-secret');
  });
});
