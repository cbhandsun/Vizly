import { describe, expect, it } from 'vitest';
import { findStrictCrossings, type Point } from '../edgeDetachedOverlapGeometry';
import { createSingleMoverStrictCrossingCounter } from '../edgeSingleMoverStrictCrossingCounter';

const edgesFor = (paths: Point[][]) => paths.map((_, index) => ({ id: String(index), source: 'shared', target: String(index) }));

describe('single mover exact strict crossing count', () => {
  it('preserves crossings between frozen edges and counts each mover crossing once', () => {
    const paths = [
      [{ x: 0, y: 10 }, { x: 100, y: 10 }],
      [{ x: 20, y: 0 }, { x: 20, y: 100 }],
      [{ x: 0, y: 30 }, { x: 100, y: 30 }],
    ];
    const edges = edgesFor(paths);
    const counter = createSingleMoverStrictCrossingCounter(paths, edges, 0);
    expect(counter.baseline).toBe(2);
    expect(counter.count([{ x: 0, y: -10 }, { x: 100, y: -10 }])).toBe(1);
    expect(counter.count(paths[0])).toBe(2);
    paths[1][0].x = 900;
    paths[1][1].x = 900;
    expect(counter.count(paths[0])).toBe(2);
  });

  it('matches the full scorer for every mover, short segments, invalid numbers and repeated candidates', () => {
    const paths = [
      [{ x: 0, y: 10 }, { x: 100, y: 10 }],
      [{ x: 20, y: 0 }, { x: 20, y: 100 }],
      [{ x: 0, y: 30 }, { x: 100, y: 30 }],
      [{ x: 80, y: 0 }, { x: 80, y: 100 }],
    ];
    const edges = edgesFor(paths);
    const candidates = [[], [{ x: 0, y: 0 }],
      [{ x: 20, y: 9.5 }, { x: 20, y: 25 }],
      [{ x: 20, y: 9.4999 }, { x: 20, y: 25 }],
      [{ x: 18, y: 10 }, { x: 23, y: 10 }],
      [{ x: NaN, y: 0 }, { x: 20, y: 30 }],
      [{ x: -Infinity, y: 50 }, { x: Infinity, y: 50 }],
      ...paths,
    ];
    for (let mover = 0; mover < paths.length; mover += 1) {
      const counter = createSingleMoverStrictCrossingCounter(paths, edges, mover);
      for (const candidate of [...candidates, ...candidates]) {
        expect(counter.count(candidate)).toBe(findStrictCrossings(paths.map((path, index) => index === mover ? candidate : path), edges).length);
      }
    }
  });

  it('matches seeded full-graph recomputation', () => {
    let state = 173;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % 1000; };
    const path = (): Point[] => {
      const x = next(); const y = next(); const bend = next();
      return [{ x, y }, { x: bend, y }, { x: bend, y: next() }];
    };
    const paths = Array.from({ length: 60 }, path);
    const edges = edgesFor(paths);
    for (const mover of [0, 13, 59]) {
      const counter = createSingleMoverStrictCrossingCounter(paths, edges, mover);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const candidate = path();
        expect(counter.count(candidate)).toBe(findStrictCrossings(paths.map((item, index) => index === mover ? candidate : item), edges).length);
      }
    }
  });

  it('rejects invalid graph indices instead of silently returning a partial count', () => {
    const paths = [[{ x: 0, y: 0 }, { x: 100, y: 0 }]];
    for (const index of [-1, 0.5, 1, NaN, Infinity]) {
      expect(() => createSingleMoverStrictCrossingCounter(paths, edgesFor(paths), index)).toThrow(RangeError);
    }
    expect(() => createSingleMoverStrictCrossingCounter([], [], 0)).toThrow(RangeError);
    expect(() => createSingleMoverStrictCrossingCounter(paths, [], 0)).toThrow(RangeError);
    expect(createSingleMoverStrictCrossingCounter(paths, edgesFor(paths), 0).count([])).toBe(0);
  });
});
