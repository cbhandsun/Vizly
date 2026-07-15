import { describe, expect, it } from 'vitest';

import {
  repairPairedTerminalApproachStrictCrossing,
  type OrthogonalPathPoint,
  type OrthogonalSegmentAxis,
  type OrthogonalSegmentRef,
} from '../baseReactFlowPairedTerminalApproachRepair';

const axisOf = (
  first: OrthogonalPathPoint,
  second: OrthogonalPathPoint,
): OrthogonalSegmentAxis | null => {
  if (first.y === second.y && first.x !== second.x) return 'h';
  if (first.x === second.x && first.y !== second.y) return 'v';
  return null;
};

const segmentRef = (
  paths: readonly [readonly OrthogonalPathPoint[], readonly OrthogonalPathPoint[]],
  edgeIndex: number,
  segIdx: number,
): OrthogonalSegmentRef => ({
  edgeIndex,
  segIdx,
  axis: axisOf(paths[edgeIndex][segIdx], paths[edgeIndex][segIdx + 1])!,
  a: paths[edgeIndex][segIdx],
  b: paths[edgeIndex][segIdx + 1],
});

const operationLaborPath: OrthogonalPathPoint[] = [
  { x: 3713, y: 850 },
  { x: 3713, y: 905 },
  { x: 3761, y: 905 },
  { x: 3761, y: 1129 },
  { x: 4813, y: 1129 },
  { x: 4813, y: 1582 },
  { x: 4885, y: 1582 },
];

const operationRealtimePath: OrthogonalPathPoint[] = [
  { x: 3712, y: 850 },
  { x: 3767, y: 850 },
  { x: 3767, y: 1100 },
  { x: 4386, y: 1100 },
  { x: 4386, y: 1349 },
  { x: 4441, y: 1349 },
];

describe('repairPairedTerminalApproachStrictCrossing', () => {
  it('fans a WMS terminal approach and crossing interior segment into separate inward lanes', () => {
    const paths = [operationLaborPath, operationRealtimePath] as const;
    const result = repairPairedTerminalApproachStrictCrossing(paths, [
      segmentRef(paths, 1, 3),
      segmentRef(paths, 0, 3),
    ]);

    expect(result).not.toBeNull();
    const [repairedLabor, repairedRealtime] = result!;
    expect(repairedLabor.slice(3, 5)).toEqual([
      { x: 3761, y: 1301 },
      { x: 4813, y: 1301 },
    ]);
    expect(repairedRealtime.slice(2, 4)).toEqual([
      { x: 3767, y: 1321 },
      { x: 4386, y: 1321 },
    ]);
    expect([repairedLabor[0], repairedLabor.at(-1)]).toEqual([
      operationLaborPath[0],
      operationLaborPath.at(-1),
    ]);
    expect([repairedRealtime[0], repairedRealtime.at(-1)]).toEqual([
      operationRealtimePath[0],
      operationRealtimePath.at(-1),
    ]);
    expect(result!.every(path => (
      path.slice(0, -1).every((point, index) => axisOf(point, path[index + 1]) !== null)
    ))).toBe(true);
  });

  it('returns null when a segment ref does not match its path', () => {
    const paths = [operationLaborPath, operationRealtimePath] as const;
    const mismatchedTerminalRef = {
      ...segmentRef(paths, 1, 3),
      a: { x: 4387, y: 1100 },
    };

    expect(repairPairedTerminalApproachStrictCrossing(paths, [
      segmentRef(paths, 0, 3),
      mismatchedTerminalRef,
    ])).toBeNull();
  });
});
