import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createGlobalEdgeWaypointRefinementDiagnostics,
  refineGlobalEdgeWaypoints,
} from '../edgeGlobalWaypointRefinement';

type Point = Readonly<{ x: number; y: number }>;
type Rect = Readonly<{ height: number; width: number; x: number; y: number }>;

const transformRect = (
  rect: Rect,
  transform: (point: Point) => Point,
): Rect => {
  const corners = [
    transform({ x: rect.x, y: rect.y }),
    transform({ x: rect.x + rect.width, y: rect.y }),
    transform({ x: rect.x, y: rect.y + rect.height }),
    transform({ x: rect.x + rect.width, y: rect.y + rect.height }),
  ];
  const xs = corners.map(point => point.x);
  const ys = corners.map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    height: Math.max(...ys) - y,
    width: Math.max(...xs) - x,
    x,
    y,
  };
};

const createEdges = (transform: (point: Point) => Point): Edge[] => ([
  {
    id: 'primary',
    source: 'primary-source',
    target: 'primary-target',
    data: {
      computedPath: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ].map(transform),
    },
  },
  {
    id: 'crossing',
    source: 'crossing-source',
    target: 'crossing-target',
    data: {
      computedPath: [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
      ].map(transform),
    },
  },
]);

const createNodes = (transform: (point: Point) => Point): Node[] => {
  const rects: Rect[] = [
    { x: 90, y: 40, width: 20, height: 20 },
    ...Array.from({ length: 120 }, (_, index) => ({
      x: 10_000 + (index % 12) * 160,
      y: 10_000 + Math.floor(index / 12) * 120,
      width: 80,
      height: 48,
    })),
  ];
  return rects.map((rect, index) => {
    const transformed = transformRect(rect, transform);
    return {
      id: `node-${index}`,
      position: { x: transformed.x, y: transformed.y },
      width: transformed.width,
      height: transformed.height,
      data: {},
    };
  });
};

const routeGeometry = (edges: Edge[]): unknown[] => edges.map(edge => ({
  id: edge.id,
  path: edge.data?.computedPath,
}));

describe('global edge waypoint refinement indexes', () => {
  it('matches full node scans in every layout direction while pruning distant nodes', () => {
    const transforms: Array<(point: Point) => Point> = [
      point => point,
      point => ({ x: point.x, y: -point.y }),
      point => ({ x: point.y, y: point.x }),
      point => ({ x: -point.y, y: point.x }),
    ];

    for (const transform of transforms) {
      const edges = createEdges(transform);
      const nodes = createNodes(transform);
      const indexedDiagnostics = createGlobalEdgeWaypointRefinementDiagnostics();
      const fullScanDiagnostics = createGlobalEdgeWaypointRefinementDiagnostics();
      const indexed = refineGlobalEdgeWaypoints(edges, nodes, {
        diagnostics: indexedDiagnostics,
      });
      const fullScan = refineGlobalEdgeWaypoints(edges, nodes, {
        diagnostics: fullScanDiagnostics,
        disableVisualRectIndex: true,
      });

      expect(routeGeometry(indexed)).toEqual(routeGeometry(fullScan));
      expect(indexedDiagnostics.evaluationCount).toBe(fullScanDiagnostics.evaluationCount);
      expect(indexedDiagnostics.scannedNodeCount).toBeLessThan(fullScanDiagnostics.scannedNodeCount);
    }
  });
});
