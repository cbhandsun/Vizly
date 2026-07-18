import { describe, expect, it } from 'vitest';
import {
  enforceSubGroupStrictContainmentWithConfig,
  expandSubGroupContainersBySemanticWithConfig,
} from '../subGroupContainerBounds';

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
  NODE_H_GAP: 50,
  NODE_V_GAP: 40,
  NODE_MIN_WIDTH: 60,
  SUB_GROUP_PADDING: { H: 20, V_TOP: 40, V_BOTTOM: 20 },
  SUB_GROUP_TITLE_HEIGHT: 30,
  SUB_GROUP_TITLE_SAFE_GAP: 6,
  SUB_GROUP_TITLE_CLEARANCE: 40,
  ENSURE_SUB_GROUP_TITLE_CLEARANCE: true,
};

const config = {
  subDomain: {
    padding: { horizontal: 20, top: 40, bottom: 20 },
    title: { height: 30, padding: { vertical: 6 }, safeGap: 4 },
  },
  node: { width: 60, height: 30 },
};

describe('subGroupContainerBounds', () => {
  it('expands from unique visible semantic members without shrinking existing bounds', () => {
    const inputs = [
      node('group', 'subGroup', 100, 100, 80, 80, {
        children: ['a', 'a', 'b', 'hidden', 'nested', 'missing', 42],
      }),
      node('a', 'default', 200, 180, 60, 30),
      node('b', 'default', 320, 184, 60, 30),
      node('hidden', 'default', 800, 800, 60, 30, { hidden: true }),
      node('nested', 'subGroup', 900, 900, 300, 200),
    ];
    const result = expandSubGroupContainersBySemanticWithConfig(
      inputs, layoutConfig, config,
    ) as any[];
    const group = result[0];

    expect(group.position).toEqual({ x: 180, y: 140 });
    expect(group.measured).toEqual({ width: 232, height: 90 });
    expect(inputs[0].position).toEqual({ x: 100, y: 100 });
    expect(inputs[0].measured).toEqual({ width: 80, height: 80 });
  });

  it('preserves a larger existing container during semantic expansion', () => {
    const result = expandSubGroupContainersBySemanticWithConfig(
      [
        node('group', 'subGroup', 0, 0, 500, 400, { children: ['a'] }),
        node('a', 'default', 200, 180, 60, 30),
      ],
      layoutConfig,
      config,
    ) as any[];

    expect(result[0].measured).toEqual({ width: 500, height: 400 });
  });

  it('strictly recomputes projection size while preserving the container anchor', () => {
    const result = enforceSubGroupStrictContainmentWithConfig(
      [
        node('group', 'subGroup', 100, 100, 500, 400, {
          children: ['a', 'b'],
        }),
        node('a', 'default', 200, 180, 60, 30),
        node('b', 'default', 320, 184, 60, 30),
      ],
      layoutConfig,
      config,
    ) as any[];

    expect(result[0].position).toEqual({ x: 100, y: 100 });
    expect(result[0].measured).toEqual({ width: 220, height: 134 });
  });

  it('uses measured dimensions before style and direct dimensions', () => {
    const child = node('a', 'default', 100, 100, 70, 35);
    child.style = { width: 500, height: 500 };
    child.width = 800;
    child.height = 800;
    const result = enforceSubGroupStrictContainmentWithConfig(
      [
        node('group', 'subGroup', 0, 0, 100, 100, { children: ['a'] }),
        child,
      ],
      layoutConfig,
      config,
    ) as any[];

    expect(result[0].measured).toEqual({ width: 110, height: 135 });
  });

  it('leaves containers without valid members unchanged', () => {
    const result = expandSubGroupContainersBySemanticWithConfig(
      [
        node('group', 'subGroup', 10, 20, 300, 200, {
          children: [null, 42, 'missing'],
        }),
      ],
      layoutConfig,
      config,
    ) as any[];

    expect(result[0].position).toEqual({ x: 10, y: 20 });
    expect(result[0].measured).toEqual({ width: 300, height: 200 });
  });

  it('bounds invalid coordinates, dimensions, and configuration', () => {
    const result = expandSubGroupContainersBySemanticWithConfig(
      [
        node(
          'group',
          'subGroup',
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          { children: ['a'] },
        ),
        node(
          'a',
          'default',
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ),
      ],
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
