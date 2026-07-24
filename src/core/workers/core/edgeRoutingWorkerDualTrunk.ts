import type { Point, Rectangle } from '../../types/routing';
import type { ObstacleAnalyzer } from '../preprocessing/ObstacleAnalyzer';
import {
  isSameWorkerPoint,
  isWorkerPathBlocked,
} from './edgeRoutingWorkerPathSafety';

type IntersectionAnalyzer = Pick<ObstacleAnalyzer, 'intersectsAnyObstacle'>;
type TrunkHint = { source: Point; target: Point };

interface TrunkInfo {
  isVertical: boolean;
  axis: number;
  min: number;
  max: number;
}

interface BuildWorkerDualTrunkPathOptions {
  sourceTrunk: TrunkHint;
  targetTrunk: TrunkHint;
  startPoint: Point;
  startOffset: Point;
  endOffset: Point;
  endPoint: Point;
  obstacles: Rectangle[];
  analyzer: IntersectionAnalyzer;
}

const clamp = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, value))
);

const getTrunkInfo = (trunk: TrunkHint): TrunkInfo => {
  const isVertical = Math.abs(trunk.source.x - trunk.target.x) < 1;
  return isVertical
    ? {
        isVertical: true,
        axis: trunk.source.x,
        min: Math.min(trunk.source.y, trunk.target.y),
        max: Math.max(trunk.source.y, trunk.target.y),
      }
    : {
        isVertical: false,
        axis: trunk.source.y,
        min: Math.min(trunk.source.x, trunk.target.x),
        max: Math.max(trunk.source.x, trunk.target.x),
      };
};

const pointOnTrunk = (info: TrunkInfo, branchCoordinate: number): Point => (
  info.isVertical
    ? { x: info.axis, y: clamp(branchCoordinate, info.min, info.max) }
    : { x: clamp(branchCoordinate, info.min, info.max), y: info.axis }
);

const projectToTrunk = (trunk: TrunkHint, point: Point): Point => (
  pointOnTrunk(
    getTrunkInfo(trunk),
    Math.abs(trunk.source.x - trunk.target.x) < 1 ? point.y : point.x,
  )
);

const chooseParallelHandoff = (
  sourceInfo: TrunkInfo,
  targetInfo: TrunkInfo,
  sourceEntryCoordinate: number,
  targetExitCoordinate: number,
  travelDirection: number,
): { sourceExitCoordinate: number; targetEntryCoordinate: number } => {
  const overlapMin = Math.max(sourceInfo.min, targetInfo.min);
  const overlapMax = Math.min(sourceInfo.max, targetInfo.max);
  const minimumSharedTail = 24;

  if (overlapMin <= overlapMax) {
    let coordinate = travelDirection >= 0 ? overlapMax : overlapMin;
    if (
      Math.abs(targetExitCoordinate - coordinate) < minimumSharedTail
      && overlapMax - overlapMin > minimumSharedTail
    ) {
      coordinate = travelDirection >= 0
        ? clamp(targetExitCoordinate - minimumSharedTail, overlapMin, overlapMax)
        : clamp(targetExitCoordinate + minimumSharedTail, overlapMin, overlapMax);
    }
    if (
      Math.abs(coordinate - sourceEntryCoordinate) < minimumSharedTail
      && overlapMax - overlapMin > minimumSharedTail
    ) {
      coordinate = travelDirection >= 0
        ? clamp(sourceEntryCoordinate + minimumSharedTail, overlapMin, overlapMax)
        : clamp(sourceEntryCoordinate - minimumSharedTail, overlapMin, overlapMax);
    }
    return {
      sourceExitCoordinate: coordinate,
      targetEntryCoordinate: coordinate,
    };
  }

  return {
    sourceExitCoordinate: travelDirection >= 0 ? sourceInfo.max : sourceInfo.min,
    targetEntryCoordinate: travelDirection >= 0 ? targetInfo.min : targetInfo.max,
  };
};

const pushOrthogonal = (
  points: Point[],
  next: Point,
  obstacles: Rectangle[],
  analyzer: IntersectionAnalyzer,
): void => {
  const last = points[points.length - 1];
  if (!last || isSameWorkerPoint(last, next)) return;
  if (Math.abs(last.x - next.x) < 0.5 || Math.abs(last.y - next.y) < 0.5) {
    points.push(next);
    return;
  }

  const horizontalFirst = { x: next.x, y: last.y };
  const verticalFirst = { x: last.x, y: next.y };
  if (!isWorkerPathBlocked(
    [last, horizontalFirst, next],
    obstacles,
    analyzer,
    4,
  )) {
    points.push(horizontalFirst, next);
  } else if (!isWorkerPathBlocked(
    [last, verticalFirst, next],
    obstacles,
    analyzer,
    4,
  )) {
    points.push(verticalFirst, next);
  } else {
    points.push(horizontalFirst, next);
  }
};

export const buildWorkerDualTrunkPath = ({
  sourceTrunk,
  targetTrunk,
  startPoint,
  startOffset,
  endOffset,
  endPoint,
  obstacles,
  analyzer,
}: BuildWorkerDualTrunkPathOptions): Point[] | null => {
  const sourceInfo = getTrunkInfo(sourceTrunk);
  const targetInfo = getTrunkInfo(targetTrunk);
  const sourceEntry = projectToTrunk(sourceTrunk, startOffset);
  const targetExit = projectToTrunk(targetTrunk, endOffset);
  let sourceExit = projectToTrunk(sourceTrunk, endOffset);
  let targetEntry = projectToTrunk(targetTrunk, sourceExit);

  if (sourceInfo.isVertical === targetInfo.isVertical) {
    const useY = sourceInfo.isVertical;
    const travelDirection = Math.sign(
      (useY ? endOffset.y : endOffset.x)
      - (useY ? startOffset.y : startOffset.x),
    ) || 1;
    const handoff = chooseParallelHandoff(
      sourceInfo,
      targetInfo,
      useY ? sourceEntry.y : sourceEntry.x,
      useY ? targetExit.y : targetExit.x,
      travelDirection,
    );
    sourceExit = pointOnTrunk(sourceInfo, handoff.sourceExitCoordinate);
    targetEntry = pointOnTrunk(targetInfo, handoff.targetEntryCoordinate);
  }

  const waypoints: Point[] = [startPoint];
  for (const point of [
    startOffset,
    sourceEntry,
    sourceExit,
    targetEntry,
    targetExit,
    endOffset,
    endPoint,
  ]) {
    pushOrthogonal(waypoints, point, obstacles, analyzer);
  }

  return isWorkerPathBlocked(waypoints, obstacles, analyzer, 4)
    ? null
    : waypoints;
};
