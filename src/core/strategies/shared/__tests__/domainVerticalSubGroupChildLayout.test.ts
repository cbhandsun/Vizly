import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  collectVisibleSubGroupChildren,
  layoutSubGroupChildrenByMode,
  resolveSubGroupChildOverlapsByMode,
  type LayoutSubGroupChildrenOptions,
} from '../domainVerticalSubGroupChildLayout';

const node = (
  id: string,
  type = 'default',
  x = 0,
  y = 0,
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width: 100, height: 50 },
  style: { width: 100, height: 50 },
  data: {},
});

const options = (
  layout: LayoutSubGroupChildrenOptions['layout'],
): LayoutSubGroupChildrenOptions => ({
  layout,
  horizontalPadding: 20,
  topPadding: 40,
  horizontalGap: 15,
  verticalGap: 25,
  metrics: {
    minimumWidth: 80,
    defaultWidth: 100,
    defaultHeight: 50,
    horizontalGap: 15,
    verticalGap: 25,
  },
  projectVertical: vi.fn((_subGroup, children) => children),
  projectGrid: vi.fn((_subGroup, children) => children),
});

describe('layoutSubGroupChildrenByMode', () => {
  it('parses declared children and excludes hidden, missing, and invalid members', () => {
    const visible = node('visible');
    const hidden = {
      ...node('hidden'),
      data: { hidden: true },
    };
    const subGroup = {
      ...node('sg', 'subGroup'),
      data: {
        children: ['visible', 'visible', 'hidden', 'missing', '', null, 42],
      },
    } as ReactFlowNode;

    expect(collectVisibleSubGroupChildren(
      subGroup,
      new Map([
        [visible.id, visible],
        [hidden.id, hidden],
      ]),
    )).toEqual([visible]);
    expect(collectVisibleSubGroupChildren(
      { ...subGroup, data: { children: 'visible' } } as ReactFlowNode,
      new Map([[visible.id, visible]]),
    )).toEqual([]);
  });

  it.each(['horizontal', 'centered'] as const)(
    'keeps %s children in one explicit row',
    layout => {
      const subGroup = node('sg', 'subGroup', 100, 200);
      const children = [node('a'), node('b')];
      const config = options(layout);

      expect(layoutSubGroupChildrenByMode(subGroup, children, config)).toBe(true);

      expect(children.map(child => child.position)).toEqual([
        { x: 120, y: 240 },
        { x: 235, y: 240 },
      ]);
      expect(config.projectVertical).not.toHaveBeenCalled();
      expect(config.projectGrid).not.toHaveBeenCalled();
    },
  );

  it.each(['vertical', 'grid'] as const)(
    'delegates %s projection and copies finite rounded positions',
    layout => {
      const subGroup = node('sg', 'subGroup');
      const children = [node('a'), node('b', 'default', 7, 9)];
      const config = options(layout);
      const projector = layout === 'vertical'
        ? config.projectVertical
        : config.projectGrid;
      vi.mocked(projector).mockReturnValue([
        node('a', 'default', 10.6, 20.4),
        node('b', 'default', Number.NaN, Number.POSITIVE_INFINITY),
      ]);

      expect(layoutSubGroupChildrenByMode(subGroup, children, config)).toBe(true);

      expect(projector).toHaveBeenCalledWith(subGroup, children, 15, 25);
      expect(children[0].position).toEqual({ x: 11, y: 20 });
      expect(children[1].position).toEqual({ x: 7, y: 9 });
    },
  );

  it('does not run generic projectors for dagre or empty child lists', () => {
    const subGroup = node('sg', 'subGroup');
    const dagre = options('dagre');

    expect(layoutSubGroupChildrenByMode(subGroup, [node('a')], dagre)).toBe(false);
    expect(layoutSubGroupChildrenByMode(subGroup, [], options('grid'))).toBe(false);
    expect(dagre.projectVertical).not.toHaveBeenCalled();
    expect(dagre.projectGrid).not.toHaveBeenCalled();
  });

  it('sanitizes hostile padding and gap inputs before horizontal layout', () => {
    const subGroup = node('sg', 'subGroup', Number.NaN, Number.POSITIVE_INFINITY);
    const children = [node('a')];
    const config = {
      ...options('horizontal'),
      horizontalPadding: Number.NaN,
      topPadding: -20,
      horizontalGap: Number.NEGATIVE_INFINITY,
    };

    layoutSubGroupChildrenByMode(subGroup, children, config);

    expect(children[0].position).toEqual({ x: 0, y: 0 });
  });

  it.each(['horizontal', 'centered'] as const)(
    'monotonically separates visible %s children and recomputes containers',
    layout => {
      const subGroup = {
        ...node('sg', 'subGroup'),
        data: { children: ['b', 'a', 'b', 'hidden'] },
      } as ReactFlowNode;
      const hidden = {
        ...node('hidden', 'default', 50, 999),
        data: { hidden: true },
      };
      const recomputeContainers = vi.fn((nodes: ReactFlowNode[]) => nodes);
      const resolveStrict = vi.fn((nodes: ReactFlowNode[]) => nodes);
      const result = resolveSubGroupChildOverlapsByMode([
        subGroup,
        node('a', 'default', 100, 20),
        node('b', 'default', 150, 40),
        hidden,
      ], {
        layout,
        horizontalGap: 20,
        verticalGap: 10,
        fallbackChildWidth: 80,
        resolveStrict,
        recomputeContainers,
      });
      const byId = new Map(result.map(item => [item.id, item]));

      expect(byId.get('a')?.position).toEqual({ x: 100, y: 20 });
      expect(byId.get('b')?.position).toEqual({ x: 220, y: 40 });
      expect(byId.get('hidden')?.position).toEqual({ x: 50, y: 999 });
      expect(resolveStrict).not.toHaveBeenCalled();
      expect(recomputeContainers).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['grid', 'vertical'] as const)(
    'delegates %s overlap resolution with sanitized gaps',
    layout => {
      const resolved = [node('resolved')];
      const resolveStrict = vi.fn(() => resolved);
      const recomputeContainers = vi.fn((nodes: ReactFlowNode[]) => nodes);

      const result = resolveSubGroupChildOverlapsByMode([node('input')], {
        layout,
        horizontalGap: Number.NaN,
        verticalGap: Number.NEGATIVE_INFINITY,
        fallbackChildWidth: 80,
        resolveStrict,
        recomputeContainers,
      });

      expect(resolveStrict).toHaveBeenCalledWith(expect.any(Array), 12, 8);
      expect(recomputeContainers).toHaveBeenCalledWith(resolved);
      expect(result).toBe(resolved);
    },
  );

  it('keeps dagre geometry sanitized but skips resolvers and container recompute', () => {
    const resolveStrict = vi.fn((nodes: ReactFlowNode[]) => nodes);
    const recomputeContainers = vi.fn((nodes: ReactFlowNode[]) => nodes);
    const result = resolveSubGroupChildOverlapsByMode([
      node('input', 'default', Number.NaN, Number.POSITIVE_INFINITY),
    ], {
      layout: 'dagre',
      horizontalGap: 20,
      verticalGap: 10,
      fallbackChildWidth: 80,
      resolveStrict,
      recomputeContainers,
    });

    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(resolveStrict).not.toHaveBeenCalled();
    expect(recomputeContainers).not.toHaveBeenCalled();
  });
});
