import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { buildSharedEndpointTrunkSynthesisCandidates } from '../baseReactFlowDisplayEndpointTrunkCandidates';

const pathOf = (edge: Edge): Array<{ x: number; y: number }> => {
  const path = edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
    ? (edge.data as Record<string, unknown>).computedPath
    : undefined;
  return Array.isArray(path) ? path as Array<{ x: number; y: number }> : [];
};

describe('shared endpoint trunk synthesis candidates', () => {
  it('offers an endpoint-local source transaction without changing graph identity', () => {
    const nodes: Node[] = [
      { id: 'hub', position: { x: 0, y: 0 }, width: 300, height: 100, data: {} },
      { id: 'left', position: { x: 0, y: 400 }, width: 60, height: 60, data: {} },
      { id: 'right', position: { x: 240, y: 400 }, width: 60, height: 60, data: {} },
    ];
    const edges: Edge[] = [
      {
        id: 'left-edge',
        source: 'hub',
        target: 'left',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 240, y: 100 },
          { x: 240, y: 160 },
          { x: 30, y: 160 },
          { x: 30, y: 400 },
        ] },
      },
      {
        id: 'right-edge',
        source: 'hub',
        target: 'right',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 60, y: 100 },
          { x: 60, y: 200 },
          { x: 270, y: 200 },
          { x: 270, y: 400 },
        ] },
      },
    ];

    const candidates = buildSharedEndpointTrunkSynthesisCandidates(edges, nodes);
    const sharedSource = candidates.find(candidate => (
      pathOf(candidate[0])[0]?.x === pathOf(candidate[1])[0]?.x
      && pathOf(candidate[0])[1]?.x === pathOf(candidate[1])[1]?.x
    ));

    expect(sharedSource).toBeDefined();
    expect(sharedSource).not.toBe(edges);
    expect(candidates.every(candidate => (
      candidate.length === edges.length
      && candidate.every((edge, index) => edge.id === edges[index].id)
    ))).toBe(true);
  });

  it('returns only a harmless no-op candidate for an empty graph', () => {
    const edges: Edge[] = [];
    expect(buildSharedEndpointTrunkSynthesisCandidates(edges, [])).toEqual([edges]);
  });
});
