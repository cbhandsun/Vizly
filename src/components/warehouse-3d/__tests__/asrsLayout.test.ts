import { describe, expect, it } from 'vitest';
import { createAsrsLayout, getAsrsDimensions, getRandomCraneTarget } from '../asrsLayout';

const finiteTuple = (tuple: readonly number[]): boolean => tuple.every(Number.isFinite);

describe('asrsLayout', () => {
  it('falls back to safe dimensions when the ASRS x-range is invalid', () => {
    expect(getAsrsDimensions([20, -50]).width).toBe(1);
    expect(getAsrsDimensions([Number.NaN, 20]).width).toBe(1);
    expect(getAsrsDimensions([-50, 20])).toEqual({ width: 70, depth: 110, height: 25 });
  });

  it('creates finite rack, box, and floor coordinates with hostile random values', () => {
    const randomValues = [Number.NaN, Infinity, -1, 2, 0.5];
    let index = 0;
    const random = () => randomValues[index++ % randomValues.length];

    const layout = createAsrsLayout(Number.NaN, Infinity, -10, random);

    expect(layout.floorXPositions).toHaveLength(12);
    expect(layout.rackInstances).toHaveLength(24);
    expect(layout.floorXPositions.every(Number.isFinite)).toBe(true);
    expect(layout.rackInstances.every((rack) => finiteTuple(rack.position))).toBe(true);
    expect(layout.boxInstances.every((box) => finiteTuple(box.position) && finiteTuple(box.scale))).toBe(true);
  });

  it('keeps crane targets finite even for small or invalid dimensions', () => {
    const target = getRandomCraneTarget(Number.NaN, 1, () => Infinity);

    expect(Number.isFinite(target.z)).toBe(true);
    expect(Number.isFinite(target.y)).toBe(true);
    expect(target.z).toBe(0);
    expect(target.y).toBe(2);
  });
});
