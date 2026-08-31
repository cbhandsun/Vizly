import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createBaseReactFlowRigidMoveSeed, getBaseReactFlowNonRigidMutableEdgeIds } from '../baseReactFlowDisplayRigidMove';

describe('baseReactFlowDisplayRigidMove', () => {
  it('excludes rigid paths without losing later mutable context promotions', () => {
    const mutable = new Set(['rigid', 'z']);
    const rigid = new Set(['rigid']);
    expect(getBaseReactFlowNonRigidMutableEdgeIds([], rigid)).toEqual([]);
    expect(getBaseReactFlowNonRigidMutableEdgeIds(mutable, rigid)).toEqual(['z']);
    mutable.add('a');
    expect(getBaseReactFlowNonRigidMutableEdgeIds(mutable, rigid)).toEqual(['a', 'z']);
    expect([...mutable]).toEqual(['rigid', 'z', 'a']);
    expect([...rigid]).toEqual(['rigid']);
  });

  it('fails rigid translation closed for empty, resized, asymmetric, and extreme input', () => {
    const baselineNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
      { id: 'target', position: { x: 200, y: 0 }, width: 100, height: 60, data: {} },
    ];
    const edge: Edge = {
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 100, y: 30 }, { x: 200, y: 30 }] },
    };
    const baselineEdges = [edge];
    const createSeed = (nextNodes: Node[], candidateEdges = baselineEdges) => (
      createBaseReactFlowRigidMoveSeed({
        baselineEdges: candidateEdges,
        baselineNodes,
        nextNodes,
        changedNodeIds: ['source', 'target'],
        mutableEdgeIds: ['edge'],
      })
    );
    const emptyEdges: Edge[] = [];
    const empty = createSeed(baselineNodes, emptyEdges);
    expect(empty.edges).toBe(emptyEdges);
    expect(empty.rigidEdgeIds).toEqual([]);

    const asymmetric = createSeed([
      { ...baselineNodes[0], position: { x: 10, y: 8 } },
      { ...baselineNodes[1], position: { x: 209, y: 8 } },
    ]);
    expect(asymmetric.edges).toBe(baselineEdges);
    expect(asymmetric.rigidEdgeIds).toEqual([]);

    const resized = createSeed([
      { ...baselineNodes[0], position: { x: 10, y: 8 }, width: 101 },
      { ...baselineNodes[1], position: { x: 210, y: 8 } },
    ]);
    expect(resized.rigidEdgeIds).toEqual([]);

    const extreme = createSeed([
      { ...baselineNodes[0], position: { x: 1_000_001, y: 0 } },
      { ...baselineNodes[1], position: { x: 1_000_201, y: 0 } },
    ]);
    expect(extreme.rigidEdgeIds).toEqual([]);

    const invalidPath = createSeed([
      { ...baselineNodes[0], position: { x: 10, y: 8 } },
      { ...baselineNodes[1], position: { x: 210, y: 8 } },
    ], [{ ...edge, data: { computedPath: [{ x: Number.NaN, y: 0 }, { x: 1, y: 0 }] } }]);
    expect(invalidPath.rigidEdgeIds).toEqual([]);
  });
});
