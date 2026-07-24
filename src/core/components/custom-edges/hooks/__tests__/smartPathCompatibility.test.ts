import { describe, expect, it } from 'vitest';
import {
  getComputedPoints,
  isComputedPathCompatibleWithHandles,
  isRoutingResultCompatibleWithHandles,
  pointsToOrthogonalPath,
} from '../smartPathCompatibility';

const handles = { sourceX: 0, sourceY: 0, targetX: 100, targetY: 50 };

describe('smart path compatibility', () => {
  it('parses finite point arrays and creates an orthogonal SVG path', () => {
    const points = getComputedPoints([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
    expect(pointsToOrthogonalPath(points ?? [])).toBe('M 0 0 L 100 50');
  });

  it.each([null, [], [{ x: 0, y: 0 }], [{ x: Number.NaN, y: 0 }, { x: 1, y: 1 }]])(
    'rejects malformed point input %#',
    (value) => expect(getComputedPoints(value)).toBeNull(),
  );

  it('checks only the handles requested by the caller', () => {
    const nearSource = [{ x: 5, y: 5 }, { x: 500, y: 500 }];
    expect(isComputedPathCompatibleWithHandles(nearSource, handles, true, false)).toBe(true);
    expect(isComputedPathCompatibleWithHandles(nearSource, handles, true, true)).toBe(false);
  });

  it('allows routing results without handle constraints and rejects missing constrained points', () => {
    expect(isRoutingResultCompatibleWithHandles(null, handles, false, false)).toBe(true);
    expect(isRoutingResultCompatibleWithHandles(null, handles, true, false)).toBe(false);
  });
});
