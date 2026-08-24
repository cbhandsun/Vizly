import type { Edge } from '@xyflow/react';

import { createRoutingWaypointSegmentGroupIndex } from './edgeRoutingWaypointSegmentIndex';
import {
  bendCount,
  MIN_INTERIOR_LEG,
  parallelOverlapLength,
  pathLength,
  segmentIntersectsRect,
  strictCrosses,
  toSegments,
  turnbackCount,
  visualStrictCrosses,
  type Point,
  type Rect,
  type Segment,
} from './edgeGlobalWaypointGeometry';

export type PathCandidateMetrics = {
  strictCrossings: number;
  unrelatedCrossings: number;
  visualUnrelatedCrossings: number;
  unrelatedOverlap: number;
  obstacleHits: number;
  turnbacks: number;
  bends: number;
  length: number;
  score: number;
};

export type PathCandidateEvaluationContext = {
  evaluate: (path: Point[]) => PathCandidateMetrics;
};

export type GlobalEdgeWaypointRefinementDiagnostics = {
  evaluationCount: number;
  scannedEdgePairCount: number;
  scannedNodeCount: number;
  scannedSegmentCount: number;
};

export const createGlobalEdgeWaypointRefinementDiagnostics = (
): GlobalEdgeWaypointRefinementDiagnostics => ({
  evaluationCount: 0,
  scannedEdgePairCount: 0,
  scannedNodeCount: 0,
  scannedSegmentCount: 0,
});

export type GlobalEdgeWaypointRefinementOptions = Readonly<{
  diagnostics?: GlobalEdgeWaypointRefinementDiagnostics;
  disableSegmentIndex?: boolean;
}>;

const toVisualSegments = (path: Point[]): Segment[] => {
  const segments: Segment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    segments.push({ a: path[index], b: path[index + 1] });
  }
  return segments;
};

export function sharesEndpoint(first: Edge, second: Edge): boolean {
  return first.source === second.source
    || first.source === second.target
    || first.target === second.source
    || first.target === second.target;
}

export function createPathCandidateEvaluationContext(
  edge: Edge,
  key: string,
  workingPaths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
  obstacles: Map<string, Rect>,
  options: GlobalEdgeWaypointRefinementOptions = {},
): PathCandidateEvaluationContext {
  const otherPaths = [...workingPaths.entries()]
    .filter(([otherKey]) => otherKey !== key)
    .map(([otherKey, otherPath]) => {
      const otherEdge = edgeByKey.get(otherKey);
      return {
        segments: toSegments(otherPath),
        visualSegments: toVisualSegments(otherPath),
        unrelated: Boolean(otherEdge && !sharesEndpoint(edge, otherEdge)),
      };
    });
  const relevantObstacles = [...obstacles.entries()]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  const segmentGroupIndex = options.disableSegmentIndex
    ? undefined
    : createRoutingWaypointSegmentGroupIndex(
      otherPaths.map(other => other.visualSegments),
    );
  const cache = new WeakMap<Point[], PathCandidateMetrics>();

  return {
    evaluate: (path: Point[]): PathCandidateMetrics => {
      const cached = cache.get(path);
      if (cached) return cached;
      const segments = toSegments(path);
      const visualSegments = toVisualSegments(path);
      const segmentQuery = segmentGroupIndex?.queryPotentialGroupIndexes(visualSegments);
      const candidateOtherPaths = segmentQuery
        ? otherPaths.filter((_, index) => segmentQuery.groupIndexes.has(index))
        : otherPaths;
      let strictCrossings = 0;
      let unrelatedCrossingCount = 0;
      let visualUnrelatedCrossingCount = 0;
      let unrelatedOverlap = 0;
      let obstacleHitCount = 0;

      if (options.diagnostics) {
        options.diagnostics.evaluationCount += 1;
        options.diagnostics.scannedSegmentCount += segmentQuery?.scannedSegmentCount ?? 0;
      }
      for (const other of candidateOtherPaths) {
        if (options.diagnostics) {
          options.diagnostics.scannedEdgePairCount += 1;
          options.diagnostics.scannedSegmentCount += segments.length * other.segments.length;
        }
        for (const first of segments) {
          for (const second of other.segments) {
            if (strictCrosses(first, second)) {
              strictCrossings += 1;
              if (other.unrelated) unrelatedCrossingCount += 1;
            }
            if (other.unrelated) {
              const overlap = parallelOverlapLength(first, second);
              if (overlap > MIN_INTERIOR_LEG) unrelatedOverlap += overlap - MIN_INTERIOR_LEG;
            }
          }
        }
        if (other.unrelated) {
          if (options.diagnostics) {
            options.diagnostics.scannedSegmentCount += visualSegments.length
              * other.visualSegments.length;
          }
          for (const first of visualSegments) {
            for (const second of other.visualSegments) {
              if (visualStrictCrosses(first, second)) visualUnrelatedCrossingCount += 1;
            }
          }
        }
      }
      if (options.diagnostics) {
        options.diagnostics.scannedNodeCount += segments.length * relevantObstacles.length;
      }
      for (const segment of segments) {
        for (const rect of relevantObstacles) {
          if (segmentIntersectsRect(segment, rect)) obstacleHitCount += 1;
        }
      }

      const turnbacks = turnbackCount(path);
      const bends = bendCount(path);
      const length = pathLength(path);
      const metrics: PathCandidateMetrics = {
        strictCrossings,
        unrelatedCrossings: unrelatedCrossingCount,
        visualUnrelatedCrossings: visualUnrelatedCrossingCount,
        unrelatedOverlap,
        obstacleHits: obstacleHitCount,
        turnbacks,
        bends,
        length,
        score: unrelatedCrossingCount * 10000
          + visualUnrelatedCrossingCount * 9000
          + strictCrossings * 7000
          + unrelatedOverlap * 80
          + obstacleHitCount * 5000
          + turnbacks * 500
          + bends * 40
          + length,
      };
      cache.set(path, metrics);
      return metrics;
    },
  };
}
