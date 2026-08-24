import { describe, expect, it } from 'vitest';

import {
  createOrthogonalSegmentCrossingIndex,
  type IndexedOrthogonalSegment,
} from '../edgeLocalDoglegSegmentIndex';

const strictCross = (
  first: IndexedOrthogonalSegment,
  second: IndexedOrthogonalSegment,
): boolean => {
  const firstHorizontal = Math.abs(first.a.y - first.b.y) <= 0.5;
  const secondHorizontal = Math.abs(second.a.y - second.b.y) <= 0.5;
  if (firstHorizontal === secondHorizontal) return false;
  const horizontal = firstHorizontal ? first : second;
  const vertical = firstHorizontal ? second : first;
  return vertical.a.x > Math.min(horizontal.a.x, horizontal.b.x) + 1
    && vertical.a.x < Math.max(horizontal.a.x, horizontal.b.x) - 1
    && horizontal.a.y > Math.min(vertical.a.y, vertical.b.y) + 1
    && horizontal.a.y < Math.max(vertical.a.y, vertical.b.y) - 1;
};

const exhaustiveCount = (
  candidates: readonly IndexedOrthogonalSegment[],
  indexed: readonly IndexedOrthogonalSegment[],
): number => candidates.reduce((total, candidate) => total + indexed.filter(
  segment => strictCross(candidate, segment),
).length, 0);

describe('local dogleg segment crossing index', () => {
  it('matches exhaustive strict crossing counts at reversed and boundary ranges', () => {
    const indexed: IndexedOrthogonalSegment[] = [
      { a: { x: 20, y: -20 }, b: { x: 20, y: 120 } },
      { a: { x: 50, y: 120 }, b: { x: 50, y: -20 } },
      { a: { x: 80, y: -20 }, b: { x: 80, y: 120 } },
      { a: { x: -20, y: 25 }, b: { x: 120, y: 25 } },
      { a: { x: 120, y: 75 }, b: { x: -20, y: 75 } },
    ];
    const candidates: IndexedOrthogonalSegment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100, y: 50 }, b: { x: 0, y: 50 } },
      { a: { x: 0, y: 100 }, b: { x: 100, y: 100 } },
      { a: { x: 0, y: 100 }, b: { x: 0, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
      { a: { x: 100, y: 0 }, b: { x: 100, y: 100 } },
    ];
    const index = createOrthogonalSegmentCrossingIndex(indexed);
    expect(index).not.toBeNull();
    expect(index?.countCrossings(candidates)).toBe(exhaustiveCount(candidates, indexed));
  });

  it('matches exhaustive counts over a deterministic coordinate matrix', () => {
    const indexed: IndexedOrthogonalSegment[] = [];
    const candidates: IndexedOrthogonalSegment[] = [];
    for (let value = -80; value <= 80; value += 8) {
      indexed.push({ a: { x: value, y: -100 }, b: { x: value, y: 100 } });
      indexed.push({ a: { x: -100, y: value }, b: { x: 100, y: value } });
    }
    for (let value = -90; value <= 90; value += 9) {
      candidates.push({ a: { x: -70, y: value }, b: { x: 70, y: value } });
      candidates.push({ a: { x: value, y: -70 }, b: { x: value, y: 70 } });
    }
    const index = createOrthogonalSegmentCrossingIndex(indexed);
    expect(index?.countCrossings(candidates)).toBe(exhaustiveCount(candidates, indexed));
  });

  it('returns only after proving a bound was exceeded', () => {
    const indexed: IndexedOrthogonalSegment[] = [20, 40, 60, 80].map(x => ({
      a: { x, y: -20 },
      b: { x, y: 20 },
    }));
    const candidate = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }];
    const index = createOrthogonalSegmentCrossingIndex(indexed);
    expect(index?.countCrossings(candidate, 0)).toBeGreaterThan(0);
    expect(index?.countCrossings(candidate, 4)).toBe(4);
  });

  it('fails closed so callers can use exhaustive scanning for invalid geometry', () => {
    expect(createOrthogonalSegmentCrossingIndex([{
      a: { x: Number.NaN, y: 0 },
      b: { x: 10, y: 0 },
    }])).toBeNull();
    expect(createOrthogonalSegmentCrossingIndex([{
      a: { x: 0, y: 0 },
      b: { x: 10, y: 10 },
    }])).toBeNull();
    const validIndex = createOrthogonalSegmentCrossingIndex([{
      a: { x: 5, y: -10 },
      b: { x: 5, y: 10 },
    }]);
    expect(validIndex?.countCrossings([{
      a: { x: 0, y: 0 },
      b: { x: Number.POSITIVE_INFINITY, y: 0 },
    }])).toBeNull();
  });
});
