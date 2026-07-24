import { describe, expect, it } from 'vitest';
import {
  snapFreeNodesToRowsInDomainWithConfig,
  snapSubGroupChildrenToRowsWithConfig,
} from '../rowSnapLayout';

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

describe('rowSnapLayout', () => {
  it('centers free domain nodes while preserving their row baseline', () => {
    const inputs = [
      node('domain', 'titleGroup', 0, 0, 400, 300, { domain: 'D' }),
      node('a', 'default', 10, 110, 60, 30, { domain: 'D' }),
      node('b', 'default', 300, 115, 60, 30, { domain: 'D' }),
    ];
    const result = snapFreeNodesToRowsInDomainWithConfig(
      inputs, false, layoutConfig, config,
    ) as any[];

    expect(result.find(item => item.id === 'a')!.position).toEqual({
      x: 115,
      y: 110,
    });
    expect(result.find(item => item.id === 'b')!.position).toEqual({
      x: 225,
      y: 110,
    });
    expect(inputs[1].position).toEqual({ x: 10, y: 110 });
  });

  it('keeps clamped rows fully inside the domain vertically', () => {
    const result = snapFreeNodesToRowsInDomainWithConfig(
      [
        node('domain', 'titleGroup', 0, 0, 400, 180, { domain: 'D' }),
        node('a', 'default', 10, 170, 60, 50, { domain: 'D' }),
        node('b', 'default', 300, 175, 60, 50, { domain: 'D' }),
      ],
      false,
      layoutConfig,
      config,
    ) as any[];

    expect(result.find(item => item.id === 'a')!.position.y).toBe(110);
    expect(result.find(item => item.id === 'b')!.position.y).toBe(110);
  });

  it('preserves noClamp overflow for free domain rows', () => {
    const result = snapFreeNodesToRowsInDomainWithConfig(
      [
        node('domain', 'titleGroup', 0, 0, 180, 180, { domain: 'D' }),
        node('a', 'default', 10, 10, 100, 30, { domain: 'D' }),
        node('b', 'default', 10, 10, 100, 30, { domain: 'D' }),
      ],
      true,
      layoutConfig,
      config,
    ) as any[];

    expect(result.find(item => item.id === 'a')!.position.y).toBe(10);
    expect(result.find(item => item.id === 'b')!.position.x).toBe(170);
    expect(
      result.find(item => item.id === 'b')!.position.x
      + result.find(item => item.id === 'b')!.measured.width,
    ).toBeGreaterThan(180);
  });

  it('packs subgroup rows by semantic order and resizes the container', () => {
    const result = snapSubGroupChildrenToRowsWithConfig(
      [
        node('group', 'subGroup', 100, 100, 400, 250, {
          children: ['late', 'early', 'lower'],
        }),
        node('late', 'default', 0, 110, 60, 30, { sequence: 2 }),
        node('early', 'default', 300, 115, 60, 30, { sequence: 1 }),
        node('lower', 'default', 180, 200, 60, 30, { sequence: 3 }),
      ],
      false,
      layoutConfig,
      config,
    ) as any[];
    const early = result.find(item => item.id === 'early')!;
    const late = result.find(item => item.id === 'late')!;
    const lower = result.find(item => item.id === 'lower')!;

    expect(early.position.y).toBe(140);
    expect(late.position.y).toBe(140);
    expect(early.position.x).toBeLessThan(late.position.x);
    expect(lower.position.y).toBeGreaterThan(early.position.y);
    expect(result[0].measured.height).toBeGreaterThan(100);
  });

  it('excludes subgroup-owned, hidden, and container nodes from domain rows', () => {
    const result = snapFreeNodesToRowsInDomainWithConfig(
      [
        node('domain', 'titleGroup', 0, 0, 400, 300, { domain: 'D' }),
        node('group', 'subGroup', 100, 100, 200, 160, {
          domain: 'D',
          children: ['owned'],
        }),
        node('owned', 'default', 140, 150, 60, 30, { domain: 'D' }),
        node('hidden', 'default', 500, 500, 60, 30, {
          domain: 'D',
          hidden: true,
        }),
        node('a', 'default', 10, 110, 60, 30, { domain: 'D' }),
        node('b', 'default', 300, 115, 60, 30, { domain: 'D' }),
      ],
      false,
      layoutConfig,
      config,
    ) as any[];

    expect(result.find(item => item.id === 'owned')!.position).toEqual({
      x: 140,
      y: 150,
    });
    expect(result.find(item => item.id === 'hidden')!.position).toEqual({
      x: 500,
      y: 500,
    });
  });

  it('bounds invalid positions, dimensions, and configuration', () => {
    const result = snapSubGroupChildrenToRowsWithConfig(
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
      false,
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
