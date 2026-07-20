import { describe, expect, it } from 'vitest';
import {
  buildTerminalStubCandidate,
  horizontalStrictCrossingCoordinates,
  isOnHorizontalSide,
  isOnVerticalSide,
  nodeSideCoordinates,
  verticalStrictCrossingCoordinates,
} from '../edgeLocalDoglegLaneGeometry';

describe('edgeLocalDoglegLaneGeometry', () => {
  it('classifies node sides and returns only inset side coordinates', () => {
    const rect = { x: 10, y: 20, width: 100, height: 80 };

    expect(isOnHorizontalSide({ x: 40, y: 20 }, rect)).toBe(true);
    expect(isOnVerticalSide({ x: 110, y: 60 }, rect)).toBe(true);
    expect(nodeSideCoordinates(rect, 'x', 60).every(value => value >= 10 && value <= 110)).toBe(true);
    expect(nodeSideCoordinates(rect, 'y', 60).every(value => value >= 20 && value <= 100)).toBe(true);
  });

  it('collects strict crossing coordinates from other routes only', () => {
    const paths = new Map([
      ['self', [{ x: 50, y: 0 }, { x: 50, y: 100 }]],
      ['horizontal', [{ x: 0, y: 40 }, { x: 100, y: 40 }]],
      ['vertical', [{ x: 70, y: 0 }, { x: 70, y: 100 }]],
    ]);

    expect(verticalStrictCrossingCoordinates(50, 0, 100, 'self', paths)).toEqual([40]);
    expect(horizontalStrictCrossingCoordinates(40, 0, 100, 'horizontal', paths)).toEqual([50, 70]);
  });

  it('extends short terminal stubs without moving their endpoint', () => {
    const path = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 50 }];

    expect(buildTerminalStubCandidate(path, true)).toEqual([
      { x: 0, y: 0 },
      { x: 56, y: 0 },
      { x: 56, y: 50 },
    ]);
    expect(buildTerminalStubCandidate([], true)).toBeNull();
  });
});
