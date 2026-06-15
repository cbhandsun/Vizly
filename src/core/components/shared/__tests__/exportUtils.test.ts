import { describe, expect, it, vi } from 'vitest';
import {
  buildExportFileName,
  isSafeExportDataUrl,
  normalizeExportPixelRatio,
  normalizeGifFrameCount,
  normalizeRasterExportBounds,
  triggerDownload,
} from '../exportUtils';

describe('exportUtils', () => {
  it('builds sanitized export filenames from diagram ids', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:34:56.789Z'));

    expect(buildExportFileName('../CON:<bad>', 'png')).toBe('_CON_bad__2026-06-13T12-34-56-789Z.png');
    expect(buildExportFileName('   ', 'svg')).toBe('diagram_2026-06-13T12-34-56-789Z.svg');

    vi.useRealTimers();
  });

  it('normalizes raster export pixel ratios and dimensions', () => {
    expect(normalizeExportPixelRatio(Number.NaN)).toBe(1);
    expect(normalizeExportPixelRatio(10)).toBe(3);
    expect(normalizeExportPixelRatio(0.1)).toBe(0.5);

    expect(normalizeRasterExportBounds(1000, 500, 2)).toEqual({
      width: 1000,
      height: 500,
      pixelRatio: 2,
    });
  });

  it('reduces pixel ratio for large exports and rejects invalid dimensions', () => {
    const large = normalizeRasterExportBounds(6000, 4000, 3);
    expect(large.width).toBe(6000);
    expect(large.height).toBe(4000);
    expect(large.pixelRatio).toBeLessThan(3);

    expect(() => normalizeRasterExportBounds(12_001, 100, 1)).toThrow('Export dimensions exceed');
    expect(() => normalizeRasterExportBounds(Number.POSITIVE_INFINITY, 100, 1)).toThrow('Invalid export dimensions');
  });

  it('normalizes GIF frame counts', () => {
    expect(normalizeGifFrameCount(Number.NaN)).toBe(1);
    expect(normalizeGifFrameCount(0)).toBe(1);
    expect(normalizeGifFrameCount(12.8)).toBe(12);
    expect(normalizeGifFrameCount(100)).toBe(24);
  });

  it('validates export data URLs before download', () => {
    expect(isSafeExportDataUrl('data:image/png;base64,aGVsbG8=')).toBe(true);
    expect(isSafeExportDataUrl('data:image/gif;base64,R0lGODlh')).toBe(true);
    expect(isSafeExportDataUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E')).toBe(true);
    expect(isSafeExportDataUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeExportDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExportDataUrl(`data:image/png;base64,${'A'.repeat(65 * 1024 * 1024)}`)).toBe(false);
  });

  it('throws before creating a download link for unsafe data URLs', () => {
    expect(() => triggerDownload('javascript:alert(1)', 'bad.png')).toThrow('Unsafe export data URL');
    expect(document.querySelector('a')).toBeNull();
  });
});
