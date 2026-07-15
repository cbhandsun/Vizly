import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  countRoutingObstacleHits,
  countUnrelatedObstacleHits,
} from '../../../strategies/shared/edgeWaypointCandidateRepair';
import { buildDisplayRoutingObstacles } from '../baseReactFlowDisplayGeometry';
import { createDisplayObstacleHitContext } from '../baseReactFlowDisplayObstacleHitCache';
import { repairDisplayObstacleHits } from '../baseReactFlowDisplayObstacleRepair';

const node = (id: string, x: number, y: number, width = 20, height = 20): Node => ({
  id,
  position: { x, y },
  data: {},
  width,
  height,
  measured: { width, height },
});

describe('baseReactFlowDisplayObstacleHitCache', () => {
  it('matches direct unrelated and endpoint-aware obstacle evaluation', () => {
    const nodes = [
      node('source', 0, 0),
      node('blocker', 45, 0, 10, 20),
      node('target', 100, 0),
    ];
    const edge: Edge = {
      id: 'route',
      source: 'source',
      target: 'target',
      data: {},
    };
    const path = [{ x: 10, y: 10 }, { x: 110, y: 10 }];
    const obstacles = buildDisplayRoutingObstacles(nodes);
    const context = createDisplayObstacleHitContext(nodes);

    expect(context.countUnrelated(path, edge)).toBe(
      countUnrelatedObstacleHits(path, edge, obstacles),
    );
    expect(context.countRouting(path, edge)).toBe(
      countRoutingObstacleHits(path, edge, obstacles),
    );
    expect(createDisplayObstacleHitContext(nodes)).toBe(context);
  });

  it('invalidates cached path hits after in-place node geometry and endpoint changes', () => {
    const nodes = [node('blocker', 40, 20)];
    const edge: Edge = { id: 'route', source: 'source', target: 'target', data: {} };
    const path = [{ x: 0, y: 15 }, { x: 100, y: 15 }];
    const before = createDisplayObstacleHitContext(nodes);
    expect(before.countUnrelated(path, edge)).toBe(1);

    const endpointEdge = { ...edge, source: 'blocker' };
    expect(before.countUnrelated(path, endpointEdge)).toBe(0);

    nodes[0].position = { x: 40, y: 100 };
    const after = createDisplayObstacleHitContext(nodes);
    expect(after).not.toBe(before);
    expect(after.countUnrelated(path, edge)).toBe(0);
    expect(after.countRouting(path, edge)).toBe(
      countRoutingObstacleHits(path, edge, buildDisplayRoutingObstacles(nodes)),
    );
  });

  it('returns the original clean graph without altering business attributes', () => {
    const payload = { contract: 'keep-me', nested: { enabled: true } };
    const route: Edge = {
      id: 'route',
      source: 'source',
      target: 'target',
      label: 'business label',
      style: { stroke: '#123456' },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        payload,
      },
    };
    const edges = [route];
    const nodes = [node('far-away', 40, 100)];

    const repaired = repairDisplayObstacleHits(edges, nodes, 'TB', {
      maxEdges: 1,
      maxCandidatesPerEdge: 1,
      maxQualityEvaluations: 1,
    });

    expect(repaired).toBe(edges);
    expect(repaired[0]).toBe(route);
    expect(repaired[0].data?.payload).toBe(payload);
    expect(repaired[0].label).toBe('business label');
    expect(repaired[0].style).toEqual({ stroke: '#123456' });
  });
});
