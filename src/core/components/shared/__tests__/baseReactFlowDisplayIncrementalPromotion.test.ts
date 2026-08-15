import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  findBaseReactFlowBlockedContextEdgePromotions,
  findBaseReactFlowStrictContextEdgePromotions,
} from '../baseReactFlowDisplayIncrementalPromotion';

const changedNode = (overrides: Partial<Node> = {}): Node => ({
  id: 'changed',
  type: 'custom',
  position: { x: 100, y: 100 },
  measured: { width: 100, height: 100 },
  data: {},
  ...overrides,
});

describe('findBaseReactFlowStrictContextEdgePromotions', () => {
  const crossingEdges: Edge[] = [
    {
      id: 'mutable', source: 'a', target: 'b', data: {
        computedPath: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      },
    },
    {
      id: 'context', source: 'c', target: 'd', data: {
        computedPath: [{ x: 50, y: 0 }, { x: 50, y: 100 }],
      },
    },
    {
      id: 'unrelated-context', source: 'e', target: 'f', data: {
        computedPath: [{ x: 150, y: 0 }, { x: 150, y: 100 }],
      },
    },
  ];

  it('promotes only context edges that strictly cross a mutable edge', () => {
    expect(findBaseReactFlowStrictContextEdgePromotions({
      edges: crossingEdges,
      mutableEdgeIds: new Set(['mutable']),
      contextEdgeIds: ['context', 'unrelated-context'],
    })).toEqual(['context']);
  });

  it('keeps context-to-context crossings frozen without mutable evidence', () => {
    expect(findBaseReactFlowStrictContextEdgePromotions({
      edges: crossingEdges,
      mutableEdgeIds: new Set<string>(),
      contextEdgeIds: ['mutable', 'context'],
    })).toEqual([]);
  });
});

const contextEdge = (id: string, y: number): Edge => ({
  id,
  source: `source-${id}`,
  target: `target-${id}`,
  type: 'stablePath',
  data: {
    computedPath: [
      { x: 0, y },
      { x: 300, y },
    ],
  },
});

describe('findBaseReactFlowBlockedContextEdgePromotions', () => {
  it('promotes a frozen branch before it enters the changed node commercial-clearance zone', () => {
    const edge = contextEdge('near-branch', 242);

    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: [edge],
      nodes: [changedNode()],
      changedNodeIds: ['changed'],
      contextEdgeIds: [],
    })).toEqual([edge.id]);
  });

  it('keeps a branch frozen at the exact commercial-clearance boundary', () => {
    const edge = contextEdge('clear-branch', 248);

    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: [edge],
      nodes: [changedNode()],
      changedNodeIds: ['changed'],
      contextEdgeIds: [edge.id],
    })).toEqual([]);
  });

  it('ignores incident, unlisted, container, and unmeasured obstacles', () => {
    const incident = {
      ...contextEdge('incident', 150),
      source: 'changed',
    };
    const unlisted = contextEdge('unlisted', 150);
    const listed = contextEdge('listed', 150);

    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: [incident, unlisted, listed],
      nodes: [changedNode({ type: 'titleGroup' })],
      changedNodeIds: ['changed'],
      contextEdgeIds: [incident.id, listed.id],
    })).toEqual([]);
    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges: [incident, unlisted, listed],
      nodes: [changedNode({ measured: undefined })],
      changedNodeIds: ['changed'],
      contextEdgeIds: [incident.id, listed.id],
    })).toEqual([]);
  });

  it('requests a full route when more than eight context branches need promotion', () => {
    const edges = Array.from({ length: 9 }, (_, index) => (
      contextEdge(`branch-${index}`, 220 + index)
    ));

    expect(findBaseReactFlowBlockedContextEdgePromotions({
      edges,
      nodes: [changedNode()],
      changedNodeIds: ['changed'],
      contextEdgeIds: edges.map(edge => edge.id),
    })).toBeNull();
  });
});
