import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { layoutInitialSubGroupsInDomain } from '../domainVerticalSubGroupInitialLayout';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  y: number,
  width = 100,
  height = 60,
  data: Record<string, unknown> = {},
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  width,
  height,
  data: { domain, ...data },
});

const options = () => ({
  domainKey: ' A ',
  subGroupHorizontalPadding: 10,
  topPadding: 30,
  bottomPadding: 12,
  horizontalGap: 20,
  verticalGap: 10,
  fallbackChildWidth: 100,
  fallbackChildHeight: 60,
  layoutChildren: vi.fn((_subGroup: ReactFlowNode, children: ReactFlowNode[]) => {
    children.forEach((child, index) => {
      child.position = { x: 100 + index * 120, y: 200 };
    });
  }),
  packChildren: vi.fn((_subGroup, children: ReactFlowNode[]) => children),
  scatterCoincidentChildren: vi.fn(),
  resolveChildOverlaps: vi.fn(),
});

describe('layoutInitialSubGroupsInDomain', () => {
  it('lays out declared visible children, projects bounds, and repairs semantic declarations', () => {
    const config = options();
    const input = [
      node('sub', 'subGroup', 'A', 0, 0, 50, 40, {
        description: 'orders',
        children: ['c1', 'c1', 'hidden', '', null],
      }),
      node('c1', 'default', 'A', 0, 0),
      node('hidden', 'default', 'A', 999, 999, 100, 60, { hidden: true }),
      node('semantic', 'default', 'A', 0, 0, 100, 60, { subDomain: 'orders' }),
      node('foreign', 'default', 'B', 0, 0, 100, 60, { subDomain: 'orders' }),
    ];

    const result = layoutInitialSubGroupsInDomain(input, config);
    const byId = new Map(result.map(item => [item.id, item]));

    expect(config.layoutChildren).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub' }),
      [expect.objectContaining({ id: 'c1' })],
    );
    expect(config.packChildren).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      20,
      10,
    );
    expect(byId.get('sub')?.position).toEqual({ x: 90, y: 170 });
    expect(byId.get('sub')?.measured).toEqual({ width: 120, height: 102 });
    expect((byId.get('sub')?.data as any).children).toEqual(['c1', 'hidden', 'semantic']);
    expect(byId.get('hidden')?.position).toEqual({ x: 999, y: 999 });
    expect(input[0].position).toEqual({ x: 0, y: 0 });
  });

  it('ignores subgroups outside the selected domain and empty child lists', () => {
    const config = options();
    const input = [
      node('sub-a', 'subGroup', 'A', 10, 20, 100, 80, { children: [] }),
      node('sub-b', 'subGroup', 'B', 30, 40, 100, 80, { children: ['b'] }),
      node('b', 'default', 'B', 0, 0),
    ];

    const result = layoutInitialSubGroupsInDomain(input, config);

    expect(config.layoutChildren).not.toHaveBeenCalled();
    expect(result.map(item => item.position)).toEqual(input.map(item => item.position));
  });

  it('sanitizes hostile geometry and ignores unknown packed nodes', () => {
    const config = {
      ...options(),
      horizontalGap: Number.NaN,
      verticalGap: Number.NEGATIVE_INFINITY,
      subGroupHorizontalPadding: Number.NaN,
      topPadding: -10,
      bottomPadding: Number.POSITIVE_INFINITY,
      layoutChildren: vi.fn((_subGroup: ReactFlowNode, children: ReactFlowNode[]) => {
        children[0].position = { x: Number.NaN, y: Number.POSITIVE_INFINITY };
      }),
      packChildren: vi.fn(() => [
        node('unknown', 'default', 'A', 1000, 1000),
      ]),
    };
    const result = layoutInitialSubGroupsInDomain([
      node('sub', 'subGroup', 'A', Number.NaN, Number.POSITIVE_INFINITY, 0, 0, {
        children: ['child'],
      }),
      node('child', 'default', 'A', Number.NEGATIVE_INFINITY, Number.NaN, Number.NaN, -1),
    ], config);

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
    }
  });
});
