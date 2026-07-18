import type { Point, Rectangle } from '../../types/routing';
import { Position } from '../../types/routing';
import type { ObstacleAnalyzer } from '../preprocessing/ObstacleAnalyzer';

type IntersectionAnalyzer = Pick<ObstacleAnalyzer, 'intersectsAnyObstacle'>;

interface BuildWorkerReverseBypassPathOptions {
  layoutDirection?: string;
  bypassSide: Position;
  sourceRect: Rectangle;
  targetRect: Rectangle;
  obstacles: Rectangle[];
  startPoint: Point;
  startOffset: Point;
  endOffset: Point;
  endPoint: Point;
  analyzer: IntersectionAnalyzer;
}

export const isSameWorkerPoint = (first: Point, second: Point): boolean => (
  Math.abs(first.x - second.x) + Math.abs(first.y - second.y) < 0.5
);

export const isWorkerPathBlocked = (
  path: Point[],
  obstacles: Rectangle[],
  analyzer: IntersectionAnalyzer,
  padding = 0,
): boolean => {
  for (let index = 0; index < path.length - 1; index += 1) {
    if (analyzer.intersectsAnyObstacle(
      path[index],
      path[index + 1],
      obstacles,
      padding,
    )) {
      return true;
    }
  }
  return false;
};

export const ensureSafeWorkerStitch = (
  points: Point[],
  start: Point,
  end: Point,
  obstacles: Rectangle[],
  analyzer: IntersectionAnalyzer,
): Point[] => {
  let result = [...points];
  if (result.length === 0) return [start, end];

  if (!isSameWorkerPoint(result[0], start)) {
    const first = result[0];
    if (isWorkerPathBlocked([start, first], obstacles, analyzer)) {
      const verticalFirst = { x: start.x, y: first.y };
      const horizontalFirst = { x: first.x, y: start.y };
      if (!isWorkerPathBlocked(
        [start, verticalFirst, first],
        obstacles,
        analyzer,
      )) {
        result = [start, verticalFirst, ...result];
      } else if (!isWorkerPathBlocked(
        [start, horizontalFirst, first],
        obstacles,
        analyzer,
      )) {
        result = [start, horizontalFirst, ...result];
      } else {
        result = [start, ...result];
      }
    } else {
      result = [start, ...result];
    }
  }

  const last = result[result.length - 1];
  if (!isSameWorkerPoint(last, end)) {
    if (isWorkerPathBlocked([last, end], obstacles, analyzer)) {
      const horizontalFirst = { x: last.x, y: end.y };
      const verticalFirst = { x: end.x, y: last.y };
      if (!isWorkerPathBlocked(
        [last, horizontalFirst, end],
        obstacles,
        analyzer,
      )) {
        result = [...result, horizontalFirst, end];
      } else if (!isWorkerPathBlocked(
        [last, verticalFirst, end],
        obstacles,
        analyzer,
      )) {
        result = [...result, verticalFirst, end];
      } else {
        result = [...result, end];
      }
    } else {
      result = [...result, end];
    }
  }
  return result;
};

export const buildWorkerReverseBypassPath = ({
  layoutDirection = 'TB',
  bypassSide,
  sourceRect,
  targetRect,
  obstacles,
  startPoint,
  startOffset,
  endOffset,
  endPoint,
  analyzer,
}: BuildWorkerReverseBypassPathOptions): Point[] | null => {
  const isVerticalFlow = layoutDirection === 'TB' || layoutDirection === 'BT';
  const minX = Math.min(sourceRect.x, targetRect.x);
  const maxX = Math.max(
    sourceRect.x + sourceRect.width,
    targetRect.x + targetRect.width,
  );
  const minY = Math.min(sourceRect.y, targetRect.y);
  const maxY = Math.max(
    sourceRect.y + sourceRect.height,
    targetRect.y + targetRect.height,
  );
  const corridorSlack = 80;
  const corridorObstacles = obstacles.filter((obstacle) => {
    if (isVerticalFlow) {
      const overlapsY = obstacle.y + obstacle.height > minY && obstacle.y < maxY;
      return overlapsY
        && obstacle.x < maxX + corridorSlack
        && obstacle.x + obstacle.width > minX - corridorSlack;
    }
    const overlapsX = obstacle.x + obstacle.width > minX && obstacle.x < maxX;
    return overlapsX
      && obstacle.y < maxY + corridorSlack
      && obstacle.y + obstacle.height > minY - corridorSlack;
  });
  const bypassPadding = 60;
  let path: Point[];

  if (isVerticalFlow) {
    const obstacleEdges = corridorObstacles.map((obstacle) => (
      bypassSide === Position.Left
        ? obstacle.x
        : obstacle.x + obstacle.width
    ));
    const nodeEdge = bypassSide === Position.Left
      ? Math.min(sourceRect.x, targetRect.x)
      : Math.max(
        sourceRect.x + sourceRect.width,
        targetRect.x + targetRect.width,
      );
    const outerEdge = bypassSide === Position.Left
      ? Math.min(nodeEdge, ...obstacleEdges)
      : Math.max(nodeEdge, ...obstacleEdges);
    const bypassX = outerEdge
      + (bypassSide === Position.Left ? -bypassPadding : bypassPadding);
    path = [
      startPoint,
      startOffset,
      { x: bypassX, y: startOffset.y },
      { x: bypassX, y: endOffset.y },
      endOffset,
      endPoint,
    ];
  } else {
    const obstacleEdges = corridorObstacles.map((obstacle) => (
      bypassSide === Position.Top
        ? obstacle.y
        : obstacle.y + obstacle.height
    ));
    const nodeEdge = bypassSide === Position.Top
      ? Math.min(sourceRect.y, targetRect.y)
      : Math.max(
        sourceRect.y + sourceRect.height,
        targetRect.y + targetRect.height,
      );
    const outerEdge = bypassSide === Position.Top
      ? Math.min(nodeEdge, ...obstacleEdges)
      : Math.max(nodeEdge, ...obstacleEdges);
    const bypassY = outerEdge
      + (bypassSide === Position.Top ? -bypassPadding : bypassPadding);
    path = [
      startPoint,
      startOffset,
      { x: startOffset.x, y: bypassY },
      { x: endOffset.x, y: bypassY },
      endOffset,
      endPoint,
    ];
  }

  return isWorkerPathBlocked(path, obstacles, analyzer, 4) ? null : path;
};
