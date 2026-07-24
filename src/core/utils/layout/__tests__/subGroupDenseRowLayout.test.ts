import { describe, expect, it } from 'vitest';
import { splitDenseRowsInSubGroupsWithConfig } from '../subGroupDenseRowLayout';

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
  NODE_MIN_WIDTH: 60,
  SUB_GROUP_PADDING: { H: 20, V_BOTTOM: 20 },
  SUB_GROUP_TITLE_HEIGHT: 30,
  SUB_GROUP_TITLE_SAFE_GAP: 6,
  SUB_GROUP_TITLE_CLEARANCE: 40,
};

const config = {
  subDomain: {
    padding: { horizontal: 20, top: 40, bottom: 20 },
    title: { height: 30, padding: { vertical: 6 } },
  },
  node: { width: 60, height: 30 },
};

const rowCounts = (nodes: any[]): number[] => {
  const counts = new Map<number, number>();
  for (const item of nodes.filter(nodeItem => nodeItem.type === 'default')) {
    counts.set(item.position.y, (counts.get(item.position.y) || 0) + 1);
  }
  return [...counts.values()];
};

describe('subGroupDenseRowLayout', () => {
  it('repeatedly chunks a dense row so every row respects maximumPerRow', () => {
    const children = Array.from({ length: 7 }, (_, index) => (
      node(
        `child-${index}`,
        'default',
        120,
        150,
        60,
        30,
        { sequence: index + 1 },
      )
    ));
    const inputs = [
      node('group', 'subGroup', 100, 100, 300, 160, {
        children: children.map(child => child.id),
      }),
      ...children,
    ];
    const result = splitDenseRowsInSubGroupsWithConfig(
      inputs, 2, layoutConfig, config,
    ) as any[];

    expect(Math.max(...rowCounts(result))).toBeLessThanOrEqual(2);
    expect(new Set(
      result.filter(item => item.type === 'default').map(item => item.position.y),
    ).size).toBe(4);
    expect(result[0].measured.height).toBeGreaterThan(inputs[0].measured.height);
    expect(inputs[1].position).toEqual({ x: 120, y: 150 });
  });

  it('also wraps by available width and preserves semantic order', () => {
    const result = splitDenseRowsInSubGroupsWithConfig(
      [
        node('group', 'subGroup', 100, 100, 180, 160, {
          children: ['late', 'early', 'middle'],
        }),
        node('late', 'default', 120, 150, 70, 30, { sequence: 3 }),
        node('early', 'default', 120, 150, 70, 30, { sequence: 1 }),
        node('middle', 'default', 120, 150, 70, 30, { sequence: 2 }),
      ],
      10,
      layoutConfig,
      config,
    ) as any[];
    const early = result.find(item => item.id === 'early')!;
    const middle = result.find(item => item.id === 'middle')!;
    const late = result.find(item => item.id === 'late')!;

    expect(early.position.y).toBeLessThan(middle.position.y);
    expect(middle.position.y).toBeLessThan(late.position.y);
  });

  it('lets configured maxPerRow override the call-site value', () => {
    const result = splitDenseRowsInSubGroupsWithConfig(
      [
        node('group', 'subGroup', 100, 100, 500, 160, {
          children: ['a', 'b', 'c', 'd'],
        }),
        node('a', 'default', 120, 150, 60, 30, { sequence: 1 }),
        node('b', 'default', 120, 150, 60, 30, { sequence: 2 }),
        node('c', 'default', 120, 150, 60, 30, { sequence: 3 }),
        node('d', 'default', 120, 150, 60, 30, { sequence: 4 }),
      ],
      4,
      layoutConfig,
      { ...config, layout: { maxPerRow: 2 } },
    ) as any[];

    expect(Math.max(...rowCounts(result))).toBe(2);
    expect(rowCounts(result)).toHaveLength(2);
  });

  it('deduplicates members and leaves hidden or container children untouched', () => {
    const result = splitDenseRowsInSubGroupsWithConfig(
      [
        node('group', 'subGroup', 100, 100, 300, 160, {
          children: ['a', 'a', 'b', 'hidden', 'nested', null, 42],
        }),
        node('a', 'default', 120, 150, 60, 30),
        node('b', 'default', 120, 150, 60, 30),
        node('hidden', 'default', 500, 500, 60, 30, { hidden: true }),
        node('nested', 'subGroup', 600, 600, 100, 80),
      ],
      2,
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

  it('bounds invalid positions, dimensions, row limits, and configuration', () => {
    const result = splitDenseRowsInSubGroupsWithConfig(
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
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: Number.NEGATIVE_INFINITY,
        NODE_MIN_WIDTH: Number.NaN,
      },
      {
        subDomain: {
          padding: {
            horizontal: Number.POSITIVE_INFINITY,
            top: Number.NEGATIVE_INFINITY,
            bottom: Number.NaN,
          },
        },
        node: { height: Number.POSITIVE_INFINITY },
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
