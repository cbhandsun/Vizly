// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { restorePersistedCanvasGeometry } from './persistedCanvasGeometry.js';

describe('saved collaboration canvas geometry', () => {
  const converted = { id: 'a', position: { x: 1, y: 2 }, data: { label: 'A' }, style: { width: 352, height: 90 }, width: 352, height: 90 };
  it('preserves fractional rendering sizes separately from measured integer sizes', () => {
    expect(restorePersistedCanvasGeometry(converted, { metadata: { canvasPosition: { x: 1, y: 2 }, style: { width: 150.4, height: 60 }, width: 150, height: 60 } }))
      .toEqual({ ...converted, style: { width: 150.4, height: 60 }, width: 150, height: 60 });
  });
  it.each([undefined, {}, { metadata: {} }, { metadata: { canvasPosition: { x: Infinity, y: 2 }, width: 10 } },
    { metadata: { canvasPosition: { x: 1, y: 2 }, width: -1, height: 0 } },
    { metadata: { canvasPosition: { x: 1, y: 2 }, width: 10000001, height: NaN } }])('keeps measured geometry when saved input is absent or invalid', input => {
    expect(restorePersistedCanvasGeometry(converted, input)).toEqual(converted);
  });
  it('preserves independent style and only overrides a valid saved dimension', () => {
    const input = { ...converted, style: { ...converted.style, opacity: 0.5 } };
    expect(restorePersistedCanvasGeometry(input, { metadata: { canvasPosition: { x: 1, y: 2 }, width: 160 } }))
      .toEqual({ ...input, width: 160, style: { ...input.style, width: 160 } });
  });
  it('restores measured canvas dimensions separately from persisted rendering styles', () => {
    const saved = { metadata: { canvasPosition: { x: 1, y: 2 }, width: 143, height: 75,
      style: { width: 83, height: 111 } } };
    expect(restorePersistedCanvasGeometry(converted, saved)).toEqual({
      ...converted, width: 143, height: 75, style: { width: 83, height: 111 },
    });
    expect(saved.metadata).toEqual({ canvasPosition: { x: 1, y: 2 }, width: 143, height: 75,
      style: { width: 83, height: 111 } });
    expect(converted.height).toBe(90);
  });
  it.each([undefined, null, '143', -1, 0, Infinity, NaN, 1_000_001])('uses valid saved style when measured dimension is invalid: %s', width => {
    expect(restorePersistedCanvasGeometry(converted, { metadata: {
      canvasPosition: { x: 1, y: 2 }, width, style: { width: 83 },
    } })).toEqual({ ...converted, width: 83, style: { ...converted.style, width: 83 } });
  });
  it.each([undefined, null, '83', -1, 0, Infinity, NaN, 1_000_001])('uses valid measured size when saved style is invalid: %s', width => {
    expect(restorePersistedCanvasGeometry(converted, { metadata: {
      canvasPosition: { x: 1, y: 2 }, width: 143, style: { width },
    } })).toEqual({ ...converted, width: 143, style: { ...converted.style, width: 143 } });
  });
  it('accepts bounded extremes while preserving independent style fields and immutable inputs', () => {
    const input = Object.freeze({ ...converted, style: Object.freeze({ ...converted.style, opacity: 0.5 }) });
    const saved = Object.freeze({ metadata: Object.freeze({
      canvasPosition: Object.freeze({ x: 0, y: 0 }), width: 1_000_000, height: Number.MIN_VALUE,
      style: Object.freeze({ width: 0.5, height: 1_000_000 }),
    }) });
    expect(restorePersistedCanvasGeometry(input, saved)).toEqual({ ...input,
      width: 1_000_000, height: Number.MIN_VALUE, style: { opacity: 0.5, width: 0.5, height: 1_000_000 },
    });
  });
});
