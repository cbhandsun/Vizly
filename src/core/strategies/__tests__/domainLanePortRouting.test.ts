import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { repairDomainLanePortRoutes } from '../domainLanePortRouting';
import { countCommercialObstacleHits } from '../shared/edgeCommercialRouteGuard';
import { calculateEdgePathQualityScore } from '../shared/edgeStrictCrossingGuard';
import { createDisplayTerminalValidationSnapshot } from '../../components/shared/baseReactFlowTerminalValidation';

const nodes: Node[] = ['source', 'blocker', 'target'].map((id, index) => ({
  id, position: { x: index * 240, y: 0 }, width: 120, height: 80,
  measured: { width: 120, height: 80 }, data: {},
}));
const edges: Edge[] = [{
  id: 'route', source: 'source', target: 'target', sourceHandle: 'right', targetHandle: 'left',
  data: { computedPath: [{ x: 120, y: 40 }, { x: 480, y: 40 }] },
}];

describe('domain lane obstacle-aware port selection', () => {
  it('escapes an intervening business node with attached orthogonal terminals', () => {
    const original = structuredClone({ nodes, edges });
    expect(countCommercialObstacleHits(edges, nodes)).toBeGreaterThan(0);
    const result = repairDomainLanePortRoutes(edges, nodes);
    expect(countCommercialObstacleHits(result, nodes)).toBe(0);
    expect(calculateEdgePathQualityScore(result)).toMatchObject({ nonOrthogonalSegments: 0, strictCrossings: 0 });
    expect(createDisplayTerminalValidationSnapshot(nodes).validateEdge(result[0]))
      .toMatchObject({ attached: true, anchored: true });
    expect({ nodes, edges }).toEqual(original);
  });

  it('preserves explicit manual source and target sides', () => {
    const manual = edges.map(edge => ({ ...edge, data: { ...edge.data, manualHandleSides: ['source', 'target'] } }));
    const [result] = repairDomainLanePortRoutes(manual, nodes);
    expect(result).toMatchObject({ sourceHandle: 'right', targetHandle: 'left' });
    expect(countCommercialObstacleHits([result], nodes)).toBe(0);
  });

  it('is deterministic and preserves graph identity', () => {
    const result = repairDomainLanePortRoutes(edges, nodes);
    expect(repairDomainLanePortRoutes(edges, nodes)).toEqual(result);
    expect(result.map(({ id, source, target }) => ({ id, source, target })))
      .toEqual(edges.map(({ id, source, target }) => ({ id, source, target })));
  });

  it('leaves missing endpoints to the caller validation without inventing nodes', () => {
    expect(repairDomainLanePortRoutes(edges, [])).toBe(edges);
    expect(repairDomainLanePortRoutes([], nodes)).toEqual([]);
  });

  it('bounds interactive seed work for extreme graph sizes', () => {
    const largeEdges = Array.from({ length: 49 }, (_, index) => ({ ...edges[0], id: `edge-${index}` }));
    expect(repairDomainLanePortRoutes(largeEdges, nodes)).toBe(largeEdges);
    const largeNodes = Array.from({ length: 129 }, (_, index) => ({ ...nodes[0], id: `node-${index}` }));
    expect(repairDomainLanePortRoutes(edges, largeNodes)).toBe(edges);
  });

  it('treats prototype-like identifiers as graph data', () => {
    const safeNodes = nodes.map(node => node.id === 'source' ? { ...node, id: '__proto__' } : node);
    const safeEdges = edges.map(edge => ({ ...edge, source: '__proto__' }));
    expect(countCommercialObstacleHits(repairDomainLanePortRoutes(safeEdges, safeNodes), safeNodes)).toBe(0);
    expect(Object.prototype).not.toHaveProperty('computedPath');
  });
});
