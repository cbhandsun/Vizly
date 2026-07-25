import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createSimpleNodeMap } from '../../../hooks/useNodeMap';

describe('createSimpleNodeMap', () => {
  it('resolves nested coordinates without mutating source nodes', () => {
    const nodes: Node[] = [
      { id: 'parent', position: { x: 100, y: 50 }, data: {} },
      { id: 'child', parentId: 'parent', position: { x: 20, y: 10 }, data: {} },
    ];
    const snapshot = structuredClone(nodes);

    const result = createSimpleNodeMap(nodes);

    expect(result.get('child')?.position).toEqual({ x: 120, y: 60 });
    expect(nodes).toEqual(snapshot);
  });

  it('terminates cyclic parent chains with finite geometry', () => {
    const nodes: Node[] = [
      { id: 'first', parentId: 'second', position: { x: 10, y: 20 }, data: {} },
      { id: 'second', parentId: 'first', position: { x: 30, y: 40 }, data: {} },
    ];

    const result = createSimpleNodeMap(nodes);

    expect(result.size).toBe(2);
    for (const node of result.values()) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it('bounds extreme parent depth and applies safe default dimensions', () => {
    const nodes: Node[] = Array.from({ length: 400 }, (_, index) => ({
      id: `node-${index}`,
      parentId: index === 0 ? undefined : `node-${index - 1}`,
      position: { x: 1, y: 1 },
      data: {},
    }));

    const result = createSimpleNodeMap(nodes);
    const deepest = result.get('node-399');

    expect(deepest).toEqual(expect.objectContaining({
      width: 150,
      height: 80,
    }));
    expect(deepest?.x).toBeLessThanOrEqual(257);
    expect(deepest?.y).toBeLessThanOrEqual(257);
  });
});
