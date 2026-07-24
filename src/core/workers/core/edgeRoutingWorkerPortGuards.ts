import { countObstaclesInDirection } from './GraphBuilder';
import type { PathFindingJob, Rectangle } from '../../types/routing';
import { Position } from '../../types/routing';
import type { WorkerGraphNode } from './edgeRoutingWorkerContext';
import { directWorkerPortToward } from './edgeRoutingWorkerBusGeometry';

interface ApplyWorkerPortGuardsOptions {
  job: PathFindingJob;
  sourceNode: WorkerGraphNode;
  targetNode: WorkerGraphNode;
  sourceRect: Rectangle;
  targetRect: Rectangle;
  routingObstacles: Rectangle[];
  startPosition: Position;
  endPosition: Position;
  isGlobalTrunkMember: boolean;
  hasExplicitSource: boolean;
  hasExplicitTarget: boolean;
  onDebug?: (message: string) => void;
}

export interface WorkerPortGuardResult {
  startPosition: Position;
  endPosition: Position;
  isReverseBypassActive: boolean;
  reverseBypassSide: Position | null;
  isCrossGroupEdge: boolean;
}

const parentId = (node: WorkerGraphNode): string => {
  const candidate = node.parentId ?? node.parentNode;
  return typeof candidate === 'string' ? candidate.trim() : '';
};

const checkPortConflict = (
  port: Position,
  deltaX: number,
  deltaY: number,
  absoluteX: number,
  absoluteY: number,
): boolean => {
  if (absoluteX > absoluteY) {
    if (deltaX > 0 && port === Position.Left) return true;
    if (deltaX < 0 && port === Position.Right) return true;
    if (
      (port === Position.Top || port === Position.Bottom)
      && absoluteX > absoluteY * 2
    ) {
      if (port === Position.Bottom && deltaY < 0) return true;
      if (port === Position.Top && deltaY > 0) return true;
    }
  } else {
    if (deltaY > 0 && port === Position.Top) return true;
    if (deltaY < 0 && port === Position.Bottom) return true;
    if (
      (port === Position.Left || port === Position.Right)
      && absoluteY > absoluteX * 2
    ) {
      if (port === Position.Right && deltaX < 0) return true;
      if (port === Position.Left && deltaX > 0) return true;
    }
  }
  return false;
};

const chooseReverseBypassSide = (
  sourceRect: Rectangle,
  targetRect: Rectangle,
  routingObstacles: Rectangle[],
): { side: Position | null; dominantRatio: number } => {
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const targetCenterX = targetRect.x + targetRect.width / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);
  const dominantRatio = (Math.max(absoluteX, absoluteY) + 1)
    / (Math.min(absoluteX, absoluteY) + 1);
  if (dominantRatio < 1.8) return { side: null, dominantRatio };
  const bypassGap = 80;
  if (absoluteX > absoluteY) {
    const topCount = countObstaclesInDirection(
      sourceRect,
      Position.Top,
      routingObstacles,
      120,
    ) + countObstaclesInDirection(
      targetRect,
      Position.Top,
      routingObstacles,
      120,
    );
    const bottomCount = countObstaclesInDirection(
      sourceRect,
      Position.Bottom,
      routingObstacles,
      120,
    ) + countObstaclesInDirection(
      targetRect,
      Position.Bottom,
      routingObstacles,
      120,
    );
    const topY = Math.min(sourceRect.y, targetRect.y) - bypassGap;
    const bottomY = Math.max(
      sourceRect.y + sourceRect.height,
      targetRect.y + targetRect.height,
    ) + bypassGap;
    const topLength = Math.abs(sourceRect.y - topY)
      + absoluteX
      + Math.abs(targetRect.y - topY);
    const bottomLength = Math.abs(sourceRect.y + sourceRect.height - bottomY)
      + absoluteX
      + Math.abs(targetRect.y + targetRect.height - bottomY);
    return {
      side: topCount * 200 + topLength <= bottomCount * 200 + bottomLength
        ? Position.Top
        : Position.Bottom,
      dominantRatio,
    };
  }

  const leftCount = countObstaclesInDirection(
    sourceRect,
    Position.Left,
    routingObstacles,
    120,
  ) + countObstaclesInDirection(
    targetRect,
    Position.Left,
    routingObstacles,
    120,
  );
  const rightCount = countObstaclesInDirection(
    sourceRect,
    Position.Right,
    routingObstacles,
    120,
  ) + countObstaclesInDirection(
    targetRect,
    Position.Right,
    routingObstacles,
    120,
  );
  const leftX = Math.min(sourceRect.x, targetRect.x) - bypassGap;
  const rightX = Math.max(
    sourceRect.x + sourceRect.width,
    targetRect.x + targetRect.width,
  ) + bypassGap;
  const leftLength = Math.abs(sourceRect.x - leftX)
    + absoluteY
    + Math.abs(targetRect.x - leftX);
  const rightLength = Math.abs(sourceRect.x + sourceRect.width - rightX)
    + absoluteY
    + Math.abs(targetRect.x + targetRect.width - rightX);
  const leftScore = leftCount * 200 + leftLength;
  const rightScore = rightCount * 200 + rightLength;
  const scoreDifference = Math.abs(leftScore - rightScore);
  const scoreAverage = (leftScore + rightScore) / 2;
  const side = scoreDifference / (scoreAverage + 1) <= 0.05
    && Math.abs(deltaX) > 50
    ? (deltaX > 0 ? Position.Right : Position.Left)
    : (leftScore <= rightScore ? Position.Left : Position.Right);
  return { side, dominantRatio };
};

export const applyWorkerPortGuards = ({
  job,
  sourceNode,
  targetNode,
  sourceRect,
  targetRect,
  routingObstacles,
  startPosition: rawStartPosition,
  endPosition: rawEndPosition,
  isGlobalTrunkMember,
  hasExplicitSource,
  hasExplicitTarget,
  onDebug,
}: ApplyWorkerPortGuardsOptions): WorkerPortGuardResult => {
  let startPosition = rawStartPosition;
  let endPosition = rawEndPosition;
  let reverseBypassSide: Position | null = null;
  let isReverseBypassActive = false;
  const sourceParentId = parentId(sourceNode);
  const targetParentId = parentId(targetNode);
  const isCrossGroupEdge = !!(
    sourceParentId
    && targetParentId
    && sourceParentId !== targetParentId
  );

  if (
    job.isReverseEdge
    && !isGlobalTrunkMember
    && !isCrossGroupEdge
    && !hasExplicitSource
    && !hasExplicitTarget
  ) {
    const bypass = chooseReverseBypassSide(
      sourceRect,
      targetRect,
      routingObstacles,
    );
    reverseBypassSide = bypass.side;
    if (reverseBypassSide) {
      startPosition = reverseBypassSide;
      endPosition = reverseBypassSide;
      isReverseBypassActive = true;
    } else {
      onDebug?.(
        `[Worker] ${job.source}→${job.target}: diagonal reverse edge `
        + `(ratio=${bypass.dominantRatio.toFixed(2)}<1.8), skipping U-Turn bypass.`,
      );
    }
  }

  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const targetCenterX = targetRect.x + targetRect.width / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);

  if (!isReverseBypassActive && !hasExplicitSource && !hasExplicitTarget) {
    if (checkPortConflict(startPosition, deltaX, deltaY, absoluteX, absoluteY)) {
      startPosition = directWorkerPortToward(sourceRect, targetRect).port;
    }
    if (checkPortConflict(endPosition, -deltaX, -deltaY, absoluteX, absoluteY)) {
      endPosition = directWorkerPortToward(targetRect, sourceRect).port;
    }
  }

  if (
    !isReverseBypassActive
    && !isGlobalTrunkMember
    && !hasExplicitSource
    && !hasExplicitTarget
  ) {
    const bothHorizontal = (
      startPosition === Position.Left || startPosition === Position.Right
    ) && (
      endPosition === Position.Left || endPosition === Position.Right
    );
    const bothVertical = (
      startPosition === Position.Top || startPosition === Position.Bottom
    ) && (
      endPosition === Position.Top || endPosition === Position.Bottom
    );
    if (bothHorizontal && absoluteY > absoluteX * 1.4) {
      startPosition = deltaY > 0 ? Position.Bottom : Position.Top;
      endPosition = deltaY > 0 ? Position.Top : Position.Bottom;
    } else if (bothVertical && absoluteX > absoluteY * 1.4) {
      startPosition = deltaX > 0 ? Position.Right : Position.Left;
      endPosition = deltaX > 0 ? Position.Left : Position.Right;
    }
  }

  if (
    isCrossGroupEdge
    && !isReverseBypassActive
    && !isGlobalTrunkMember
    && !job.isOneToMany
    && !job.isManyToOne
    && !hasExplicitSource
    && !hasExplicitTarget
  ) {
    const rightwardGap = targetRect.x - (sourceRect.x + sourceRect.width);
    const leftwardGap = sourceRect.x - (targetRect.x + targetRect.width);
    const lateralGap = Math.max(rightwardGap, leftwardGap);
    const minimumLateralGap = Math.max(
      80,
      Math.min(sourceRect.width, targetRect.width) * 0.35,
    );
    if (lateralGap > minimumLateralGap) {
      if (rightwardGap >= leftwardGap) {
        startPosition = Position.Right;
        endPosition = Position.Left;
      } else {
        startPosition = Position.Left;
        endPosition = Position.Right;
      }
    }
  }

  return {
    startPosition,
    endPosition,
    isReverseBypassActive,
    reverseBypassSide,
    isCrossGroupEdge,
  };
};
