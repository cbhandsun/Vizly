import { describe, expect, it, vi } from 'vitest';
import { reflowSubGroupChildrenDagreWithConfig } from '../subGroupDagreLayout';

const node = (
  id: string,
  x: number,
  y: number,
  width = 60,
  height = 30,
  data: Record<string, unknown> = {},
) => ({
  id,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data,
}) as any;

const group = () => ({
  ...node('group', 100, 100, 300, 220, { description: 'Group' }),
  type: 'subGroup',
}) as any;

const config = {
  subDomain: {
    padding: { horizontal: 20, top: 40, bottom: 20 },
    title: { height: 30, padding: { vertical: 6 }, safeGap: 4 },
  },
  node: { width: 60, height: 30 },
};

describe('subGroupDagreLayout', () => {
  it('lays out main-edge nodes by rank and records relative geometry', () => {
    const debug = vi.fn();
    const result = reflowSubGroupChildrenDagreWithConfig(
      group(),
      [
        node('second', 0, 0, 60, 30, { sequence: 2 }),
        node('first', 0, 0, 60, 30, { sequence: 1 }),
      ],
      20,
      20,
      [{ id: 'edge', source: 'first', target: 'second', type: 'main' }] as any,
      'TB',
      { NODE_SEP: 80, RANK_SEP: 120 },
      config,
      { logger: { debug }, now: () => 123 },
    );
    const [, first, second] = result;

    expect(first.id).toBe('first');
    expect(first.position.y).toBeLessThan(second.position.y);
    expect(first.data.__dagreRel).toEqual({
      x: first.position.x - 120,
      y: first.position.y - 184,
    });
    expect((result[0].data.__dagreSized as { ts: number }).ts).toBe(123);
    expect(debug).toHaveBeenCalledWith(
      '[DAGRE-EDGES] 子域="Group" 节点数=2 内部边数=1',
    );
  });

  it('keeps non-main edges visual-only while preserving stable semantic order', () => {
    const result = reflowSubGroupChildrenDagreWithConfig(
      group(),
      [
        node('late', 0, 0, 60, 30, { order: '2' }),
        node('early', 0, 0, 60, 30, { order: '1' }),
      ],
      20,
      20,
      [{ id: 'edge', source: 'early', target: 'late', type: 'dependency' }] as any,
      'TB',
      {},
      config,
    );

    expect(result[1].id).toBe('early');
    expect(result[2].id).toBe('late');
    expect(result[1].position.y).toBeLessThan(result[2].position.y);
  });

  it('arranges isolated nodes vertically for TB and horizontally for LR', () => {
    const children = [
      node('a', 0, 0, 60, 30, { sequence: 1 }),
      node('b', 0, 0, 60, 30, { sequence: 2 }),
    ];
    const tb = reflowSubGroupChildrenDagreWithConfig(
      group(), children, 20, 20, [], 'TB', {}, config,
    );
    const lr = reflowSubGroupChildrenDagreWithConfig(
      group(), children, 20, 20, [], 'LR', {}, config,
    );

    expect(tb[1].position.y).toBeLessThan(tb[2].position.y);
    expect(lr[1].position.x).toBeLessThan(lr[2].position.x);
  });

  it('does not mutate inputs and returns only the subgroup for empty children', () => {
    const subgroup = group();
    expect(reflowSubGroupChildrenDagreWithConfig(
      subgroup, [], 20, 20, [], 'TB', {}, config,
    )).toHaveLength(1);

    const child = node('child', 0, 0);
    reflowSubGroupChildrenDagreWithConfig(
      subgroup, [child], 20, 20, [], 'TB', {}, config,
    );
    expect(subgroup.position).toEqual({ x: 100, y: 100 });
    expect(subgroup.data.__dagreSized).toBeUndefined();
    expect(child.data.__dagreRel).toBeUndefined();
  });

  it('bounds invalid direction, gaps, dimensions, edges, and configuration', () => {
    const result = reflowSubGroupChildrenDagreWithConfig(
      {
        ...node(
          'group',
          Number.POSITIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          {},
        ),
        type: 'subGroup',
      },
      [
        node(
          'a',
          Number.NEGATIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          { sequence: 'bad' },
        ),
        node(
          'b',
          Number.NaN,
          Number.NEGATIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.NaN,
        ),
      ],
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      [null, { source: 42, target: 'b' }] as any,
      'invalid',
      {
        NODE_SEP: Number.POSITIVE_INFINITY,
        RANK_SEP: Number.NEGATIVE_INFINITY,
      },
      {
        subDomain: {
          padding: {
            horizontal: Number.POSITIVE_INFINITY,
            top: Number.NEGATIVE_INFINITY,
            bottom: Number.POSITIVE_INFINITY,
          },
        },
      },
    );

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Number.isFinite(item.measured?.width)).toBe(true);
      expect(Number.isFinite(item.measured?.height)).toBe(true);
    }
  });
});
