import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  applyLayout,
  calculateSubtreeBounds,
  calculateSummaryGeometry,
  forceDirectedLayout,
} from '../LayoutAlgorithms';

const createNode = (
  id: string,
  x: number,
  y: number,
  measured?: { width: number; height: number },
): Node => ({ id, position: { x, y }, data: { label: id }, measured });

describe('forceLayoutGeometry', () => {
  it('normalizes non-finite positions and bounded force options', () => {
    const nodes = [
      createNode('__proto__', Number.NaN, Number.POSITIVE_INFINITY),
      createNode('target', 0, 0),
    ];
    const edges: Edge[] = [
      { id: 'valid', source: '__proto__', target: 'target' },
      { id: 'missing', source: 'missing', target: 'target' },
    ];

    const positions = forceDirectedLayout(nodes, edges, {
      iterations: Number.POSITIVE_INFINITY,
      idealDistance: Number.NaN,
      stepSize: Number.POSITIVE_INFINITY,
    });

    expect(positions.size).toBe(2);
    for (const position of positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
      expect(position.x).toBeGreaterThanOrEqual(100);
      expect(position.y).toBeGreaterThanOrEqual(100);
    }
  });

  it('does not apply a layout position containing NaN or Infinity', () => {
    const nodes = [createNode('valid', 1, 2), createNode('invalid', 3, 4)];
    const result = applyLayout(nodes, new Map([
      ['valid', { x: 10, y: 20 }],
      ['invalid', { x: Number.NaN, y: Number.POSITIVE_INFINITY }],
    ]));

    expect(result[0]).not.toBe(nodes[0]);
    expect(result[0].position).toEqual({ x: 10, y: 20 });
    expect(result[1]).toBe(nodes[1]);
  });

  it('produces stable explicit-layout geometry independent of prior positions', () => {
    const firstNodes = [createNode('a', 0, 0), createNode('b', 100, 50)];
    const movedNodes = [createNode('a', 5_000, -2_000), createNode('b', -900, 8_000)];
    const edges: Edge[] = [{ id: 'a-b', source: 'a', target: 'b' }];

    const first = forceDirectedLayout(firstNodes, edges, { initialization: 'deterministic' });
    const moved = forceDirectedLayout(movedNodes, edges, { initialization: 'deterministic' });

    expect([...moved.entries()]).toEqual([...first.entries()]);
  });

  it('calculates summary geometry from valid targets only', () => {
    const valid = createNode('valid', 0, 0, { width: 80, height: 30 });
    const invalid = createNode('invalid', 0, 0, { width: 10, height: 10 });
    const nodeMap = new Map(nodesToEntries([valid, invalid]));
    const positions = new Map([
      ['valid', { x: 10, y: 20 }],
      ['invalid', { x: Number.NaN, y: 0 }],
    ]);

    expect(calculateSummaryGeometry(['valid', 'invalid'], positions, nodeMap)).toEqual({
      minY: 20,
      maxY: 50,
      x: 105,
      dir: 'R',
    });
    expect(calculateSummaryGeometry(['valid'], positions, nodeMap, 'L')?.x).toBe(-5);
    expect(calculateSummaryGeometry(['missing'], positions, nodeMap)).toBeNull();
  });

  it('calculates cyclic subtree bounds once per node and skips invalid positions', () => {
    const root = createNode('root', 0, 0, { width: 100, height: 40 });
    const child = createNode('child', 0, 0, { width: 50, height: 20 });
    const invalid = createNode('invalid', 0, 0, { width: 1_000, height: 1_000 });
    const nodeMap = new Map(nodesToEntries([root, child, invalid]));
    const positions = new Map([
      ['root', { x: 0, y: 0 }],
      ['child', { x: 200, y: 100 }],
      ['invalid', { x: Infinity, y: 0 }],
    ]);
    const children = new Map([
      ['root', ['child', 'invalid']],
      ['child', ['root']],
    ]);

    expect(calculateSubtreeBounds('root', positions, nodeMap, children)).toEqual({
      x: -24,
      y: -24,
      width: 298,
      height: 168,
    });
    expect(calculateSubtreeBounds('missing', positions, nodeMap, children)).toBeNull();
  });
});

const nodesToEntries = (nodes: Node[]): Array<[string, Node]> =>
  nodes.map(node => [node.id, node]);
