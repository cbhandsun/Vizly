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

describe('diagramControlLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts bridge and dispatch failures', async () => {
    const logging = await import('../diagramControlLogging');

    logging.logDiagramControlBridgeFailure('fitRefine', new Error('Authorization: Bearer fit-secret'));
    logging.logDiagramControlBridgeFailure('fitFallback', new Error('cookie=fit-fallback-secret'));
    logging.logDiagramControlBridgeFailure('fullscreen', new Error('token=fullscreen-secret'));
    logging.logDiagramControlBridgeFailure('top', new Error('api_key=top-secret'));
    logging.logDiagramControlDispatchFailure('toggleFlowDirection', new Error('Authorization: Bearer dispatch-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[DiagramControlBridge] fitRefine failed:');
    expect(warnMessages).toContain('[DiagramControlBridge] fitFallback failed:');
    expect(warnMessages).toContain('[DiagramControlBridge] fullscreen failed:');
    expect(warnMessages).toContain('[DiagramControlBridge] top failed:');
    expect(warnMessages).toContain('[diagramControl] Failed to dispatch "toggleFlowDirection" event:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('fit-secret');
    expect(warnPayload).not.toContain('fit-fallback-secret');
    expect(warnPayload).not.toContain('fullscreen-secret');
    expect(warnPayload).not.toContain('top-secret');
    expect(warnPayload).not.toContain('dispatch-secret');
  });
});
