import { describe, expect, it } from 'vitest';

import { resolveFixedMiniMapBottom } from '../fixedMiniMapPlacement';

describe('resolveFixedMiniMapBottom', () => {
  it('raises the minimap above an overlapping bottom control', () => {
    expect(resolveFixedMiniMapBottom({
      baseBottom: 10,
      absoluteLeft: 10,
      width: 240,
      viewportHeight: 900,
      reservedArea: { left: 20, right: 200, top: 840 },
    })).toBe(68);
  });

  it('keeps the stored bottom offset when the controls do not overlap horizontally', () => {
    expect(resolveFixedMiniMapBottom({
      baseBottom: 10,
      absoluteLeft: 400,
      width: 240,
      viewportHeight: 900,
      reservedArea: { left: 20, right: 200, top: 840 },
    })).toBe(10);
  });

  it('preserves an already safe offset and rejects invalid geometry', () => {
    expect(resolveFixedMiniMapBottom({
      baseBottom: 90,
      absoluteLeft: 10,
      width: 240,
      viewportHeight: 900,
      reservedArea: { left: 20, right: 200, top: 840 },
    })).toBe(90);
    expect(resolveFixedMiniMapBottom({
      baseBottom: Number.NaN,
      absoluteLeft: 10,
      width: 0,
      viewportHeight: 900,
      reservedArea: null,
    })).toBe(0);
  });
});
