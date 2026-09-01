import { describe, expect, it } from 'vitest';
import {
  isValidVectorPdfFontBytes,
  normalizeVectorPdfPageGeometry,
  ScenePdfExportError,
} from '../../export/scenePdfExport';

describe('normalizeVectorPdfPageGeometry', () => {
  it('preserves ordinary scene dimensions', () => {
    expect(normalizeVectorPdfPageGeometry(2_240, 1_840)).toEqual({
      width: 2_240,
      height: 1_840,
      scale: 1,
    });
  });

  it('proportionally scales extreme scenes to the PDF page limit', () => {
    expect(normalizeVectorPdfPageGeometry(50_000, 25_000)).toEqual({
      width: 14_400,
      height: 7_200,
      scale: 0.288,
    });
  });

  it.each([
    [0, 100],
    [-1, 100],
    [100, Number.NaN],
    [Number.POSITIVE_INFINITY, 100],
    ['100', 100],
    [null, 100],
  ])('rejects invalid dimensions %#', (width, height) => {
    expect(() => normalizeVectorPdfPageGeometry(width, height)).toThrow(ScenePdfExportError);
  });
});

describe('isValidVectorPdfFontBytes', () => {
  it('accepts a bounded TrueType signature', () => {
    expect(isValidVectorPdfFontBytes(new Uint8Array([0, 1, 0, 0, 1]))).toBe(true);
  });

  it.each([
    undefined,
    new Uint8Array(),
    new Uint8Array([0, 0, 0, 0, 1]),
    new Uint8Array(6 * 1024 * 1024 + 1),
  ])('rejects empty, malformed, typed, and oversized values %#', value => {
    expect(isValidVectorPdfFontBytes(value)).toBe(false);
  });
});
