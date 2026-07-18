import { describe, expect, it } from 'vitest';
import { resolveSubGroupChildrenOverlapsWithConfig } from '../subGroupChildOverlapResolution';

const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Record<string, unknown> = {},
) => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data,
}) as any;

const layoutConfig = {
  NODE_H_GAP: 20,
  NODE_V_GAP: 30,
  SUB_GROUP_PADDING: { H: 20, V_BOTTOM: 20 },
  SUB_GROUP_TITLE_CLEARANCE: 40,
};

const config = {
  subDomain: {
    title: { height: 30, padding: { vertical: 6 } },
  },
};

const overlaps = (left: any, right: any): boolean => (
  left.position.x < right.position.x + right.measured.width
  && left.position.x + left.measured.width > right.position.x
  && left.position.y < right.position.y + right.measured.height
  && left.position.y + left.measured.height > right.position.y
);

describe('subGroupChildOverlapResolution', () => {
  it('separates overlapping children and keeps them inside subgroup content bounds', () => {
    const inputs = [
      node('group', 'subGroup', 100, 100, 220, 160, {
        children: ['a', 'b', 'c'],
      }),
      node('a', 'default', 120, 130, 60, 30),
      node('b', 'default', 120, 130, 60, 30),
      node('c', 'default', 120, 130, 60, 30),
    ];
    const result = resolveSubGroupChildrenOverlapsWithConfig(
      inputs, 20, 30, layoutConfig, config,
    ) as any[];
    const group = result[0];
    const children = result.slice(1);

    for (let left = 0; left < children.length; left += 1) {
      for (let right = left + 1; right < children.length; right += 1) {
        expect(overlaps(children[left], children[right])).toBe(false);
      }
    }
    for (const child of children) {
      expect(child.position.x).toBeGreaterThanOrEqual(group.position.x + 20);
      expect(child.position.y).toBeGreaterThanOrEqual(group.position.y + 40);
      expect(child.position.x + child.measured.width).toBeLessThanOrEqual(
        group.position.x + group.measured.width - 20,
      );
      expect(child.position.y + child.measured.height).toBeLessThanOrEqual(
        group.position.y + group.measured.height - 20,
      );
    }
    expect(inputs[2].position).toEqual({ x: 120, y: 130 });
  });

  it('expands a congested subgroup instead of reintroducing overlaps by clamping', () => {
    const result = resolveSubGroupChildrenOverlapsWithConfig(
      [
        node('group', 'subGroup', 100, 100, 100, 100, {
          children: ['a', 'b', 'c', 'd'],
        }),
        node('a', 'default', 120, 140, 80, 50),
        node('b', 'default', 120, 140, 80, 50),
        node('c', 'default', 120, 140, 80, 50),
        node('d', 'default', 120, 140, 80, 50),
      ],
      20,
      30,
      layoutConfig,
      config,
    ) as any[];
    const group = result[0];
    const children = result.slice(1);

    expect(group.measured.height).toBeGreaterThan(100);
    for (let left = 0; left < children.length; left += 1) {
      for (let right = left + 1; right < children.length; right += 1) {
        expect(overlaps(children[left], children[right])).toBe(false);
      }
    }
  });

  it('preserves Dagre-managed subgroups', () => {
    const inputs = [
      node('group', 'subGroup', 100, 100, 220, 160, {
        children: ['a', 'b'],
        __dagreSized: { w: 220, h: 160 },
      }),
      node('a', 'default', 120, 130, 60, 30),
      node('b', 'default', 120, 130, 60, 30),
    ];
    const result = resolveSubGroupChildrenOverlapsWithConfig(
      inputs, 20, 30, layoutConfig, config,
    ) as any[];

    expect(result[1].position).toEqual({ x: 120, y: 130 });
    expect(result[2].position).toEqual({ x: 120, y: 130 });
    expect(result[0].measured).toEqual({ width: 220, height: 160 });
  });

  it('deduplicates members and ignores hidden or container children', () => {
    const result = resolveSubGroupChildrenOverlapsWithConfig(
      [
        node('group', 'subGroup', 100, 100, 220, 160, {
          children: ['a', 'a', 'b', 'hidden', 'nested', null, 42],
        }),
        node('a', 'default', 120, 130, 60, 30),
        node('b', 'default', 120, 130, 60, 30),
        node('hidden', 'default', 500, 500, 60, 30, { hidden: true }),
        node('nested', 'subGroup', 600, 600, 100, 80),
      ],
      20,
      30,
      layoutConfig,
      config,
    ) as any[];

    expect(result.find(item => item.id === 'hidden')!.position).toEqual({
      x: 500,
      y: 500,
    });
    expect(result.find(item => item.id === 'nested')!.position).toEqual({
      x: 600,
      y: 600,
    });
  });

  it('bounds invalid positions, dimensions, gaps, and configuration', () => {
    const result = resolveSubGroupChildrenOverlapsWithConfig(
      [
        node(
          'group',
          'subGroup',
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          { children: ['a', 'b'] },
        ),
        node(
          'a',
          'default',
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ),
        node(
          'b',
          'default',
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
        ),
      ],
      Number.POSITIVE_INFINITY,
      -100,
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: Number.NEGATIVE_INFINITY,
        SUB_GROUP_PADDING: { H: Number.NaN },
      },
      {
        subDomain: {
          title: {
            height: Number.POSITIVE_INFINITY,
            padding: { vertical: Number.NEGATIVE_INFINITY },
          },
        },
      },
    ) as any[];

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Number.isFinite(item.measured.width)).toBe(true);
      expect(Number.isFinite(item.measured.height)).toBe(true);
    }
  });
});
