import { describe, expect, it } from 'vitest';
import { calculateAdaptiveGridSize } from '../adaptiveGridSize';

describe('calculateAdaptiveGridSize', () => {
  it('uses fine routing for short distances and progressively coarsens long routes', () => {
    expect(calculateAdaptiveGridSize(0, 0, 100, 0, 20)).toBe(10);
    expect(calculateAdaptiveGridSize(0, 0, 600, 0, 10)).toBe(15);
    expect(calculateAdaptiveGridSize(0, 0, 1200, 0, 10)).toBe(20);
    expect(calculateAdaptiveGridSize(0, 0, 2600, 0, 50)).toBe(40);
  });

  it('falls back for invalid configuration and always respects the upper bound', () => {
    expect(calculateAdaptiveGridSize(0, 0, 600, 0, Number.NaN)).toBe(15);
    expect(calculateAdaptiveGridSize(0, 0, 600, 0, -1)).toBe(15);
    expect(calculateAdaptiveGridSize(0, 0, 3000, 0, Number.POSITIVE_INFINITY)).toBe(30);
    expect(calculateAdaptiveGridSize(0, 0, 3000, 0, 100)).toBe(40);
  });
});
