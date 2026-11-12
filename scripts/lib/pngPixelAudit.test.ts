import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { pngContainsOpaqueColor } from './pngPixelAudit';

const editorColor = [1, 254, 7] as const;
const png = (data: number[], channels = 4) => Buffer.from(encode({
  width: data.length / channels, height: 1, channels, data: Uint8Array.from(data),
}));

describe('downloaded PNG editor-color audit', () => {
  it('detects contamination at the last pixel, including opaque RGB exports', () => {
    expect(pngContainsOpaqueColor(png([255, 255, 255, 255, 1, 254, 7, 255]), editorColor)).toBe(true);
    expect(pngContainsOpaqueColor(png([255, 255, 255, 1, 254, 7], 3), editorColor)).toBe(true);
  });
  it('does not mistake transparent or near-color pixels for the exact opaque editor color', () => {
    expect(pngContainsOpaqueColor(png([1, 254, 7, 254, 1, 254, 8, 255]), editorColor)).toBe(false);
  });
  it('rejects truncated, corrupt and unsupported rasters instead of reporting a clean image', () => {
    expect(() => pngContainsOpaqueColor(Buffer.alloc(20), editorColor)).toThrow(/header/);
    const corrupt = png([1, 254, 7, 255]);
    corrupt[corrupt.length - 1] ^= 1;
    expect(() => pngContainsOpaqueColor(corrupt, editorColor)).toThrow();
    const grayscale = Buffer.from(encode({ width: 1, height: 1, channels: 1, data: new Uint8Array([1]) }));
    expect(() => pngContainsOpaqueColor(grayscale, editorColor)).toThrow(/RGB/);
  });
  it('checks the export pixel budget before decoding the raster', () => {
    const oversized = png([1, 254, 7, 255]);
    oversized.writeUInt32BE(12_001, 16);
    expect(() => pngContainsOpaqueColor(oversized, editorColor)).toThrow(/budget/);
    oversized.writeUInt32BE(6_001, 16);
    oversized.writeUInt32BE(6_000, 20);
    expect(() => pngContainsOpaqueColor(oversized, editorColor)).toThrow(/budget/);
  });
});
