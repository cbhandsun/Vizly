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

describe('baseReactFlowLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts fit-width-top failures before logging', async () => {
    const {
      logBaseReactFlowConfigReadFailure,
      logBaseReactFlowEventBindingFailure,
      logBaseReactFlowFitWidthTopFailure,
      logBaseReactFlowOverlayFlagReadFailure,
    } = await import('../baseReactFlowLogging');

    logBaseReactFlowFitWidthTopFailure(new Error('Authorization: Bearer fit-secret'));
    logBaseReactFlowConfigReadFailure('canvas.zoom.sensitivity', new Error('cookie=config-secret'));
    logBaseReactFlowConfigReadFailure('canvas.zoom.fitRatio', new Error('token=fit-ratio-secret'));
    logBaseReactFlowConfigReadFailure('canvas.zoom.maxFitZoom', new Error('credential=max-fit-secret'));
    logBaseReactFlowEventBindingFailure('unbindWheelHandler', new Error('api_key=unbind-secret'));
    logBaseReactFlowOverlayFlagReadFailure('alignGuide', new Error('token=overlay-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(errorPayload).toContain('[BaseReactFlow] performFitWidthTop failed:');
    expect(warnMessages).toContain('[BaseReactFlow] Failed to read config "canvas.zoom.sensitivity":');
    expect(warnMessages).toContain('[BaseReactFlow] Failed to read config "canvas.zoom.fitRatio":');
    expect(warnMessages).toContain('[BaseReactFlow] Failed to read config "canvas.zoom.maxFitZoom":');
    expect(warnMessages).toContain('[BaseReactFlow] unbindWheelHandler failed:');
    expect(warnMessages).toContain('[BaseReactFlow] Failed to read overlay flag "alignGuide":');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('fit-secret');
    expect(warnPayload).not.toContain('config-secret');
    expect(warnPayload).not.toContain('fit-ratio-secret');
    expect(warnPayload).not.toContain('max-fit-secret');
    expect(warnPayload).not.toContain('unbind-secret');
    expect(warnPayload).not.toContain('overlay-secret');
  });
});
