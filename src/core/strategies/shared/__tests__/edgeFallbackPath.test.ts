import { describe, expect, it } from 'vitest';
import type { Node as ReactFlowNode } from '@xyflow/react';
import { buildEndpointOrthogonalFallbackPath } from '../edgeFallbackPath';

const makeNode = (
  id: string,
  position: { x: number; y: number },
  size = { width: 120, height: 80 },
  parentId?: string,
): ReactFlowNode => ({
  id,
  type: 'default',
  position,
  parentId,
  style: size,
  data: {},
});

const isOrthogonal = (points: Array<{ x: number; y: number }>): boolean => (
  points.every((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(previous.x - point.x) < 0.5 || Math.abs(previous.y - point.y) < 0.5;
  })
);

describe('buildEndpointOrthogonalFallbackPath', () => {
  it('builds a renderable orthogonal path for explicit side handles', () => {
    const source = makeNode('source', { x: 100, y: 100 });
    const target = makeNode('target', { x: 360, y: 220 });

    const path = buildEndpointOrthogonalFallbackPath({
      source,
      target,
      sourceHandle: 'right',
      targetHandle: 'left',
    });

    expect(path.length).toBeGreaterThanOrEqual(4);
    expect(path[0]).toEqual({ x: 220, y: 140 });
    expect(path[1]).toEqual({ x: 328, y: 140 });
    expect(path[path.length - 2]).toEqual({ x: 328, y: 260 });
    expect(path[path.length - 1]).toEqual({ x: 360, y: 260 });
    expect(isOrthogonal(path)).toBe(true);
  });

  it('uses parent-relative positions when positionAbsolute is unavailable', () => {
    const parent = makeNode('parent', { x: 300, y: 400 }, { width: 500, height: 400 });
    const source = makeNode('source', { x: 20, y: 30 }, { width: 100, height: 60 }, 'parent');
    const target = makeNode('target', { x: 260, y: 120 }, { width: 100, height: 60 }, 'parent');
    const nodeById = new Map([parent, source, target].map(node => [node.id, node]));

    const path = buildEndpointOrthogonalFallbackPath({
      source,
      target,
      sourceHandle: 'bottom',
      targetHandle: 'top',
      nodeById,
    });

    expect(path[0]).toEqual({ x: 370, y: 490 });
    expect(path[path.length - 1]).toEqual({ x: 610, y: 520 });
    expect(isOrthogonal(path)).toBe(true);
  });
});
