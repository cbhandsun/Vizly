import type { LineObstacle } from '../../algorithms/pathfinding';
import {
  analyzeGeometry,
  getPortRulesForGeometry,
  portCombinationToString,
} from '../../algorithms/geometry-classifier';
import type {
  PathFindingJob,
  Rectangle,
  UnifiedRoutingConfig,
} from '../../types/routing';
import { Position } from '../../types/routing';
import type { PortSelector } from '../preprocessing/PortSelector';

interface SelectWorkerPortsOptions {
  job: PathFindingJob;
  config: UnifiedRoutingConfig;
  selector: Pick<PortSelector, 'selectPorts'>;
  sourceRect: Rectangle;
  targetRect: Rectangle;
  obstacles: Rectangle[];
  pendingEdges?: LineObstacle[];
  effectiveDirection: string;
  portUsage: Record<string, number>;
  startPosition: Position;
  endPosition: Position;
  hasFixedSourcePort: boolean;
  hasFixedTargetPort: boolean;
  hasExplicitSource: boolean;
  hasExplicitTarget: boolean;
  isGlobalTrunkMember: boolean;
}

export interface WorkerPortSelectionResult {
  startPosition: Position;
  endPosition: Position;
}

const hasSourceOvershoot = (
  position: Position,
  deltaX: number,
  deltaY: number,
): boolean => (
  (position === Position.Right && deltaX < -40)
  || (position === Position.Left && deltaX > 40)
  || (position === Position.Bottom && deltaY < -40)
  || (position === Position.Top && deltaY > 40)
);

const hasSameSideTargetOvershoot = (
  startPosition: Position,
  endPosition: Position,
  deltaX: number,
  deltaY: number,
): boolean => startPosition === endPosition && (
  (startPosition === Position.Right && deltaX > 40)
  || (startPosition === Position.Left && deltaX < -40)
  || (startPosition === Position.Bottom && deltaY > 40)
  || (startPosition === Position.Top && deltaY < -40)
);

export const selectWorkerPorts = ({
  job,
  config,
  selector,
  sourceRect,
  targetRect,
  obstacles,
  pendingEdges,
  effectiveDirection,
  portUsage,
  startPosition: initialStartPosition,
  endPosition: initialEndPosition,
  hasFixedSourcePort,
  hasFixedTargetPort,
  hasExplicitSource,
  hasExplicitTarget,
  isGlobalTrunkMember,
}: SelectWorkerPortsOptions): WorkerPortSelectionResult => {
  let startPosition = initialStartPosition;
  let endPosition = initialEndPosition;
  const selection = selector.selectPorts(sourceRect, targetRect, obstacles, {
    effectiveDir: effectiveDirection,
    portUsage,
    sourceId: job.source,
    targetId: job.target,
    lineObstacles: pendingEdges,
    constrainedSourcePos: hasFixedSourcePort ? startPosition : undefined,
    constrainedTargetPos: hasFixedTargetPort ? endPosition : undefined,
  });
  const geometry = analyzeGeometry(
    (targetRect.x + targetRect.width / 2)
      - (sourceRect.x + sourceRect.width / 2),
    (targetRect.y + targetRect.height / 2)
      - (sourceRect.y + sourceRect.height / 2),
    {
      sourceBounds: sourceRect,
      targetBounds: targetRect,
      sourceSize: { width: sourceRect.width, height: sourceRect.height },
      targetSize: { width: targetRect.width, height: targetRect.height },
    },
  );
  const rules = getPortRulesForGeometry(geometry);
  const currentForbidden = rules.forbidden.includes(
    portCombinationToString(startPosition, endPosition),
  );
  const bestSourceForbidden = rules.forbidden.includes(
    portCombinationToString(selection.sourcePos, endPosition),
  );
  const bestTargetForbidden = rules.forbidden.includes(
    portCombinationToString(startPosition, selection.targetPos),
  );
  const highConfidence = selection.confidence
    > config.portSelection.highConfidenceThreshold;
  const allowSourceOverride = !isGlobalTrunkMember && (
    (!job.isOneToMany && config.portSelection.preferGeometryOverBus)
    || (currentForbidden && !bestSourceForbidden)
  );
  const allowTargetOverride = !isGlobalTrunkMember && (
    (!job.isManyToOne && config.portSelection.preferGeometryOverBus)
    || (currentForbidden && !bestTargetForbidden)
  );

  if (!hasFixedSourcePort && (
    highConfidence
    || (
      !hasExplicitSource
      && allowSourceOverride
      && !bestSourceForbidden
      && (currentForbidden || highConfidence)
      && selection.sourcePos !== startPosition
    )
  )) {
    startPosition = selection.sourcePos;
  }
  if (!hasFixedTargetPort && (
    highConfidence
    || (
      !hasExplicitTarget
      && allowTargetOverride
      && !bestTargetForbidden
      && (currentForbidden || highConfidence)
      && selection.targetPos !== endPosition
    )
  )) {
    endPosition = selection.targetPos;
  }

  if (!isGlobalTrunkMember && !job.isOneToMany && !job.isManyToOne) {
    const deltaX = (targetRect.x + targetRect.width / 2)
      - (sourceRect.x + sourceRect.width / 2);
    const deltaY = (targetRect.y + targetRect.height / 2)
      - (sourceRect.y + sourceRect.height / 2);
    if (
      hasSourceOvershoot(startPosition, deltaX, deltaY)
      || hasSameSideTargetOvershoot(startPosition, endPosition, deltaX, deltaY)
    ) {
      const unconstrained = selector.selectPorts(sourceRect, targetRect, obstacles, {
        effectiveDir: effectiveDirection,
        portUsage,
        sourceId: job.source,
        targetId: job.target,
        lineObstacles: pendingEdges,
      });
      startPosition = unconstrained.sourcePos;
      endPosition = unconstrained.targetPos;
    }
  }

  return { startPosition, endPosition };
};
