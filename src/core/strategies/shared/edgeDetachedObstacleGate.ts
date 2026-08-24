import type { Edge } from '@xyflow/react';

import type { Point, Rect } from './edgeDetachedOverlapCandidates';
import type { RoutingObstacleGate } from './edgeDetachedOverlapRepairTypes';
import { countRoutingObstacleHits } from './edgeWaypointCandidateRepair';

type ObstacleGateCacheDiagnostics = {
  cacheHitCount: number;
};

const MAX_CACHEABLE_PATH_POINTS = 256;
const MAX_GEOMETRY_CACHE_ENTRIES = 4_096;

const finitePathSignature = (path: readonly Point[]): string | null => {
  if (path.length > MAX_CACHEABLE_PATH_POINTS) return null;
  const coordinates: string[] = [];
  for (const point of path) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    coordinates.push(`${point.x}:${point.y}`);
  }
  return coordinates.join('|');
};

/**
 * Reuses exact obstacle-hit results inside one repair transaction. Candidate
 * builders often clone a previously evaluated path, so the bounded geometry
 * cache complements the identity cache without trusting mutable external data.
 */
export const createRoutingObstacleGate = (
  edges: Edge[],
  obstacles: Map<string, Rect>,
  diagnostics?: ObstacleGateCacheDiagnostics,
): RoutingObstacleGate => {
  const hitsByPath = new WeakMap<Point[], Map<number, number>>();
  const hitsByGeometry = new Map<string, number>();
  const hitsFor = (path: Point[], edgeIndex: number): number => {
    let byEdge = hitsByPath.get(path);
    if (!byEdge) {
      byEdge = new Map<number, number>();
      hitsByPath.set(path, byEdge);
    }
    const identityCached = byEdge.get(edgeIndex);
    if (identityCached !== undefined) {
      if (diagnostics) diagnostics.cacheHitCount += 1;
      return identityCached;
    }
    const pathSignature = finitePathSignature(path);
    const geometryKey = pathSignature === null ? null : `${edgeIndex}:${pathSignature}`;
    const geometryCached = geometryKey === null ? undefined : hitsByGeometry.get(geometryKey);
    if (geometryCached !== undefined) {
      byEdge.set(edgeIndex, geometryCached);
      if (diagnostics) diagnostics.cacheHitCount += 1;
      return geometryCached;
    }
    const edge = edges[edgeIndex];
    const hits = edge
      ? countRoutingObstacleHits(path, edge, obstacles)
      : Number.POSITIVE_INFINITY;
    byEdge.set(edgeIndex, hits);
    if (geometryKey !== null && hitsByGeometry.size < MAX_GEOMETRY_CACHE_ENTRIES) {
      hitsByGeometry.set(geometryKey, hits);
    }
    return hits;
  };

  return (baselinePaths, candidatePaths, changedIndexes) => changedIndexes.every(edgeIndex => (
    candidatePaths[edgeIndex]
    && baselinePaths[edgeIndex]
    && hitsFor(candidatePaths[edgeIndex], edgeIndex) <= hitsFor(baselinePaths[edgeIndex], edgeIndex)
  ));
};
