import { describe, expect, it } from 'vitest';

import {
  buildStrictCrossingZipperCandidates,
  type StrictCrossingZipperAxis,
  type StrictCrossingZipperBlocker,
  type StrictCrossingZipperPoint,
  type StrictCrossingZipperSegmentRef,
} from '../baseReactFlowStrictCrossingZipperRepair';

const axisOf = (
  first: StrictCrossingZipperPoint,
  second: StrictCrossingZipperPoint,
): StrictCrossingZipperAxis | null => {
  if (first.y === second.y && first.x !== second.x) return 'h';
  if (first.x === second.x && first.y !== second.y) return 'v';
  return null;
};

const segmentRef = (
  path: readonly StrictCrossingZipperPoint[],
  segmentIndex: number,
): StrictCrossingZipperSegmentRef => ({
  segmentIndex,
  axis: axisOf(path[segmentIndex], path[segmentIndex + 1])!,
  a: path[segmentIndex],
  b: path[segmentIndex + 1],
});

const blocker = (
  path: readonly StrictCrossingZipperPoint[],
  segmentIndex: number,
): StrictCrossingZipperBlocker => ({ path, segment: segmentRef(path, segmentIndex) });

const segmentLength = (
  first: StrictCrossingZipperPoint,
  second: StrictCrossingZipperPoint,
): number => Math.abs(first.x - second.x) + Math.abs(first.y - second.y);

const expectValidCandidate = (
  baseline: readonly StrictCrossingZipperPoint[],
  candidate: readonly StrictCrossingZipperPoint[],
): void => {
  expect(candidate[0]).toEqual(baseline[0]);
  expect(candidate.at(-1)).toEqual(baseline.at(-1));
  expect(candidate.slice(0, -1).every((point, index) => (
    axisOf(point, candidate[index + 1]) !== null
  ))).toBe(true);
  expect(candidate.slice(1, -2).every((point, index) => (
    segmentLength(point, candidate[index + 2]) >= 24
  ))).toBe(true);
};

describe('buildStrictCrossingZipperCandidates', () => {
  it('chains the TMS cost lane across driver and GPS blockers with readable 24px taps', () => {
    const costPath: StrictCrossingZipperPoint[] = [
      { x: 1437, y: 1827 },
      { x: 1485, y: 1827 },
      { x: 1485, y: 1907 },
      { x: 1537, y: 1907 },
      { x: 1537, y: 1954 },
      { x: 1682, y: 1954 },
      { x: 1682, y: 2751 },
    ];
    const driverPath: StrictCrossingZipperPoint[] = [
      { x: 1509, y: 1255 },
      { x: 1509, y: 1985 },
      { x: 1437, y: 1985 },
    ];
    const gpsPath: StrictCrossingZipperPoint[] = [
      { x: 1244, y: 994 },
      { x: 1554, y: 994 },
      { x: 1554, y: 1985 },
      { x: 1437, y: 1985 },
    ];

    const candidates = buildStrictCrossingZipperCandidates(
      costPath,
      segmentRef(costPath, 4),
      [blocker(driverPath, 0), blocker(gpsPath, 1)],
    );

    expect(candidates).toHaveLength(1);
    expectValidCandidate(costPath, candidates[0]);
    expect(candidates[0]).toEqual([
      { x: 1437, y: 1827 },
      { x: 1485, y: 1827 },
      { x: 1485, y: 1954 },
      { x: 1509, y: 1954 },
      { x: 1509, y: 1978 },
      { x: 1554, y: 1978 },
      { x: 1554, y: 2002 },
      { x: 1682, y: 2002 },
      { x: 1682, y: 2751 },
    ]);
  });

  it('rotates the same rule for a vertical route and follows its leftward successor', () => {
    const targetPath: StrictCrossingZipperPoint[] = [
      { x: 200, y: 200 },
      { x: 150, y: 200 },
      { x: 150, y: 20 },
      { x: 50, y: 20 },
    ];
    const lowerBlocker: StrictCrossingZipperPoint[] = [
      { x: 0, y: 176 },
      { x: 240, y: 176 },
    ];
    const upperBlocker: StrictCrossingZipperPoint[] = [
      { x: 0, y: 120 },
      { x: 240, y: 120 },
    ];

    const [candidate] = buildStrictCrossingZipperCandidates(
      targetPath,
      segmentRef(targetPath, 1),
      [blocker(upperBlocker, 0), blocker(lowerBlocker, 0)],
    );

    expectValidCandidate(targetPath, candidate);
    expect(candidate).toEqual([
      { x: 200, y: 200 },
      { x: 150, y: 200 },
      { x: 150, y: 176 },
      { x: 126, y: 176 },
      { x: 126, y: 120 },
      { x: 102, y: 120 },
      { x: 102, y: 20 },
      { x: 50, y: 20 },
    ]);
  });

  it('rejects blocker spacing that would create an interior segment shorter than 24px', () => {
    const targetPath: StrictCrossingZipperPoint[] = [
      { x: 0, y: -48 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 120 },
    ];
    const firstBlocker: StrictCrossingZipperPoint[] = [
      { x: 24, y: -80 },
      { x: 24, y: 80 },
    ];
    const closeBlocker: StrictCrossingZipperPoint[] = [
      { x: 40, y: -80 },
      { x: 40, y: 80 },
    ];

    expect(buildStrictCrossingZipperCandidates(
      targetPath,
      segmentRef(targetPath, 1),
      [blocker(firstBlocker, 0), blocker(closeBlocker, 0)],
    )).toEqual([]);
  });

  it('skips a later blocker after the first tap has moved onto a clear lane', () => {
    const targetPath: StrictCrossingZipperPoint[] = [
      { x: 0, y: -48 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 120 },
    ];
    const firstBlocker: StrictCrossingZipperPoint[] = [
      { x: 24, y: -80 },
      { x: 24, y: 80 },
    ];
    const clearedBlocker: StrictCrossingZipperPoint[] = [
      { x: 60, y: -10 },
      { x: 60, y: 10 },
    ];

    const [candidate] = buildStrictCrossingZipperCandidates(
      targetPath,
      segmentRef(targetPath, 1),
      [blocker(firstBlocker, 0), blocker(clearedBlocker, 0)],
    );

    expect(candidate).toEqual([
      { x: 0, y: -48 },
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 24, y: 24 },
      { x: 100, y: 24 },
      { x: 100, y: 120 },
    ]);
  });

  it('rejects a blocker segment ref that does not match its supplied path', () => {
    const targetPath: StrictCrossingZipperPoint[] = [
      { x: 0, y: -48 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 120 },
    ];
    const blockerPath: StrictCrossingZipperPoint[] = [
      { x: 40, y: -80 },
      { x: 40, y: 80 },
    ];
    const mismatched = {
      path: blockerPath,
      segment: {
        ...segmentRef(blockerPath, 0),
        a: { x: 41, y: -80 },
      },
    };

    expect(buildStrictCrossingZipperCandidates(
      targetPath,
      segmentRef(targetPath, 1),
      [mismatched],
    )).toEqual([]);
  });
});
