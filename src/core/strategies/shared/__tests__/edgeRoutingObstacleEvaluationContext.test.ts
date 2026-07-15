import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  countEndpointNodeTraversalHits,
  countRoutingObstacleHits,
  countUnrelatedObstacleHits,
  createRoutingObstacleEvaluationContext,
} from '../edgeWaypointCandidateRepair';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Segment = { a: Point; b: Point };

const EPS = 0.5;
const ENDPOINT_INTERIOR_TOLERANCE = 0.51;

const toLegacySegments = (path: Point[]): Segment[] => {
  const segments: Segment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS) {
      segments.push({ a, b });
    }
  }
  return segments;
};

const legacySegmentIntersectsRect = (
  segment: Segment,
  rect: Rect,
  padding: number,
): boolean => {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(segment.a.y - segment.b.y) < EPS) {
    const y = segment.a.y;
    if (y <= y1 || y >= y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1)
      < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  if (Math.abs(segment.a.x - segment.b.x) < EPS) {
    const x = segment.a.x;
    if (x <= x1 || x >= x2) return false;
    return Math.max(Math.min(segment.a.y, segment.b.y), y1)
      < Math.min(Math.max(segment.a.y, segment.b.y), y2);
  }
  return false;
};

const legacyEvaluation = (
  path: Point[],
  edge: Edge,
  obstacles: Map<string, Rect>,
) => {
  const segments = toLegacySegments(path);
  let unrelatedObstacleHits = 0;
  for (const [nodeId, rect] of obstacles) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    for (const segment of segments) {
      if (legacySegmentIntersectsRect(segment, rect, 8)) unrelatedObstacleHits += 1;
    }
  }
  let endpointNodeTraversalHits = 0;
  for (const nodeId of new Set([edge.source, edge.target])) {
    const rect = obstacles.get(nodeId);
    if (!rect) continue;
    for (const segment of segments) {
      if (legacySegmentIntersectsRect(segment, rect, -ENDPOINT_INTERIOR_TOLERANCE)) {
        endpointNodeTraversalHits += 1;
      }
    }
  }
  return {
    endpointNodeTraversalHits,
    routingObstacleHits: unrelatedObstacleHits + endpointNodeTraversalHits,
    unrelatedObstacleHits,
  };
};

const edge = (source = 'source', target = 'target'): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
});

describe('routing obstacle evaluation context', () => {
  it.each([
    {
      name: 'horizontal forward segments',
      edge: edge(),
      obstacles: new Map([
        ['source', { x: 0, y: 0, width: 20, height: 20 }],
        ['block', { x: 40, y: 10, width: 10, height: 10 }],
        ['target', { x: 80, y: 0, width: 20, height: 20 }],
      ]),
      path: [{ x: 0, y: 15 }, { x: 90, y: 15 }],
    },
    {
      name: 'horizontal reverse segments',
      edge: edge(),
      obstacles: new Map([
        ['source', { x: 0, y: 0, width: 20, height: 20 }],
        ['block', { x: 40, y: 10, width: 10, height: 10 }],
        ['target', { x: 80, y: 0, width: 20, height: 20 }],
      ]),
      path: [{ x: 90, y: 15 }, { x: 0, y: 15 }],
    },
    {
      name: 'vertical forward segments',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: 10, y: 40, width: 10, height: 10 }],
      ]),
      path: [{ x: 15, y: 0 }, { x: 15, y: 80 }],
    },
    {
      name: 'vertical reverse segments',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: 10, y: 40, width: 10, height: 10 }],
      ]),
      path: [{ x: 15, y: 80 }, { x: 15, y: 0 }],
    },
    {
      name: 'diagonal segments',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: 20, y: 20, width: 40, height: 40 }],
      ]),
      path: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
    },
    {
      name: 'exact half-pixel axis boundary',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: 20, y: 20, width: 40, height: 40 }],
      ]),
      path: [{ x: 0, y: 30 }, { x: 100, y: 30.5 }],
    },
    {
      name: 'exact half-pixel segment length',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: -1, y: -1, width: 2, height: 2 }],
      ]),
      path: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }],
    },
    {
      name: 'open padded rectangle boundaries',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: 40, y: 10, width: 10, height: 10 }],
      ]),
      path: [
        { x: 0, y: 2 },
        { x: 70, y: 2 },
        { x: 70, y: 10 },
        { x: 58, y: 10 },
      ],
    },
    {
      name: 'same endpoint node is deduplicated',
      edge: edge('same', 'same'),
      obstacles: new Map([
        ['same', { x: 10, y: 10, width: 20, height: 20 }],
      ]),
      path: [{ x: 0, y: 20 }, { x: 40, y: 20 }],
    },
    {
      name: 'missing endpoint rectangles',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: 10, y: 10, width: 20, height: 20 }],
      ]),
      path: [{ x: 0, y: 20 }, { x: 40, y: 20 }],
    },
    {
      name: 'empty paths',
      edge: edge(),
      obstacles: new Map([
        ['source', { x: 0, y: 0, width: 20, height: 20 }],
        ['target', { x: 80, y: 0, width: 20, height: 20 }],
      ]),
      path: [],
    },
    {
      name: 'single-point paths',
      edge: edge(),
      obstacles: new Map([
        ['source', { x: 0, y: 0, width: 20, height: 20 }],
        ['target', { x: 80, y: 0, width: 20, height: 20 }],
      ]),
      path: [{ x: 10, y: 10 }],
    },
    {
      name: 'fractional coordinates',
      edge: edge('missing-source', 'missing-target'),
      obstacles: new Map([
        ['block', { x: 30.25, y: 40.75, width: 10.5, height: 9.5 }],
      ]),
      path: [
        { x: 2.125, y: 45.625 },
        { x: 68.875, y: 45.625 },
        { x: 68.875, y: 80.375 },
      ],
    },
  ])('matches legacy counts for $name', ({ path, edge: testEdge, obstacles }) => {
    const expected = legacyEvaluation(path, testEdge, obstacles);
    const context = createRoutingObstacleEvaluationContext(testEdge, obstacles);

    expect(context.evaluate(path)).toEqual(expected);
    expect(context.countUnrelatedObstacleHits(path)).toBe(expected.unrelatedObstacleHits);
    expect(context.countEndpointNodeTraversalHits(path)).toBe(expected.endpointNodeTraversalHits);
    expect(context.countPathHits(path)).toBe(expected.routingObstacleHits);
    expect(countUnrelatedObstacleHits(path, testEdge, obstacles)).toBe(expected.unrelatedObstacleHits);
    expect(countEndpointNodeTraversalHits(path, testEdge, obstacles)).toBe(expected.endpointNodeTraversalHits);
    expect(countRoutingObstacleHits(path, testEdge, obstacles)).toBe(expected.routingObstacleHits);
  });

  it('snapshots obstacle geometry without caching path results', () => {
    const sourceRect = { x: 0, y: 0, width: 20, height: 20 };
    const blockRect = { x: 40, y: 10, width: 10, height: 10 };
    const obstacles = new Map<string, Rect>([
      ['source', sourceRect],
      ['block', blockRect],
    ]);
    const testEdge = edge('source', 'missing-target');
    const path = [{ x: 0, y: 15 }, { x: 70, y: 15 }];
    const context = createRoutingObstacleEvaluationContext(testEdge, obstacles);
    const snapshot = context.evaluate(path);

    sourceRect.x = 500;
    blockRect.x = 500;
    obstacles.clear();
    obstacles.set('replacement', { x: 500, y: 500, width: 20, height: 20 });

    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(context.evaluate(path)).toEqual(snapshot);
    expect(createRoutingObstacleEvaluationContext(testEdge, obstacles).countPathHits(path)).toBe(0);

    path[1] = { x: 0, y: 60 };
    expect(context.countPathHits(path)).not.toBe(snapshot.routingObstacleHits);
    expect(context.evaluate(path)).not.toBe(snapshot);
  });
});
