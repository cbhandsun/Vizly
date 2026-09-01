import { describe, expect, it, vi } from 'vitest';

import { createRoutingWaypointSegmentMemo } from '../edgeRoutingWaypointSegmentMemo';

describe('createRoutingWaypointSegmentMemo', () => {
  it('reuses only exact finite segment geometry', () => {
    const memo = createRoutingWaypointSegmentMemo<{ score: number }>();
    const create = vi.fn(() => ({ score: 12 }));
    const segment = { a: { x: 0, y: 4 }, b: { x: 100, y: 4 } };

    expect(memo.getOrCreate(segment, create)).toEqual({
      value: { score: 12 },
      cacheHit: false,
    });
    const firstHit = memo.getOrCreate({
      a: { ...segment.a },
      b: { ...segment.b },
    }, create);
    expect(firstHit).toEqual({
      value: { score: 12 },
      cacheHit: true,
    });
    expect(memo.getOrCreate(segment, create)).toBe(firstHit);
    expect(memo.getOrCreate({ a: segment.b, b: segment.a }, create).cacheHit).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('fails open for non-finite geometry', () => {
    const memo = createRoutingWaypointSegmentMemo<{ score: number }>();
    const create = vi.fn(() => ({ score: 7 }));
    const invalid = { a: { x: Number.NaN, y: 0 }, b: { x: 20, y: 0 } };

    expect(memo.getOrCreate(invalid, create).cacheHit).toBe(false);
    expect(memo.getOrCreate(invalid, create).cacheHit).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
