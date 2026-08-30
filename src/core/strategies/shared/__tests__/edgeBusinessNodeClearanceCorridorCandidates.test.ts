import { describe, expect, it } from 'vitest';

import { buildBusinessNodeTerminalCorridorCandidates } from '../edgeBusinessNodeClearanceCorridorCandidates';

describe('business-node terminal corridor candidates', () => {
  it('builds bounded vertical corridors around every risky obstacle', () => {
    const path = [
      { x: 1709, y: 911 },
      { x: 1709, y: 863 },
      { x: 1757, y: 863 },
      { x: 1757, y: 782 },
      { x: 2757, y: 782 },
      { x: 2757, y: 341 },
    ];
    const rects = [
      { x: 1606, y: 677, width: 206, height: 96 },
      { x: 2543, y: 484, width: 206, height: 73 },
    ];

    const candidates = buildBusinessNodeTerminalCorridorCandidates(path, rects, 16);

    expect(candidates).toContainEqual([
      { x: 1709, y: 911 },
      { x: 1709, y: 863 },
      { x: 2527, y: 863 },
      { x: 2527, y: 468 },
      { x: 2757, y: 468 },
      { x: 2757, y: 341 },
    ]);
    expect(candidates.length).toBeLessThanOrEqual(12);
    expect(path[2]).toEqual({ x: 1757, y: 863 });
  });

  it('builds the horizontal transpose and rejects malformed terminal geometry', () => {
    const horizontal = buildBusinessNodeTerminalCorridorCandidates([
      { x: 0, y: 20 },
      { x: 48, y: 20 },
      { x: 48, y: 40 },
      { x: 252, y: 40 },
      { x: 252, y: 20 },
      { x: 300, y: 20 },
    ], [
      { x: 100, y: 0, width: 40, height: 60 },
      { x: 140, y: 0, width: 40, height: 60 },
    ], 16);
    expect(horizontal).toContainEqual([
      { x: 0, y: 20 },
      { x: 48, y: 20 },
      { x: 48, y: -16 },
      { x: 252, y: -16 },
      { x: 252, y: 20 },
      { x: 300, y: 20 },
    ]);
    expect(buildBusinessNodeTerminalCorridorCandidates([], [], 16)).toEqual([]);
    expect(buildBusinessNodeTerminalCorridorCandidates([
      { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 160 },
    ], [{ x: 40, y: 40, width: 20, height: 20 }], 16)).toEqual([]);
    expect(buildBusinessNodeTerminalCorridorCandidates([
      { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 252, y: 0 }, { x: 300, y: 0 },
    ], [{ x: 100, y: 40, width: 20, height: 20 }], Number.NaN)).toEqual([]);
    expect(buildBusinessNodeTerminalCorridorCandidates([
      { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 252, y: 0 }, { x: 300, y: 0 },
    ], [{ x: Number.POSITIVE_INFINITY, y: 0, width: 20, height: 20 }], 16)).toEqual([]);
  });

  it('caps extreme blocker sets without producing non-finite coordinates', () => {
    const rects = Array.from({ length: 100 }, (_, index) => ({
      x: 100 + index * 4,
      y: -10,
      width: 20,
      height: 20,
    }));
    const candidates = buildBusinessNodeTerminalCorridorCandidates([
      { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 452, y: 0 }, { x: 500, y: 0 },
    ], rects, 16);
    expect(candidates.length).toBeLessThanOrEqual(12);
    expect(candidates.flat().every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
      .toBe(true);
  });
});
