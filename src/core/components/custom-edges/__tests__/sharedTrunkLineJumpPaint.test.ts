import { describe, expect, it } from 'vitest';
import { injectLineJumps } from '../../../services/LineJumpEngine';
import {
  createSharedTrunkBackboneFragments,
  createSharedTrunkPaintFragments,
} from '../../../rendering/sharedTrunkPaint';
import type { SharedTrunkPaintPlan } from '../../../rendering/sharedTrunkPaint';

const crossing = {
  point: { x: 1955, y: 2754 },
  horizontalEdgeId: 'horizontal',
  verticalEdgeId: 'vertical',
};

const plan = (hiddenRanges: SharedTrunkPaintPlan['hiddenRanges'], backboneRanges: SharedTrunkPaintPlan['backboneRanges'] = []): SharedTrunkPaintPlan => ({
  version: 1,
  edgeId: 'horizontal',
  hiddenRanges,
  memberships: [],
  backboneRanges,
  junctions: [],
});

describe('shared trunk line-jump paint windows', () => {
  it('extends a visible branch when its split would clip a required bridge', () => {
    const points = [
      { x: 5992, y: 2754 },
      { x: 1787, y: 2754 },
      { x: 1787, y: 1934 },
    ];
    const fragments = createSharedTrunkPaintFragments(
      points,
      plan([{ from: 0, to: 4032, role: 'source', ownerEdgeId: 'owner' }]),
      [crossing],
      6,
    );

    expect(fragments).toHaveLength(1);
    expect(fragments[0].points[0]).toEqual({ x: 1961.5, y: 2754 });
    expect(injectLineJumps([...fragments[0].points], [crossing], 6, 0)).toContain('A 6 6');
    expect(fragments[0]).toMatchObject({ startsAtSource: false, endsAtTarget: true });
  });

  it('extends a canonical backbone at either boundary without changing its ownership range', () => {
    const points = [{ x: 1800, y: 100 }, { x: 2200, y: 100 }];
    const jump = { ...crossing, point: { x: 1995, y: 100 } };
    const backboneRange = {
      from: 0,
      to: 200,
      role: 'source' as const,
      ownerEdgeId: 'horizontal',
      membershipId: 'source:hub:horizontal',
      paint: {
        token: 'semantic' as const,
        stroke: '#64748B',
        strokeWidth: 2,
        strokeDasharray: '',
        opacity: 1,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
      },
    };
    const fragments = createSharedTrunkBackboneFragments(
      points,
      plan([], [backboneRange]),
      [jump],
      6,
    );

    expect(fragments[0]).toMatchObject({ from: 0, to: 200 });
    expect(fragments[0].points.at(-1)).toEqual({ x: 2001.5, y: 100 });
    expect(injectLineJumps([...fragments[0].points], [jump], 6, 0)).toContain('A 6 6');
  });

  it('does not expand for invalid radii, off-fragment jumps, or malformed coordinates', () => {
    const points = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const paintPlan = plan([{ from: 0, to: 100, role: 'source', ownerEdgeId: 'owner' }]);
    const baseline = createSharedTrunkPaintFragments(points, paintPlan);
    const outside = { ...crossing, point: { x: 40, y: 0 } };
    const malformed = { ...crossing, point: { x: Number.NaN, y: 0 } };

    expect(createSharedTrunkPaintFragments(points, paintPlan, [outside], 6)).toEqual(baseline);
    expect(createSharedTrunkPaintFragments(points, paintPlan, [malformed], 6)).toEqual(baseline);
    expect(createSharedTrunkPaintFragments(points, paintPlan, [crossing], Number.NaN)).toEqual(baseline);
  });
});
