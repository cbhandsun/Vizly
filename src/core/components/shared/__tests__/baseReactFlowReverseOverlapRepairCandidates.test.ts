import { describe, expect, it } from 'vitest';

import {
  buildReverseOverlapRepairCandidates,
  type ReverseOverlapAxis,
  type ReverseOverlapPoint,
  type ReverseOverlapSegmentRef,
} from '../baseReactFlowReverseOverlapRepairCandidates';

const axisOf = (first: ReverseOverlapPoint, second: ReverseOverlapPoint): ReverseOverlapAxis | null => {
  if (first.y === second.y && first.x !== second.x) return 'h';
  if (first.x === second.x && first.y !== second.y) return 'v';
  return null;
};

const segmentRef = (
  path: readonly ReverseOverlapPoint[],
  segmentIndex: number,
): ReverseOverlapSegmentRef => ({
  segmentIndex,
  axis: axisOf(path[segmentIndex], path[segmentIndex + 1])!,
  a: path[segmentIndex],
  b: path[segmentIndex + 1],
});

const expectValidCandidates = (
  baseline: readonly ReverseOverlapPoint[],
  candidates: readonly (readonly ReverseOverlapPoint[])[],
) => {
  expect(candidates.length).toBeGreaterThan(0);
  for (const candidate of candidates) {
    expect(candidate[0]).toEqual(baseline[0]);
    expect(candidate.at(-1)).toEqual(baseline.at(-1));
    expect(candidate.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    const axes = candidate.slice(0, -1).map((point, index) => axisOf(point, candidate[index + 1]));
    expect(axes.every(Boolean)).toBe(true);
    expect(axes.every((axis, index) => index === 0 || axis !== axes[index - 1])).toBe(true);
  }
};

describe('buildReverseOverlapRepairCandidates', () => {
  it('aligns the WMS reservation with its source axis before trying offset lanes', () => {
    const reservationPath: ReverseOverlapPoint[] = [
      { x: 1114, y: 1418 },
      { x: 1114, y: 1466 },
      { x: 1388, y: 1466 },
      { x: 1388, y: 1233 },
      { x: 1444, y: 1233 },
    ];
    const reverseSegment: ReverseOverlapSegmentRef = {
      segmentIndex: 4,
      axis: 'h',
      a: { x: 1388, y: 1466 },
      b: { x: 1059, y: 1466 },
    };

    const candidates = buildReverseOverlapRepairCandidates(
      reservationPath,
      segmentRef(reservationPath, 1),
      reverseSegment,
      undefined,
      'h',
    );

    expectValidCandidates(reservationPath, candidates);
    expect(candidates[0]).toEqual([
      { x: 1114, y: 1418 },
      { x: 1388, y: 1418 },
      { x: 1388, y: 1233 },
      { x: 1444, y: 1233 },
    ]);
    expect(candidates).toContainEqual([
      { x: 1114, y: 1418 },
      { x: 1114, y: 1490 },
      { x: 1388, y: 1490 },
      { x: 1388, y: 1233 },
      { x: 1444, y: 1233 },
    ]);
    expect(candidates[0].some(point => point.y === 1466 && point.x > 1114)).toBe(false);
  });

  it('builds the source-side outer bypass for opposite WMS replenish-task trunks', () => {
    const replenishTaskPath: ReverseOverlapPoint[] = [
      { x: 1960, y: 1198 },
      { x: 2032, y: 1198 },
      { x: 2032, y: 1246 },
      { x: 2232, y: 1246 },
      { x: 2232, y: 1020 },
      { x: 2287, y: 1020 },
    ];
    const reverseTaskGroupSegment: ReverseOverlapSegmentRef = {
      segmentIndex: 3,
      axis: 'v',
      a: { x: 2032, y: 1246 },
      b: { x: 2032, y: 1080 },
    };

    const candidates = buildReverseOverlapRepairCandidates(
      replenishTaskPath,
      segmentRef(replenishTaskPath, 1),
      reverseTaskGroupSegment,
    );
    const flattenedReturn = candidates.find(candidate => candidate.length === 4);
    const outerBypass = candidates.find(candidate => (
      candidate[0]?.x === 1960
      && candidate[1]?.x === 2008
      && candidate[1]?.y === 1198
      && candidate[2]?.x === 2008
      && candidate[2]?.y === 1270
      && candidate[3]?.x === 2232
      && candidate[3]?.y === 1270
    ));

    expectValidCandidates(replenishTaskPath, candidates);
    expect(flattenedReturn).toEqual([
      { x: 1960, y: 1198 },
      { x: 2032, y: 1198 },
      { x: 2032, y: 1020 },
      { x: 2287, y: 1020 },
    ]);
    expect(outerBypass?.slice(0, 4)).toEqual([
      { x: 1960, y: 1198 },
      { x: 2008, y: 1198 },
      { x: 2008, y: 1270 },
      { x: 2232, y: 1270 },
    ]);
  });

  it('moves the opposing task-group trunk beyond the adjacent replenish branch', () => {
    const replenishPath: ReverseOverlapPoint[] = [
      { x: 1960, y: 1198 }, { x: 2032, y: 1198 }, { x: 2032, y: 1225 },
      { x: 2232, y: 1225 }, { x: 2232, y: 1020 }, { x: 2287, y: 1020 },
    ];
    const taskGroupPath: ReverseOverlapPoint[] = [
      { x: 1961, y: 1246 }, { x: 2032, y: 1246 }, { x: 2032, y: 972 },
      { x: 2578, y: 972 }, { x: 2578, y: 1253 }, { x: 2650, y: 1253 },
    ];
    const candidates = buildReverseOverlapRepairCandidates(
      taskGroupPath,
      segmentRef(taskGroupPath, 1),
      segmentRef(replenishPath, 1),
      replenishPath,
      'h',
    );

    expect(candidates[0].slice(0, 4)).toEqual([
      { x: 1961, y: 1246 },
      { x: 2311, y: 1246 },
      { x: 2311, y: 972 },
      { x: 2578, y: 972 },
    ]);
  });
});
