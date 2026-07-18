import { describe, expect, it, vi } from 'vitest';
import { resolveSubGroupOverlapsWithConfig } from '../subGroupOverlapResolution';

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

const options = () => ({
  recomputeContainers: vi.fn(nodes => nodes),
  enforceDomainContainment: vi.fn(nodes => nodes),
});

describe('subGroupOverlapResolution', () => {
  it('separates overlapping subgroups and translates their semantic children', () => {
    const inputs = [
      node('first', 'subGroup', 100, 100, 120, 80, {
        domain: 'D',
        children: ['a'],
      }),
      node('a', 'default', 120, 130, 60, 30, { domain: 'D' }),
      node('second', 'subGroup', 150, 100, 120, 80, {
        domain: 'D',
        children: ['b'],
        position: { x: 150, y: 100 },
      }),
      node('b', 'default', 170, 130, 60, 30, { domain: 'D' }),
    ];
    const result = resolveSubGroupOverlapsWithConfig(
      inputs, 20, 30, {}, {}, options(),
    ) as any[];
    const second = result.find(item => item.id === 'second')!;
    const child = result.find(item => item.id === 'b')!;

    expect(second.position.y).toBeGreaterThan(100);
    expect(child.position.y - second.position.y).toBe(30);
    expect(second.data.position).toEqual(second.position);
    expect(inputs[2].position).toEqual({ x: 150, y: 100 });
    expect(inputs[3].position).toEqual({ x: 170, y: 130 });
  });

  it('uses current coordinates after global movement during domain refinement', () => {
    const result = resolveSubGroupOverlapsWithConfig(
      [
        node('a', 'subGroup', 0, 0, 100, 100, { domain: 'D', children: [] }),
        node('b', 'subGroup', 10, 0, 100, 100, { domain: 'D', children: [] }),
        node('c', 'subGroup', 20, 0, 100, 100, { domain: 'D', children: [] }),
      ],
      20,
      30,
      {},
      {},
      options(),
    ) as any[];
    const groups = result.filter(item => item.type === 'subGroup');

    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const a = groups[left];
        const b = groups[right];
        const overlaps = (
          a.position.x < b.position.x + b.measured.width
          && a.position.x + a.measured.width > b.position.x
          && a.position.y < b.position.y + b.measured.height
          && a.position.y + a.measured.height > b.position.y
        );
        expect(overlaps).toBe(false);
      }
    }
  });

  it('packs domain subgroups and invokes both container post-processors', () => {
    const hooks = options();
    const result = resolveSubGroupOverlapsWithConfig(
      [
        node('domain', 'titleGroup', 100, 100, 500, 400, { domain: 'D' }),
        node('wide', 'subGroup', 200, 200, 140, 80, { domain: 'D', children: [] }),
        node('narrow', 'subGroup', 220, 210, 100, 80, { domain: 'D', children: [] }),
      ],
      40,
      30,
      { SUB_GROUP_PADDING: { H: 20, V_TOP: 20 } },
      {
        domain: {
          padding: { horizontal: 20 },
          title: { height: 40, padding: { vertical: 10 }, safeGap: 10 },
        },
        subDomain: {
          padding: { horizontal: 20, top: 20 },
          title: { height: 30, padding: { vertical: 5 } },
        },
      },
      hooks,
    ) as any[];

    expect(hooks.recomputeContainers).toHaveBeenCalledOnce();
    expect(hooks.enforceDomainContainment).toHaveBeenCalledOnce();
    expect(result.find(item => item.id === 'wide').position.x).toBe(100);
    expect(result.find(item => item.id === 'narrow').position.x).toBe(280);
  });

  it('bounds invalid coordinates, dimensions, gaps, and configuration', () => {
    const result = resolveSubGroupOverlapsWithConfig(
      [
        node(
          'a',
          'subGroup',
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          { domain: 'D', children: [] },
        ),
        node(
          'b',
          'subGroup',
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          { domain: 'D', children: [null, 42] },
        ),
      ],
      Number.POSITIVE_INFINITY,
      -50,
      { NODE_H_GAP: Number.POSITIVE_INFINITY },
      { domain: { padding: { horizontal: Number.POSITIVE_INFINITY } } },
      options(),
    ) as any[];

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Number.isFinite(item.measured.width)).toBe(true);
      expect(Number.isFinite(item.measured.height)).toBe(true);
    }
  });
});
