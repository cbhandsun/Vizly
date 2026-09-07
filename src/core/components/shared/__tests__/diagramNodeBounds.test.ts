import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { computeDiagramNodeBounds } from '../diagramNodeBounds';
import { computeDiagramContentBounds, readDiagramRenderedLabelBounds } from '../diagramContentBounds';

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

describe('diagram content overview bounds', () => {
  it('keeps a large valid rendered rectangle in the overview envelope', () => {
    expect(computeDiagramContentBounds([{
      id: 'large', position: { x: 0, y: 0 }, width: 1_000_000, height: 500_000, data: {},
    }], [])).toMatchObject({ width: 1_000_000, height: 500_000 });
  });
  it.each([true, false])('retains coordinates of a hidden parent (hidden=%s)', hidden => {
    const nested: Node[] = [
      { id: 'parent', position: { x: 500, y: 500 }, width: 1000, height: 1000,
        hidden, data: { hidden: !hidden } },
      { id: 'child', parentId: 'parent', position: { x: 10, y: 20 }, width: 100, height: 60, data: {} },
    ];
    expect(computeDiagramContentBounds(nested, [])).toEqual({
      minX: 510, minY: 520, maxX: 610, maxY: 580, width: 100, height: 60,
    });
  });
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
    { id: 'b', position: { x: 300, y: 0 }, width: 100, height: 60, data: {} },
  ];
  const edge: Edge = { id: 'a-b', source: 'a', target: 'b', data: {
    computedPath: [{ x: 50, y: 60 }, { x: 50, y: 1000 }, { x: 350, y: 1000 }, { x: 350, y: 60 }],
  } };

  it('contains routed detours and measured labels beyond the node envelope', () => {
    expect(computeDiagramContentBounds(nodes, [edge], [{ x: 550, y: 900, width: 200, height: 50 }]))
      .toEqual({ minX: 0, minY: 0, maxX: 750, maxY: 1012, width: 750, height: 1012 });
  });

  it('ignores hidden and orphan routes without manufacturing a bounds for an empty graph', () => {
    expect(computeDiagramContentBounds([], [edge])).toBeNull();
    expect(computeDiagramContentBounds(nodes, [{ ...edge, hidden: true }, { ...edge, target: 'absent' }]))
      .toEqual(computeDiagramNodeBounds(nodes));
    expect(computeDiagramContentBounds(nodes.map(node => ({ ...node, data: { hidden: true } })), [edge]))
      .toBeNull();
  });

  it('rejects invalid path points, rectangles and oversized paths from the bounds calculation', () => {
    const invalid: Edge[] = [
      { ...edge, data: { computedPath: ['<script>alert(1)</script>', null, { x: Infinity, y: 1000 }] } },
      { ...edge, data: { computedPath: Array.from({ length: 2001 }, () => ({ x: 0, y: 1000 })) } },
    ];
    expect(computeDiagramContentBounds(nodes, invalid, [
      { x: NaN, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: -1, height: 10 },
    ])).toEqual(computeDiagramNodeBounds(nodes));
  });

  it('supports route representations used by tree and ELK edges', () => {
    for (const data of [{ treeRouting: { points: edge.data?.computedPath } }, { elkPath: edge.data?.computedPath }]) {
      expect(computeDiagramContentBounds(nodes, [{ ...edge, data }])?.maxY).toBe(1012);
    }
  });

  it('projects final DOM label bounds through the current pan and zoom', () => {
    const canvas = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'vizly-edge-label';
    canvas.appendChild(label);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 100, 1200, 800));
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(new DOMRect(260, 320, 100, 30));
    expect(readDiagramRenderedLabelBounds(canvas, { x: 10, y: 20, zoom: 0.5 }))
      .toEqual([{ x: 400, y: 400, width: 200, height: 60 }]);
    expect(readDiagramRenderedLabelBounds(canvas, { x: 10, y: 20, zoom: 0 })).toEqual([]);
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 0));
    expect(readDiagramRenderedLabelBounds(canvas, { x: 10, y: 20, zoom: 0.5 })).toEqual([]);
  });
});
