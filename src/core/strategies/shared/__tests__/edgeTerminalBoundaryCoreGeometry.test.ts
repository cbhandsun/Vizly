import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildGeometricExitTerminalReanchor,
  compactPath,
  getEdgePath,
  nodeRect,
} from '../edgeTerminalBoundaryCoreGeometry';

describe('edgeTerminalBoundaryCoreGeometry', () => {
  it('coerces finite edge path points and rejects malformed path containers', () => {
    const edge = {
      id: 'edge',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: '10', y: 20 },
          { x: Number.NaN, y: 30 },
          { x: 40, y: Number.POSITIVE_INFINITY },
        ],
      },
    } as unknown as Edge;

    expect(getEdgePath(edge)).toEqual([{ x: 10, y: 20 }]);
    expect(getEdgePath({ ...edge, data: { computedPath: 'invalid' } })).toEqual([]);
  });

  it('validates node dimensions before exposing a routing rectangle', () => {
    const valid = {
      id: 'node',
      position: { x: 10, y: 20 },
      width: 100,
      height: 80,
      data: {},
    } as Node;

    expect(nodeRect(valid)).toEqual({ x: 10, y: 20, width: 100, height: 80 });
    expect(nodeRect({ ...valid, width: 1 })).toBeNull();
    expect(nodeRect(undefined)).toBeNull();
  });

  it('compacts duplicate and collinear points without changing turns', () => {
    expect(compactPath([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
    ]);
  });

  it('reanchors a path that exits through the node interior onto its boundary', () => {
    const edge: Edge = { id: 'edge', source: 'source', target: 'target' };
    const result = buildGeometricExitTerminalReanchor([
      { x: 50, y: 50 },
      { x: 50, y: 80 },
      { x: 50, y: 120 },
      { x: 150, y: 120 },
    ], { x: 0, y: 0, width: 100, height: 100 }, 'source', edge);

    expect(result).toEqual({
      side: 'bottom',
      path: [
        { x: 50, y: 100 },
        { x: 50, y: 120 },
        { x: 150, y: 120 },
      ],
    });
  });
});
