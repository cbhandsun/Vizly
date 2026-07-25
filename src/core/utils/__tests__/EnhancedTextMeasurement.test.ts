import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

const originalGetContext = HTMLCanvasElement.prototype.getContext;

describe('EnhancedTextMeasurement', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 8 }),
      })),
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: originalGetContext,
    });
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('sanitizes HTML before extracting measurable text lines', async () => {
    const { EnhancedTextMeasurement } = await import('../EnhancedTextMeasurement');
    const measurement = new EnhancedTextMeasurement();

    const result = measurement.measureNodeContent(
      '<p>Plan</p><script>alert(1)</script><img src=x onerror="alert(2)"><ul><li>Ship</li></ul>'
    );

    expect(result.lines).toEqual(['Plan', '• Ship']);
    expect(result.lines.join(' ')).not.toContain('alert');

    measurement.dispose();
  });

  it('redacts canvas measurement failures before warning and falls back to estimation', async () => {
    const { EnhancedTextMeasurement } = await import('../EnhancedTextMeasurement');
    const measurement = new EnhancedTextMeasurement();
    const measureText = vi
      .spyOn((measurement as unknown as { ctx: CanvasRenderingContext2D }).ctx, 'measureText')
      .mockImplementation(() => {
        throw new Error('Authorization: Bearer secret-token');
      });

    const result = measurement.measureNodeContent('Hello');

    expect(result.width).toBeGreaterThan(0);
    expect(result.lines).toEqual(['Hello']);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      'Canvas measureText failed, using estimation:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );

    const warningPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warningPayload).not.toContain('secret-token');
    expect(warningPayload).toContain('[redacted]');

    measureText.mockRestore();
    measurement.dispose();
  });

  it('keeps shared cache maintenance alive until the final canvas releases it', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { EnhancedTextMeasurement } = await import('../EnhancedTextMeasurement');
    const measurement = new EnhancedTextMeasurement();

    const releaseFirstCanvas = measurement.retain();
    const releaseSecondCanvas = measurement.retain();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    releaseFirstCanvas();
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    releaseSecondCanvas();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    releaseSecondCanvas();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    const releaseRemountedCanvas = measurement.retain();
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    releaseRemountedCanvas();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);

    measurement.dispose();
  });
});
