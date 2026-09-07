import { describe, expect, it } from 'vitest';
import { isReadableOrthogonalCrossing, type CrossingPoint } from '../orthogonalCrossingPolicy';

const segment = (a: CrossingPoint, b: CrossingPoint) => ({ a, b });
const horizontal = segment({ x: 0, y: 50 }, { x: 100, y: 50 });

describe('ordinary orthogonal crossing policy', () => {
  it.each([0, 1, 2, 3])('is invariant under quarter turn %i and fractional translation', turns => {
    const transform = (point: CrossingPoint): CrossingPoint => {
      let { x, y } = point;
      for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
      return { x: x + 317.175, y: y - 211.625 };
    };
    const first = segment(transform(horizontal.a), transform(horizontal.b));
    const second = segment(transform({ x: 50, y: 0 }), transform({ x: 50, y: 100 }));
    expect(isReadableOrthogonalCrossing(first, second)).toBe(true);
    expect(isReadableOrthogonalCrossing(second, first)).toBe(true);
    expect(isReadableOrthogonalCrossing(segment(first.b, first.a), second)).toBe(true);
  });

  it.each([0, 1, 23.999, 76.001, 99, 100, 120])('rejects endpoint/bend proximity at x=%s', x => {
    expect(isReadableOrthogonalCrossing(horizontal, segment({ x, y: 0 }, { x, y: 100 }))).toBe(false);
  });

  it.each([24, 50, 76])('allows the full rendering clearance at x=%s', x => {
    expect(isReadableOrthogonalCrossing(horizontal, segment({ x, y: 0 }, { x, y: 100 }))).toBe(true);
  });

  it.each([
    segment({ x: 0, y: 50 }, { x: 100, y: 50 }),
    segment({ x: 50, y: 0 }, { x: 51, y: 100 }),
    segment({ x: 50, y: 50 }, { x: 50, y: 50 }),
    segment({ x: Number.NaN, y: 0 }, { x: 50, y: 100 }),
    segment({ x: 50, y: 0 }, { x: Infinity, y: 100 }),
    segment({ x: 1e308, y: 0 }, { x: 1e308, y: 100 }),
  ])('does not turn overlap, malformed or degenerate geometry into a bridge: %j', second => {
    expect(isReadableOrthogonalCrossing(horizontal, second)).toBe(false);
  });
});
