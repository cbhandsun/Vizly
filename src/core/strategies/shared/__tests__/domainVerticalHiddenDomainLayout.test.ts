import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  areAllTitleGroupDomainsHidden,
  layoutHiddenDomainSubGroups,
} from '../domainVerticalHiddenDomainLayout';

const node = (
  id: string,
  type: string,
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
  data,
});

const options = (
  layout: 'horizontal' | 'vertical' | 'grid' | 'centered' | 'dagre',
  layoutChildren = vi.fn((
    _layout,
    children: ReactFlowNode[],
    left: number,
    _right: number,
    top: number,
  ) => {
    children.forEach((child, index) => {
      child.position = { x: left + index * 120, y: top };
    });
  }),
) => ({
  layout,
  top: 80,
  gap: 40,
  anchorLeft: 20,
  horizontalPadding: 10,
  topPadding: 30,
  bottomPadding: 12,
  fallbackSubGroupWidth: 480,
  fallbackChildWidth: 100,
  fallbackChildHeight: 60,
  layoutChildren,
});

describe('domainVerticalHiddenDomainLayout', () => {
  it('detects no domains and fully hidden domains but not partially visible domains', () => {
    expect(areAllTitleGroupDomainsHidden([])).toBe(true);
    expect(areAllTitleGroupDomainsHidden([
      node('domain', 'titleGroup', 0, 0, 100, 100, { hidden: true }),
    ])).toBe(true);
    expect(areAllTitleGroupDomainsHidden([
      node('hidden', 'titleGroup', 0, 0, 100, 100, { hidden: true }),
      node('visible', 'titleGroup', 0, 0),
    ])).toBe(false);
  });

  it('reflows visible children, projects subgroup size, and compacts rigidly', () => {
    const layoutChildren = options('grid').layoutChildren;
    const result = layoutHiddenDomainSubGroups([
      node('sub-a', 'subGroup', 100, 300, 300, 100, {
        children: ['a1', 'a2', 'a1', 'hidden'],
      }),
      node('a1', 'default', 0, 0),
      node('a2', 'default', 0, 0),
      node('hidden', 'default', 999, 999, 100, 60, { hidden: true }),
      node('sub-b', 'subGroup', 100, 100, 200, 80, { children: [] }),
      node('sub-hidden', 'subGroup', 0, 0, 100, 100, { hidden: true }),
    ], options('grid', layoutChildren));
    const byId = new Map(result.map(item => [item.id, item]));

    expect(layoutChildren).toHaveBeenCalledWith('grid', expect.any(Array), 110, 390, 330);
    expect(layoutChildren.mock.calls[0][1].map(child => child.id)).toEqual(['a1', 'a2']);
    expect(byId.get('sub-b')?.position.y).toBe(80);
    expect(byId.get('sub-a')?.position.y).toBe(200);
    expect(byId.get('a1')?.position.y).toBe(230);
    expect(byId.get('sub-a')?.measured).toEqual({ width: 240, height: 102 });
    expect(byId.get('hidden')?.position).toEqual({ x: 999, y: 899 });
    expect(byId.get('sub-hidden')?.position).toEqual({ x: 0, y: 0 });
  });

  it('preserves dagre child positions and only compacts visible subgroups', () => {
    const layoutChildren = options('dagre').layoutChildren;
    const result = layoutHiddenDomainSubGroups([
      node('sub', 'subGroup', 100, 400, 200, 120, { children: ['child'] }),
      node('child', 'default', 140, 470),
    ], options('dagre', layoutChildren));

    expect(layoutChildren).not.toHaveBeenCalled();
    expect(result[0].position.y).toBe(80);
    expect(result[1].position.y).toBe(150);
  });

  it('sanitizes invalid coordinates and hostile option values', () => {
    const result = layoutHiddenDomainSubGroups([
      node('sub', 'subGroup', Number.NaN, Number.POSITIVE_INFINITY, Number.NaN, -1, {
        children: ['child'],
      }),
      node('child', 'default', Number.NEGATIVE_INFINITY, Number.NaN, Number.POSITIVE_INFINITY, -10),
    ], {
      ...options('horizontal'),
      top: Number.NaN,
      gap: -10,
      horizontalPadding: Number.NaN,
      topPadding: -20,
      bottomPadding: Number.POSITIVE_INFINITY,
    });

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
    }
  });
});
