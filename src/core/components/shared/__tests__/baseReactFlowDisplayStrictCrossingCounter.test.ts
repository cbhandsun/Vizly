import { describe, expect, it } from 'vitest';
import {
  candidateStrictCrossingsForEdge,
  type DisplayPoint,
  type DisplaySegment,
} from '../baseReactFlowDisplayGeometry';
import { createDisplayStrictCrossingCounter } from '../baseReactFlowDisplayStrictCrossingCounter';

const vertical = (x: number, bottom = 10, top = -10): DisplaySegment => ({
  edgeIndex: 0, segmentIndex: 0, axis: 'v', direction: 1,
  a: { x, y: top }, b: { x, y: bottom },
});
const transpose = (segment: DisplaySegment): DisplaySegment => ({
  ...segment, axis: segment.axis === 'h' ? 'v' : 'h',
  a: { x: segment.a.y, y: segment.a.x }, b: { x: segment.b.y, y: segment.b.x },
});

describe('display candidate strict crossing index', () => {
  it.each([false, true])('matches the original scorer at exact tolerance boundaries, transposed=%s', transposed => {
    const original = [
      vertical(0.5), vertical(0.500001), vertical(9.5), vertical(9.499999),
      vertical(5, 0.5), vertical(5, 0.500001), vertical(5, 10, -0.5), vertical(5, 10, -0.500001),
      vertical(NaN), vertical(Infinity), vertical(3, Infinity, -Infinity),
    ];
    const blockers = transposed ? original.map(transpose) : original;
    const count = createDisplayStrictCrossingCounter(blockers);
    for (const path of [
      [], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 10, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0.5, y: 0 }],
      [{ x: 0, y: 0 }, { x: 10, y: 0.500001 }],
      [{ x: NaN, y: 0 }, { x: 10, y: 0 }],
      [{ x: -Infinity, y: 0 }, { x: Infinity, y: 0 }],
    ]) {
      const points = transposed ? path.map(point => ({ x: point.y, y: point.x })) : path;
      expect(count(points)).toBe(candidateStrictCrossingsForEdge(0, points, blockers));
    }
  });

  it('snapshots blockers and observes subsequent candidate edits without stale caches', () => {
    const blockers = [vertical(5)];
    const candidate = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const count = createDisplayStrictCrossingCounter(blockers);
    blockers[0].a.x = 100;
    blockers.length = 0;
    expect(count(candidate)).toBe(1);
    candidate[1].x = 4;
    expect(count(candidate)).toBe(0);
    expect(createDisplayStrictCrossingCounter([])(candidate)).toBe(0);
  });

  it('matches ordered full scans over seeded paths and duplicate/self blockers', () => {
    let state = 7231;
    const number = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return (state % 10000) / 10 - 500;
    };
    const blockers = Array.from({ length: 300 }, (_, index) => {
      const segment = vertical(number(), number(), number());
      return index % 2 ? segment : transpose(segment);
    });
    blockers.push(blockers[0], blockers[1]);
    const before = structuredClone(blockers);
    const count = createDisplayStrictCrossingCounter(blockers);
    for (let probe = 0; probe < 120; probe += 1) {
      const path: DisplayPoint[] = [{ x: number(), y: number() }];
      for (let index = 1; index < 8; index += 1) {
        const previous = path[index - 1];
        path.push(index % 2 ? { x: number(), y: previous.y } : { x: previous.x, y: number() });
      }
      expect(count(path)).toBe(candidateStrictCrossingsForEdge(99, path, blockers));
    }
    expect(blockers).toEqual(before);
  });

  it('visits only the crossing coordinate range in a large sparse graph', () => {
    const blockers = Array.from({ length: 10000 }, (_, index) => vertical(index * 10));
    const metrics = { candidateVisitCount: 0 };
    const path = [{ x: 19999, y: 0 }, { x: 20001, y: 0 }];
    const count = createDisplayStrictCrossingCounter(blockers, metrics);
    expect(count(path)).toBe(candidateStrictCrossingsForEdge(0, path, blockers));
    expect(metrics.candidateVisitCount).toBe(1);
  });
});
