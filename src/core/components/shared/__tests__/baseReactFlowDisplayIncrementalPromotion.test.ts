import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  findBaseReactFlowBlockedContextEdgePromotions,
} from '../baseReactFlowDisplayIncrementalPromotion';

const changedNode = (type = 'default'): Node => ({
  id: 'moved',
  type,
  position: { x: 100, y: 100 },
  width: 100,
  height: 80,
  data: {},
});

const routedEdge = (
  id: string,
  path: Array<{ x: number; y: number }>,
  source = `${id}-source`,
  target = `${id}-target`,
): Edge => ({
  id,
  source,
  target,
  data: { computedPath: path },
});

describe('findBaseReactFlowBlockedContextEdgePromotions', () => {
  it('promotes only frozen context edges that intersect the changed node', () => {
    const crossing = routedEdge('crossing', [
      { x: 0, y: 130 },
      { x: 250, y: 130 },
    ]);
    const clear = routedEdge('clear', [
      { x: 0, y: 60 },
      { x: 250, y: 60 },
    ]);
    const incident = routedEdge('incident', [
      { x: 100, y: 100 },
      { x: 250, y: 100 },
    ], 'moved');
    const outsideContext = routedEdge('outside-context', [
      { x: 0, y: 140 },
      { x: 250, y: 140 },
    ]);

    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: [clear, crossing, incident, outsideContext],
      nodes: [changedNode()],
      changedNodeIds: ['moved'],
      contextEdgeIds: ['clear', 'crossing', 'incident'],
    })).toEqual(['crossing']);
  });

  it('returns an empty promotion for missing geometry and container changes', () => {
    const crossing = routedEdge('crossing', [
      { x: 0, y: 130 },
      { x: 250, y: 130 },
    ]);

    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: [crossing],
      nodes: [changedNode()],
      changedNodeIds: [],
      contextEdgeIds: ['crossing'],
    })).toEqual([]);
    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: [crossing],
      nodes: [changedNode('titleGroup')],
      changedNodeIds: ['moved'],
      contextEdgeIds: ['crossing'],
    })).toEqual([]);
  });

  it('rejects promotion sets that exceed the bounded transaction budget', () => {
    const crossingEdges = Array.from({ length: 9 }, (_, index) => (
      routedEdge(`crossing-${index}`, [
        { x: 0, y: 120 + index },
        { x: 250, y: 120 + index },
      ])
    ));

    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: crossingEdges,
      nodes: [changedNode()],
      changedNodeIds: ['moved'],
      contextEdgeIds: crossingEdges.map(edge => edge.id),
    })).toBeNull();
  });
});
