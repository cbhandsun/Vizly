import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { computeDiagramNodeBounds } from '../diagramNodeBounds';

describe('computeDiagramNodeBounds', () => {
  it('handles visible, hidden, nested, and measured nodes', () => {
    const nodes: Node[] = [
      { id: 'parent', position: { x: 100, y: 50 }, width: 300, height: 200, data: {} },
      {
        id: 'child',
        parentId: 'parent',
        position: { x: 20, y: 30 },
        measured: { width: 80, height: 40 },
        data: {},
      },
      {
        id: 'hidden',
        position: { x: -10_000, y: -10_000 },
        width: 10,
        height: 10,
        hidden: true,
        data: {},
      },
    ];

    expect(computeDiagramNodeBounds(nodes)).toEqual({
      minX: 100,
      minY: 50,
      maxX: 400,
      maxY: 250,
      width: 300,
      height: 200,
    });
  });

  it('handles empty, invalid, cyclic, and extreme node geometry safely', () => {
    expect(computeDiagramNodeBounds([])).toBeNull();
    expect(computeDiagramNodeBounds([
      {
        id: 'a',
        parentId: 'b',
        position: { x: Number.NaN, y: 1 },
        style: { width: Number.POSITIVE_INFINITY, height: -1 },
        data: {},
      },
      {
        id: 'b',
        parentId: 'a',
        position: { x: 2, y: 3 },
        width: 1_000_000,
        height: 1_000_000,
        data: {},
      },
    ])).toEqual(expect.objectContaining({
      width: expect.any(Number),
      height: expect.any(Number),
    }));
  });
});
