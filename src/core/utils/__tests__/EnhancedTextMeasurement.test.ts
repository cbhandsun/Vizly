import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('EnhancedTextMeasurement', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
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
});
