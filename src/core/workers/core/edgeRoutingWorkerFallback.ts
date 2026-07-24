import type { LineObstacle, PathfindingGrid } from '../../algorithms/pathfinding';
import { generateSimplePath } from '../../algorithms/pathfinding';
import type { SpatialIndex } from '../../algorithms/SpatialIndex';
import { makePathOrthogonal } from '../../algorithms/smartEdgeUtils';
import type {
  PathFindingJob,
  Point,
  Rectangle,
  UnifiedRoutingConfig,
} from '../../types/routing';
import { Position } from '../../types/routing';
import {
  logRoutingWorkerPathfindingFallback,
  logRoutingWorkerVisibilityGraphAbort,
} from '../../utils/routingLogging';
import type { AStarPathfinder } from './AStarPathfinder';
import type { GridBuilder } from './GridBuilder';
import type { VisibilityGraphRouter } from './VisibilityGraphRouter';
import type { ObstacleAnalyzer } from '../preprocessing/ObstacleAnalyzer';
import { ensureSafeWorkerStitch } from './edgeRoutingWorkerPathSafety';

interface WorkerFallbackDebugData {
  visited?: Point[];
  grid?: {
    minX: number;
    minY: number;
    cols: number;
    rows: number;
    size: number;
    data: Int32Array;
  };
}

interface RouteWorkerFallbackOptions {
  job: PathFindingJob;
  config: UnifiedRoutingConfig;
  startPoint: Point;
  startOffset: Point;
  endOffset: Point;
  endPoint: Point;
  startPosition: Position;
  endPosition: Position;
  sourceRect: Rectangle;
  targetRect: Rectangle;
  routingObstacles: Rectangle[];
  allObstacles: Rectangle[];
  spatialIndex?: SpatialIndex;
  clearanceRects: Rectangle[];
  containerBorders: Rectangle[];
  lineObstacles: LineObstacle[];
  prebuiltGrid?: PathfindingGrid;
  congestionGrid?: Int32Array;
  shouldCollectDebugData: boolean;
  debugData: WorkerFallbackDebugData;
  gridBuilder: Pick<GridBuilder, 'buildGrid'>;
  astar: Pick<AStarPathfinder, 'findPath'>;
  visibilityGraphRouter: Pick<VisibilityGraphRouter, 'findPath'>;
  analyzer: Pick<ObstacleAnalyzer, 'intersectsAnyObstacle'>;
}

export interface WorkerFallbackResult {
  points: Point[];
  strategyName: string;
}

const pointInsideRect = (point: Point, rectangle: Rectangle): boolean => {
  const padding = 5;
  return point.x > rectangle.x - padding
    && point.x < rectangle.x + rectangle.width + padding
    && point.y > rectangle.y - padding
    && point.y < rectangle.y + rectangle.height + padding;
};

const buildLastResortPath = (
  job: PathFindingJob,
  startPoint: Point,
  startOffset: Point,
  endOffset: Point,
  endPoint: Point,
  startPosition: Position,
  endPosition: Position,
  sourceRect: Rectangle,
  targetRect: Rectangle,
): Point[] => {
  const horizontalFirst = { x: endPoint.x, y: startPoint.y };
  const verticalFirst = { x: startPoint.x, y: endPoint.y };
  const effectiveSourceRect = job.sourceRect ?? sourceRect;
  const effectiveTargetRect = job.targetRect ?? targetRect;
  const horizontalIsBlocked = pointInsideRect(horizontalFirst, effectiveSourceRect)
    || pointInsideRect(horizontalFirst, effectiveTargetRect);
  const verticalIsBlocked = pointInsideRect(verticalFirst, effectiveSourceRect)
    || pointInsideRect(verticalFirst, effectiveTargetRect);
  const useVerticalFirst = (
    horizontalIsBlocked && !verticalIsBlocked
  ) || (
    horizontalIsBlocked === verticalIsBlocked
    && (startPosition === Position.Top || startPosition === Position.Bottom)
    && (endPosition === Position.Top || endPosition === Position.Bottom)
  );
  const corner = useVerticalFirst ? verticalFirst : horizontalFirst;
  return [startPoint, startOffset, corner, endOffset, endPoint];
};

export const routeWorkerFallback = ({
  job,
  config,
  startPoint,
  startOffset,
  endOffset,
  endPoint,
  startPosition,
  endPosition,
  sourceRect,
  targetRect,
  routingObstacles,
  allObstacles,
  spatialIndex,
  clearanceRects,
  containerBorders,
  lineObstacles,
  prebuiltGrid,
  congestionGrid,
  shouldCollectDebugData,
  debugData,
  gridBuilder,
  astar,
  visibilityGraphRouter,
  analyzer,
}: RouteWorkerFallbackOptions): WorkerFallbackResult => {
  let offsetPath: Point[] | null = null;
  let strategyName = 'Unknown';

  if (config.algorithm.useVisibilityGraph) {
    const visibilityPath = visibilityGraphRouter.findPath(
      startOffset,
      endOffset,
      routingObstacles,
      undefined,
      lineObstacles,
    );
    if (visibilityPath) {
      const orthogonalPath = makePathOrthogonal(visibilityPath, {
        sourcePos: startPosition,
        targetPos: endPosition,
        strictOrthogonal: true,
      }, routingObstacles);
      if (orthogonalPath) {
        offsetPath = visibilityPath;
        strategyName = 'Visibility Graph';
      } else if (shouldCollectDebugData) {
        logRoutingWorkerVisibilityGraphAbort();
      }
    }
  }

  if (!offsetPath) {
    const grid = prebuiltGrid ?? gridBuilder.buildGrid(
      spatialIndex ?? allObstacles,
      {
        startX: startOffset.x,
        startY: startOffset.y,
        endX: endOffset.x,
        endY: endOffset.y,
      },
      job.source,
      job.target,
    );
    offsetPath = astar.findPath(startOffset, endOffset, {
      grid,
      obstacles: routingObstacles,
      clearanceRects,
      config,
      lineObstacles,
      containerBorders,
      congestionGrid,
      debugOut: shouldCollectDebugData ? debugData : undefined,
    });
    if (offsetPath) strategyName = 'A* Grid';
  }

  if (offsetPath) {
    const stitched = ensureSafeWorkerStitch(
      offsetPath,
      startOffset,
      endOffset,
      routingObstacles,
      analyzer,
    );
    return {
      points: [startPoint, ...stitched, endPoint],
      strategyName,
    };
  }

  logRoutingWorkerPathfindingFallback(job.edgeId);
  const simplePath = generateSimplePath(startOffset, endOffset, routingObstacles);
  if (simplePath) {
    const stitched = ensureSafeWorkerStitch(
      simplePath,
      startOffset,
      endOffset,
      routingObstacles,
      analyzer,
    );
    return {
      points: [startPoint, ...stitched, endPoint],
      strategyName: 'Simple Fallback',
    };
  }

  return {
    points: buildLastResortPath(
      job,
      startPoint,
      startOffset,
      endOffset,
      endPoint,
      startPosition,
      endPosition,
      sourceRect,
      targetRect,
    ),
    strategyName: 'L-Shape Fallback',
  };
};
