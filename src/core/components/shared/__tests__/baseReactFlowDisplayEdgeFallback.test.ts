import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { synthesizeStableFallbackPath } from '../baseReactFlowDisplayEdgeCore';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
  { id: 'target', position: { x: 300, y: 0 }, width: 100, height: 60, data: {} },
];

describe('base React Flow display edge fallback', () => {
  it('seeds only an explicitly allowed unrouted Flow edge', () => {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const connectedEdge: Edge = {
      id: 'new-connection',
      source: 'source',
      target: 'target',
    };

    expect(synthesizeStableFallbackPath({ edge: connectedEdge, nodeById })).toBe(connectedEdge);
    const result = synthesizeStableFallbackPath({
      edge: connectedEdge,
      nodeById,
      allowUnroutedFlowEdge: true,
    });

    expect(result).not.toBe(connectedEdge);
    expect(result.data).toMatchObject({
      algorithm: 'display-stable-fallback',
      layoutPathLocked: true,
    });
    expect(result.data?.computedPath).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    ]));
    const relationshipEdge = { ...connectedEdge, type: 'relationshipEdge' };
    expect(synthesizeStableFallbackPath({
      edge: relationshipEdge,
      nodeById,
      allowUnroutedFlowEdge: true,
    })).toBe(relationshipEdge);
  });
});
