import { describe, expect, it } from 'vitest';
import {
  rankSnapDomainFreeNodesWithConfig,
  rankSnapSubGroupChildrenWithConfig,
} from '../rankSnapLayout';

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
  NODE_V_GAP: 40,
  NODE_MIN_WIDTH: 60,
  SUB_GROUP_PADDING: { H: 20, V_BOTTOM: 20 },
  SUB_GROUP_TITLE_HEIGHT: 30,
  SUB_GROUP_TITLE_SAFE_GAP: 6,
  SUB_GROUP_TITLE_CLEARANCE: 40,
};

const config = {
  domain: {
    padding: { horizontal: 20 },
    title: { height: 40, padding: { vertical: 10 }, safeGap: 12 },
  },
  subDomain: {
    padding: { horizontal: 20, top: 40, bottom: 20 },
    title: { height: 30, padding: { vertical: 6 } },
  },
  node: { width: 60, height: 30 },
};

describe('rankSnapLayout', () => {
  it('snaps subgroup children into stable semantic ranks and resizes the container', () => {
    const inputs = [
      node('group', 'subGroup', 100, 100, 340, 260, {
        children: ['late', 'early', 'lower'],
      }),
      node('late', 'default', 110, 148, 60, 30, { sequence: 2 }),
      node('early', 'default', 280, 152, 60, 30, { sequence: 1 }),
      node('lower', 'default', 180, 230, 60, 30, { sequence: 3 }),
    ];
    const result = rankSnapSubGroupChildrenWithConfig(
      inputs, layoutConfig, config,
    ) as any[];
    const early = result.find(item => item.id === 'early')!;
    const late = result.find(item => item.id === 'late')!;
    const lower = result.find(item => item.id === 'lower')!;

    expect(early.position.y).toBe(140);
    expect(late.position.y).toBe(140);
    expect(early.position.x).toBeLessThan(late.position.x);
    expect(lower.position.y).toBeGreaterThan(early.position.y);
    expect(result[0].measured.height).toBeGreaterThan(100);
    expect(inputs[1].position).toEqual({ x: 110, y: 148 });
  });

  it('only ranks free domain nodes and excludes subgroup-owned children', () => {
    const result = rankSnapDomainFreeNodesWithConfig(
      [
        node('domain', 'titleGroup', 0, 0, 420, 300, { domain: 'D' }),
        node('group', 'subGroup', 100, 100, 200, 160, {
          domain: 'D',
          children: ['owned'],
        }),
        node('owned', 'default', 140, 150, 60, 30, { domain: 'D' }),
        node('a', 'default', 20, 100, 60, 30, { domain: 'D', sequence: 2 }),
        node('b', 'default', 280, 104, 60, 30, { domain: 'D', sequence: 1 }),
        node('c', 'default', 180, 190, 60, 30, { domain: 'D' }),
      ],
      false,
      layoutConfig,
      config,
    ) as any[];

    expect(result.find(item => item.id === 'owned')!.position).toEqual({
      x: 140,
      y: 150,
    });
    expect(result.find(item => item.id === 'a')!.position.y).toBe(62);
    expect(result.find(item => item.id === 'b')!.position.y).toBe(62);
    expect(result.find(item => item.id === 'b')!.position.x).toBeLessThan(
      result.find(item => item.id === 'a')!.position.x,
    );
    expect(result.find(item => item.id === 'c')!.position.y).toBeGreaterThan(62);
  });

  it('preserves noClamp overflow semantics for wide free-node ranks', () => {
    const base = [
      node('domain', 'titleGroup', 0, 0, 180, 200, { domain: 'D' }),
      node('a', 'default', 20, 100, 100, 30, { domain: 'D', sequence: 1 }),
      node('b', 'default', 20, 100, 100, 30, { domain: 'D', sequence: 2 }),
    ];
    const clamped = rankSnapDomainFreeNodesWithConfig(
      base, false, layoutConfig, config,
    ) as any[];
    const unclamped = rankSnapDomainFreeNodesWithConfig(
      base, true, layoutConfig, config,
    ) as any[];

    expect(clamped.find(item => item.id === 'b')!.position.x).toBe(60);
    expect(unclamped.find(item => item.id === 'b')!.position.x).toBe(140);
  });

  it('deduplicates subgroup children and ignores hidden or container members', () => {
    const result = rankSnapSubGroupChildrenWithConfig(
      [
        node('group', 'subGroup', 100, 100, 300, 220, {
          children: ['a', 'a', 'b', 'hidden', 'nested', null, 42],
        }),
        node('a', 'default', 120, 150, 60, 30),
        node('b', 'default', 220, 150, 60, 30),
        node('hidden', 'default', 500, 500, 60, 30, { hidden: true }),
        node('nested', 'subGroup', 600, 600, 100, 80),
      ],
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

  it('bounds invalid positions, dimensions, and configuration', () => {
    const result = rankSnapSubGroupChildrenWithConfig(
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
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: Number.NEGATIVE_INFINITY,
        NODE_MIN_WIDTH: Number.NaN,
      },
      {
        subDomain: {
          padding: { horizontal: Number.POSITIVE_INFINITY },
          title: { height: Number.NEGATIVE_INFINITY },
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
