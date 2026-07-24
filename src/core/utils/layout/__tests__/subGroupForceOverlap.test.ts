import { describe, expect, it } from 'vitest';
import {
  resolveSubGroupChildrenOverlapWithD3ForceWithConfig,
  resolveSubGroupsOverlapWithD3ForceWithConfig,
} from '../subGroupForceOverlap';

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

describe('subGroupForceOverlap', () => {
  it('separates overlapping children and clamps them to subgroup content bounds', () => {
    const group = node('group', 'subGroup', 100, 100, 500, 400, {
      children: ['first', 'second'],
    });
    const first = node('first', 'default', 200, 220, 80, 40);
    const second = node('second', 'default', 200, 220, 80, 40);

    const result = resolveSubGroupChildrenOverlapWithD3ForceWithConfig(
      [group, first, second],
      { NODE_H_GAP: 20, NODE_V_GAP: 20 },
      {
        subDomain: {
          padding: { horizontal: 20, top: 40, bottom: 20 },
          title: { height: 30, padding: { vertical: 6 } },
        },
      },
      80,
      0.6,
    );
    const firstResult = result.find(item => item.id === 'first');
    const secondResult = result.find(item => item.id === 'second');

    expect(firstResult?.position).not.toEqual(secondResult?.position);
    for (const item of [firstResult, secondResult]) {
      expect(item?.position.x).toBeGreaterThanOrEqual(120);
      expect(item?.position.x).toBeLessThanOrEqual(500);
      expect(item?.position.y).toBeGreaterThanOrEqual(140);
      expect(item?.position.y).toBeLessThanOrEqual(440);
    }
    expect(first.position).toEqual({ x: 200, y: 220 });
  });

  it('separates overlapping subgroups within domains', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 600, 500, { domain: 'D' });
    const first = node('first', 'subGroup', 100, 100, 120, 80, { domain: 'D' });
    const second = node('second', 'subGroup', 100, 100, 120, 80, { domain: 'D' });

    const result = resolveSubGroupsOverlapWithD3ForceWithConfig(
      [domain, first, second],
      { NODE_H_GAP: 20, NODE_V_GAP: 20 },
      80,
      0.5,
    );

    expect(result.find(item => item.id === 'first')?.position).not.toEqual(
      result.find(item => item.id === 'second')?.position,
    );
  });

  it('handles empty and singleton collections without unnecessary movement', () => {
    expect(resolveSubGroupsOverlapWithD3ForceWithConfig([], {})).toEqual([]);

    const group = node('group', 'subGroup', 0, 0, 300, 200, { children: ['child'] });
    const child = node('child', 'default', 50, 80, 60, 30);
    const result = resolveSubGroupChildrenOverlapWithD3ForceWithConfig(
      [group, child],
      {},
      {},
    );

    expect(result.find(item => item.id === 'child')?.position).toEqual({ x: 50, y: 80 });
  });

  it('bounds invalid iterations, strength, dimensions, and configuration', () => {
    const group = node(
      'group',
      'subGroup',
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      { children: ['first', 42, 'missing', 'second'] },
    );
    const first = node(
      'first',
      'default',
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
    );
    const second = node(
      'second',
      'default',
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NaN,
    );

    const result = resolveSubGroupChildrenOverlapWithD3ForceWithConfig(
      [group, first, second] as any,
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: -1,
        NODE_MIN_WIDTH: Number.POSITIVE_INFINITY,
      },
      {
        node: { height: Number.POSITIVE_INFINITY },
        subDomain: {
          padding: {
            horizontal: Number.POSITIVE_INFINITY,
            top: Number.NEGATIVE_INFINITY,
            bottom: Number.POSITIVE_INFINITY,
          },
        },
      },
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Math.abs(item.position.x)).toBeLessThanOrEqual(110_000);
      expect(Math.abs(item.position.y)).toBeLessThanOrEqual(110_000);
    }
  });
});
