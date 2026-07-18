import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { finalizeDomainInternalLayout } from '../domainVerticalFinalInternalLayout';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  y: number,
  width: number,
  height: number,
  children?: string[],
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  width,
  height,
  data: { domain, children },
});

const baseOptions = {
  layout: 'horizontal' as const,
  containerTypes: new Set(['titleGroup']),
  anchorLeft: 100,
  domainHorizontalPadding: 20,
  domainHeaderHeight: 50,
  domainBottomPadding: 15,
  subGroupHorizontalPadding: 10,
  subGroupHeaderHeight: 30,
  subGroupBottomPadding: 12,
  nodeHorizontalGap: 20,
  nodeVerticalGap: 16,
  subGroupGap: 30,
  defaultNodeWidth: 100,
  defaultNodeHeight: 40,
  orderOf: (item: ReactFlowNode) =>
    Number((item.data as Record<string, unknown>).order ?? 0),
  layoutHorizontal: (
    children: ReactFlowNode[],
    left: number,
    _right: number,
    top: number,
  ) => {
    let cursor = left;
    for (const child of children) {
      child.position = { x: cursor, y: top };
      cursor += (child.measured?.width ?? 100) + 20;
    }
  },
  layoutVertical: vi.fn(),
  layoutGrid: vi.fn(),
  resolveChildOverlaps: vi.fn(),
};

describe('finalizeDomainInternalLayout', () => {
  it('reflows current child references and recomputes subgroup and domain bounds', () => {
    const input = [
      node('domain', 'titleGroup', ' A ', 100, 20, 500, 300),
      {
        ...node('sub', 'subGroup', 'A', 120, 90, 200, 100, [
          'child-a',
          'child-a',
          'missing',
          'child-b',
        ]),
        data: { domain: 'A', children: ['child-a', 'child-a', 'missing', 'child-b'] },
      },
      node('child-a', 'default', 'A', 2000, 2000, 100, 40),
      node('child-b', 'default', 'A', 2000, 2000, 120, 60),
    ];

    const result = finalizeDomainInternalLayout(input, baseOptions);
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('child-a')?.position.x).toBe(220);
    expect(byId.get('child-b')?.position.x).toBe(340);
    expect(byId.get('child-a')?.position.y).toBe(120);
    expect(byId.get('child-b')?.position.y).toBe(120);
    expect(byId.get('sub')?.measured).toEqual({ width: 260, height: 102 });
    expect(
      (byId.get('child-a')?.position.x ?? 0)
      - (byId.get('sub')?.position.x ?? 0),
    ).toBe(10);
    expect(byId.get('domain')?.measured).toEqual({ width: 500, height: 187 });
    expect(input[2].position).toEqual({ x: 2000, y: 2000 });
  });

  it('rigidly centers one subgroup and its declared children', () => {
    const result = finalizeDomainInternalLayout([
      node('domain', 'titleGroup', 'A', 100, 20, 600, 300),
      node('sub', 'subGroup', 'A', 120, 90, 200, 100, ['child']),
      node('child', 'default', 'A', 130, 120, 100, 40),
    ], {
      ...baseOptions,
      layout: 'dagre',
    });
    const byId = new Map(result.map(item => [item.id, item]));
    const subGroupLeft = byId.get('sub')?.position.x;
    const childLeft = byId.get('child')?.position.x;

    expect(subGroupLeft).toBe(290);
    expect(childLeft).toBe(300);
    expect((childLeft ?? 0) - (subGroupLeft ?? 0)).toBe(10);
  });

  it('selects grid columns from subgroup count and sanitizes invalid geometry', () => {
    const layoutGrid = vi.fn((
      children: ReactFlowNode[],
      left: number,
      _right: number,
      top: number,
    ) => {
      for (const child of children) child.position = { x: left, y: top };
    });
    const result = finalizeDomainInternalLayout([
      node(
        'domain',
        'titleGroup',
        'A',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        400,
        200,
      ),
      node('sub-a', 'subGroup', 'A', 20, 60, 100, 80, ['child-a']),
      node('sub-b', 'subGroup', 'A', 140, 60, 100, 80, []),
      node('sub-c', 'subGroup', 'A', 260, 60, 100, 80, []),
      node(
        'child-a',
        'default',
        'A',
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        -1,
      ),
    ], {
      ...baseOptions,
      layout: 'grid',
      layoutGrid,
      domainHorizontalPadding: -1,
      nodeHorizontalGap: Number.POSITIVE_INFINITY,
      nodeVerticalGap: -1,
    });

    expect(layoutGrid).toHaveBeenCalledWith(
      expect.any(Array),
      30,
      130,
      90,
      2,
    );
    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Number.isFinite(item.measured?.width)).toBe(true);
      expect(Number.isFinite(item.measured?.height)).toBe(true);
    }
  });
});
