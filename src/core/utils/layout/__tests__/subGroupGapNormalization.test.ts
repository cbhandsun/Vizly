import { describe, expect, it } from 'vitest';
import { unifySubGroupGapsInDomainWithConfig } from '../subGroupGapNormalization';

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
  SUB_GROUP_PADDING: { H: 20, V_TOP: 20 },
};

const config = {
  domain: {
    padding: { horizontal: 20 },
    title: { height: 40, padding: { vertical: 10 }, safeGap: 10 },
    sideSafeGap: 12,
  },
  subDomain: {
    padding: { horizontal: 20, top: 20 },
    title: { height: 30, padding: { vertical: 5 } },
  },
};

describe('subGroupGapNormalization', () => {
  it('normalizes a row by semantic order and translates children with containers', () => {
    const inputs = [
      node('domain', 'titleGroup', 100, 100, 500, 400, { domain: 'D' }),
      node('a', 'subGroup', 140, 110, 100, 80, {
        domain: 'D',
        sequence: 2,
        children: ['a-child'],
      }),
      node('a-child', 'default', 150, 140, 60, 30, { domain: 'D' }),
      node('b', 'subGroup', 300, 110, 80, 80, {
        domain: 'D',
        sequence: 1,
        children: ['b-child'],
      }),
      node('b-child', 'default', 310, 140, 60, 30, { domain: 'D' }),
    ];
    const result = unifySubGroupGapsInDomainWithConfig(
      inputs,
      30,
      40,
      (left, right) => (
        Number(left.data.sequence) - Number(right.data.sequence)
      ),
      layoutConfig,
      config,
    ) as any[];
    const first = result.find(item => item.id === 'b')!;
    const second = result.find(item => item.id === 'a')!;
    const firstChild = result.find(item => item.id === 'b-child')!;

    expect(first.position).toEqual({ x: 112, y: 133 });
    expect(second.position).toEqual({ x: 222, y: 133 });
    expect(firstChild.position.x - first.position.x).toBe(10);
    expect(firstChild.position.y - first.position.y).toBe(30);
    expect(inputs[3].position).toEqual({ x: 300, y: 110 });
    expect(inputs[4].position).toEqual({ x: 310, y: 140 });
  });

  it('keeps separate rows and applies a uniform vertical step', () => {
    const result = unifySubGroupGapsInDomainWithConfig(
      [
        node('domain', 'titleGroup', 100, 100, 500, 400, { domain: 'D' }),
        node('top', 'subGroup', 140, 110, 100, 80, {
          domain: 'D',
          children: [],
        }),
        node('bottom', 'subGroup', 140, 250, 100, 60, {
          domain: 'D',
          children: [],
        }),
      ],
      30,
      40,
      undefined,
      layoutConfig,
      config,
    ) as any[];

    expect(result.find(item => item.id === 'top')!.position).toEqual({
      x: 112,
      y: 133,
    });
    expect(result.find(item => item.id === 'bottom')!.position).toEqual({
      x: 112,
      y: 245,
    });
  });

  it('ignores hidden and other-domain subgroups', () => {
    const result = unifySubGroupGapsInDomainWithConfig(
      [
        node('domain', 'titleGroup', 0, 0, 500, 400, { domain: 'D' }),
        node('visible', 'subGroup', 50, 80, 100, 80, {
          domain: 'D',
          children: [],
        }),
        node('hidden', 'subGroup', 200, 200, 100, 80, {
          domain: 'D',
          hidden: true,
          children: [],
        }),
        node('other', 'subGroup', 300, 300, 100, 80, {
          domain: 'X',
          children: [],
        }),
      ],
      30,
      40,
      undefined,
      layoutConfig,
      config,
    ) as any[];

    expect(result.find(item => item.id === 'hidden')!.position).toEqual({
      x: 200,
      y: 200,
    });
    expect(result.find(item => item.id === 'other')!.position).toEqual({
      x: 300,
      y: 300,
    });
  });

  it('bounds invalid positions, sizes, gaps, configuration, and comparator results', () => {
    const result = unifySubGroupGapsInDomainWithConfig(
      [
        node(
          'domain',
          'titleGroup',
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          { domain: 'D' },
        ),
        node(
          'group',
          'subGroup',
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          { domain: 'D', children: ['child', null, 42] },
        ),
        node(
          'child',
          'default',
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          { domain: 'D' },
        ),
      ],
      Number.POSITIVE_INFINITY,
      -100,
      () => Number.NaN,
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: Number.NEGATIVE_INFINITY,
      },
      {
        domain: {
          padding: { horizontal: Number.POSITIVE_INFINITY },
          title: { height: Number.NaN },
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
