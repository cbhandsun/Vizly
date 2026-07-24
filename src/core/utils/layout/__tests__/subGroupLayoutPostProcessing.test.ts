import { describe, expect, it, vi } from 'vitest';
import {
  enforceSubGroupTitleClearanceWithConfig,
  syncDagreChildPositionsWithConfig,
} from '../subGroupLayoutPostProcessing';

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

const config = {
  subDomain: {
    padding: { horizontal: 20, top: 40 },
    title: { height: 30, padding: { vertical: 6 }, safeGap: 4 },
  },
};

describe('subGroupLayoutPostProcessing', () => {
  it('synchronizes finite Dagre relative positions and emits a boundary signal', () => {
    const onNearTitleBoundary = vi.fn();
    const group = node('group', 'subGroup', 100, 100, 300, 220, {
      children: ['child'],
    });
    const child = node('child', 'default', 0, 0, 60, 30, {
      __dagreRel: { x: 10, y: 0 },
    });

    const result = syncDagreChildPositionsWithConfig(
      [group, child],
      {},
      config,
      { onNearTitleBoundary },
    );

    expect(result.find(item => item.id === 'child')?.position).toEqual({ x: 130, y: 184 });
    expect(onNearTitleBoundary).toHaveBeenCalledWith('child', 184);
    expect(child.position).toEqual({ x: 0, y: 0 });
  });

  it('rejects malformed and non-finite Dagre metadata', () => {
    const group = node('group', 'subGroup', 100, 100, 300, 220, {
      children: ['nan', 'missing', 'partial', 42],
    });
    const nan = node('nan', 'default', 10, 20, 60, 30, {
      __dagreRel: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
    });
    const missing = node('missing', 'default', 30, 40, 60, 30);
    const partial = node('partial', 'default', 50, 60, 60, 30, {
      __dagreRel: { x: 10 },
    });

    const result = syncDagreChildPositionsWithConfig(
      [group, nan, missing, partial] as any,
      {},
      config,
    );

    expect(result.find(item => item.id === 'nan')?.position).toEqual({ x: 10, y: 20 });
    expect(result.find(item => item.id === 'missing')?.position).toEqual({ x: 30, y: 40 });
    expect(result.find(item => item.id === 'partial')?.position).toEqual({ x: 50, y: 60 });
  });

  it('clamps children below the title and within subgroup bounds', () => {
    const group = node('group', 'subGroup', 100, 100, 220, 160, {
      children: ['first', 'second'],
    });
    const first = node('first', 'default', 50, 90, 60, 30);
    const second = node('second', 'default', 400, 100, 60, 30);

    const result = enforceSubGroupTitleClearanceWithConfig(
      [group, first, second],
      { NODE_V_GAP: 40, SUB_GROUP_PADDING: { V_BOTTOM: 20 } },
      config,
    );

    expect(result.find(item => item.id === 'first')?.position).toEqual({ x: 120, y: 180 });
    expect(result.find(item => item.id === 'second')?.position).toEqual({ x: 240, y: 210 });
    expect(first.position).toEqual({ x: 50, y: 90 });
  });

  it('handles empty input, invalid child references, and extreme geometry', () => {
    expect(enforceSubGroupTitleClearanceWithConfig([], {}, {})).toEqual([]);

    const group = node(
      'group',
      'subGroup',
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      { children: ['child', null, 'missing'] },
    );
    const child = node(
      'child',
      'default',
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    );

    const result = enforceSubGroupTitleClearanceWithConfig(
      [group, child] as any,
      {
        NODE_V_GAP: Number.POSITIVE_INFINITY,
        SUB_GROUP_PADDING: {
          H: Number.POSITIVE_INFINITY,
          V_BOTTOM: Number.NEGATIVE_INFINITY,
        },
      },
      {
        subDomain: {
          padding: {
            horizontal: Number.POSITIVE_INFINITY,
            top: Number.NEGATIVE_INFINITY,
          },
          title: {
            height: Number.POSITIVE_INFINITY,
            padding: { vertical: Number.NEGATIVE_INFINITY },
          },
        },
      },
    );

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Math.abs(item.position.x)).toBeLessThanOrEqual(110_000);
      expect(Math.abs(item.position.y)).toBeLessThanOrEqual(110_000);
    }
  });
});
