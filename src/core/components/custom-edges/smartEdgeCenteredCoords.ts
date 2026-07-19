import { Position } from '@xyflow/react';

import { parseHandlePosition } from '../../routing/utils/handleUtils';
import { getConvergencePositions } from './convergencePositions';
import type { SmartEdgeNode, SmartEdgePoint } from './smartEdgeNodeGeometry';

export type SmartEdgeLayoutDirection = 'LR' | 'RL' | 'TB' | 'BT';

export interface SmartEdgeMultiEdgeInfo {
  isManyToOne: boolean;
  isOneToMany: boolean;
  enableBus: boolean;
}

export interface SmartEdgePortLayout {
  sourcePos: Position;
  targetPos: Position;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export interface SmartEdgeCenteredCoords {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  busTrunkSource?: SmartEdgePoint;
  busTrunkTarget?: SmartEdgePoint;
  effectiveIsManyToOne: boolean;
  effectiveIsOneToMany: boolean;
  sourceNodeOrigin?: SmartEdgePoint;
  targetNodeOrigin?: SmartEdgePoint;
}

interface BuildSmartEdgeCenteredCoordsOptions {
  nodesDragging: boolean;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceNode?: SmartEdgeNode;
  targetNode?: SmartEdgeNode;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  sourcePosition?: Position;
  targetPosition?: Position;
  simpleNodeMap: ReadonlyMap<string, SmartEdgeNode>;
  smartLayout: SmartEdgePortLayout | null;
  multiEdgeInfo: SmartEdgeMultiEdgeInfo;
  layoutDirection: SmartEdgeLayoutDirection;
  respectSourceHandle: boolean;
  respectTargetHandle: boolean;
  getAbsolutePosition: (id: string) => SmartEdgePoint;
}

interface ResolveFallbackPositionsOptions {
  layoutDirection: SmartEdgeLayoutDirection;
  sourcePosition?: Position;
  targetPosition?: Position;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  smartLayout: SmartEdgePortLayout | null;
  respectSourceHandle: boolean;
  respectTargetHandle: boolean;
}

const MAX_NODE_DIMENSION = 1_000_000;
const finiteCoordinate = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const finiteDimension = (...values: unknown[]): number => {
  for (const value of values) {
    if (
      typeof value === 'number'
      && Number.isFinite(value)
      && value > 0
      && value <= MAX_NODE_DIMENSION
    ) return value;
  }
  return 0;
};

const finitePoint = (value: SmartEdgePoint | undefined, fallback: SmartEdgePoint): SmartEdgePoint => ({
  x: finiteCoordinate(value?.x, fallback.x),
  y: finiteCoordinate(value?.y, fallback.y),
});

const calculateHandlePosition = (
  node: SmartEdgeNode | undefined,
  defaultPoint: SmartEdgePoint,
  handleId?: string | null,
  defaultPosition?: Position,
): { pos: SmartEdgePoint; nodeOrigin: SmartEdgePoint } => {
  if (!node) return { pos: defaultPoint, nodeOrigin: defaultPoint };
  const rawLivePosition = node.dragging && node.positionAbsolute
    ? node.positionAbsolute
    : node.positionAbsolute ?? node.computed?.positionAbsolute ?? node.position;
  const livePosition = finitePoint(rawLivePosition, defaultPoint);
  const width = finiteDimension(node.width, node.measured?.width);
  const height = finiteDimension(node.height, node.measured?.height);
  let direction = parseHandlePosition(handleId);
  if (!direction && handleId) {
    const dx = defaultPoint.x - livePosition.x;
    const dy = defaultPoint.y - livePosition.y;
    const epsilon = 1;
    direction = Math.abs(dx) <= epsilon ? Position.Left
      : Math.abs(dx - width) <= epsilon ? Position.Right
        : Math.abs(dy) <= epsilon ? Position.Top
          : Math.abs(dy - height) <= epsilon ? Position.Bottom
            : defaultPosition;
  } else if (!handleId) {
    direction = defaultPosition;
  }
  let offsetX: number;
  let offsetY: number;

  if (direction === Position.Left) {
    offsetX = 0; offsetY = height / 2;
  } else if (direction === Position.Right) {
    offsetX = width; offsetY = height / 2;
  } else if (direction === Position.Top) {
    offsetX = width / 2; offsetY = 0;
  } else if (direction === Position.Bottom) {
    offsetX = width / 2; offsetY = height;
  } else {
    offsetX = defaultPoint.x - livePosition.x;
    offsetY = defaultPoint.y - livePosition.y;
  }

  return {
    pos: {
      x: finiteCoordinate(livePosition.x + offsetX, defaultPoint.x),
      y: finiteCoordinate(livePosition.y + offsetY, defaultPoint.y),
    },
    nodeOrigin: livePosition,
  };
};

const applyPortPosition = (
  absolute: SmartEdgePoint,
  node: SmartEdgeNode,
  position: Position,
): SmartEdgePoint => {
  const origin = finitePoint(absolute, { x: 0, y: 0 });
  const width = finiteDimension(node.width, node.measured?.width);
  const height = finiteDimension(node.height, node.measured?.height);
  if (position === Position.Top) return { x: origin.x + width / 2, y: origin.y };
  if (position === Position.Bottom) return { x: origin.x + width / 2, y: origin.y + height };
  if (position === Position.Left) return { x: origin.x, y: origin.y + height / 2 };
  return { x: origin.x + width, y: origin.y + height / 2 };
};

export const buildSmartEdgeCenteredCoords = ({
  nodesDragging,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceNode,
  targetNode,
  sourceHandleId,
  targetHandleId,
  sourcePosition,
  targetPosition,
  simpleNodeMap,
  smartLayout,
  multiEdgeInfo,
  layoutDirection,
  respectSourceHandle,
  respectTargetHandle,
  getAbsolutePosition,
}: BuildSmartEdgeCenteredCoordsOptions): SmartEdgeCenteredCoords => {
  const sourceFallback = { x: finiteCoordinate(sourceX), y: finiteCoordinate(sourceY) };
  const targetFallback = { x: finiteCoordinate(targetX), y: finiteCoordinate(targetY) };
  if (nodesDragging) {
    return {
      sourceX: sourceFallback.x,
      sourceY: sourceFallback.y,
      targetX: targetFallback.x,
      targetY: targetFallback.y,
      effectiveIsOneToMany: false,
      effectiveIsManyToOne: false,
      sourceNodeOrigin: sourceFallback,
      targetNodeOrigin: targetFallback,
    };
  }

  const sourceData = calculateHandlePosition(sourceNode, sourceFallback, sourceHandleId, sourcePosition);
  const targetData = calculateHandlePosition(targetNode, targetFallback, targetHandleId, targetPosition);
  let finalSource = sourceData.pos;
  let finalTarget = targetData.pos;
  if (!respectSourceHandle && smartLayout) {
    finalSource = {
      x: finiteCoordinate(smartLayout.sourceX, finalSource.x),
      y: finiteCoordinate(smartLayout.sourceY, finalSource.y),
    };
  }
  if (!respectTargetHandle && smartLayout) {
    finalTarget = {
      x: finiteCoordinate(smartLayout.targetX, finalTarget.x),
      y: finiteCoordinate(smartLayout.targetY, finalTarget.y),
    };
  }

  const sourceNodeStatic = simpleNodeMap.get(source);
  const targetNodeStatic = simpleNodeMap.get(target);
  const convergence = getConvergencePositions(layoutDirection);
  let busTrunkSource: SmartEdgePoint | undefined;
  let busTrunkTarget: SmartEdgePoint | undefined;
  if (multiEdgeInfo.isOneToMany && multiEdgeInfo.enableBus && sourceNodeStatic && !respectSourceHandle) {
    finalSource = applyPortPosition(getAbsolutePosition(source), sourceNodeStatic, convergence.source);
    busTrunkSource = finalSource;
  }
  if (multiEdgeInfo.isManyToOne && multiEdgeInfo.enableBus && targetNodeStatic && !respectTargetHandle) {
    finalTarget = applyPortPosition(getAbsolutePosition(target), targetNodeStatic, convergence.target);
    busTrunkTarget = finalTarget;
  }

  return {
    sourceX: finalSource.x,
    sourceY: finalSource.y,
    targetX: finalTarget.x,
    targetY: finalTarget.y,
    busTrunkSource,
    busTrunkTarget,
    effectiveIsOneToMany: multiEdgeInfo.isOneToMany,
    effectiveIsManyToOne: multiEdgeInfo.isManyToOne,
    sourceNodeOrigin: sourceData.nodeOrigin,
    targetNodeOrigin: targetData.nodeOrigin,
  };
};

export const resolveSmartEdgeFallbackPositions = ({
  layoutDirection,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  targetHandleId,
  smartLayout,
  respectSourceHandle,
  respectTargetHandle,
}: ResolveFallbackPositionsOptions): { sourcePos: Position; targetPos: Position } => {
  const sourceHandlePosition = parseHandlePosition(sourceHandleId);
  const targetHandlePosition = parseHandlePosition(targetHandleId);
  const defaultPositions = getConvergencePositions(layoutDirection);
  return {
    sourcePos: (
      respectSourceHandle ? sourceHandlePosition ?? sourcePosition : smartLayout?.sourcePos
    ) ?? sourcePosition ?? defaultPositions.source,
    targetPos: (
      respectTargetHandle ? targetHandlePosition ?? targetPosition : smartLayout?.targetPos
    ) ?? targetPosition ?? defaultPositions.target,
  };
};
