import { analyzeGeometry } from '../../algorithms/geometry-classifier';
import type {
  PathFindingJob,
  PathFindingResult,
  Point,
  Rectangle,
} from '../../types/routing';
import { Position } from '../../types/routing';
import type { PostProcessContext } from '../postprocessing/PathPostProcessor';

interface WorkerPathDebugData {
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

interface BuildWorkerRoutingResultOptions {
  job: PathFindingJob;
  svgPath: string;
  finalPoints: Point[];
  rawPoints: Point[];
  strategyName: string;
  debugData: WorkerPathDebugData;
  routingObstacles: Rectangle[];
  sourceRect: Rectangle;
  targetRect: Rectangle;
  startPosition: Position;
  endPosition: Position;
  hasExplicitSource: boolean;
  hasExplicitTarget: boolean;
  hasPrecomputedTrunk: boolean;
  busPeerGroupSize: number;
  busPeerGroupKey: string | null;
  busPeerGroupMembers: string[] | null;
}

export interface WorkerPathPresentation {
  labelPosition: Point;
  bendCount: number;
  pathLength: number;
  efficiencyRatio: number;
}

interface BuildWorkerPostProcessContextOptions {
  job: PathFindingJob;
  config: PostProcessContext['config'];
  obstacles: Rectangle[];
  sourceRect: Rectangle;
  targetRect: Rectangle;
  startPosition: Position;
  endPosition: Position;
  strategyName: string;
  hasSharedTrunk: boolean;
}

export const buildWorkerPostProcessContext = ({
  job,
  config,
  obstacles,
  sourceRect,
  targetRect,
  startPosition,
  endPosition,
  strategyName,
  hasSharedTrunk,
}: BuildWorkerPostProcessContextOptions): PostProcessContext => ({
  config,
  obstacles,
  startPos: startPosition,
  endPos: endPosition,
  extraObstacles: [sourceRect, targetRect],
  metadata: {
    isOneToMany: !!job.isOneToMany,
    isManyToOne: !!job.isManyToOne,
    outgoingIndex: job.outgoingIndex || 0,
    outgoingCount: job.outgoingCount || 1,
    incomingIndex: job.incomingIndex || 0,
    incomingCount: job.incomingCount || 1,
    globalChannelIndex: job.globalChannelIndex,
    globalChannelCount: job.globalChannelCount,
    globalChannelType: job.globalChannelType,
    bidirectionalChannel: job.bidirectionalChannel,
    bidirectionalSpacing: job.bidirectionalSpacing,
    bidirectionalCount: job.bidirectionalCount,
    strategy: strategyName,
    peerGroupSize: job.busRoutingPlan?.peerGroupSize ?? job.peerGroupSize,
    hasSharedTrunk,
  },
});

const segmentLength = (first: Point, second: Point): number => Math.hypot(
  second.x - first.x,
  second.y - first.y,
);

export const calculateWorkerPathPresentation = (
  points: Point[],
): WorkerPathPresentation => {
  if (points.length < 2) {
    return {
      labelPosition: { x: 0, y: 0 },
      bendCount: 0,
      pathLength: 0,
      efficiencyRatio: 1,
    };
  }

  let longestLength = -1;
  let longestStart = points[0];
  let longestEnd = points[1];
  let bendCount = 0;
  let pathLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const currentLength = segmentLength(previous, current);
    pathLength += currentLength;
    if (currentLength > longestLength) {
      longestLength = currentLength;
      longestStart = previous;
      longestEnd = current;
    }

    if (index >= 2) {
      const beforePrevious = points[index - 2];
      const previousDeltaX = previous.x - beforePrevious.x;
      const previousDeltaY = previous.y - beforePrevious.y;
      const currentDeltaX = current.x - previous.x;
      const currentDeltaY = current.y - previous.y;
      if (Math.abs(
        previousDeltaX * currentDeltaY - previousDeltaY * currentDeltaX,
      ) > 0.5) {
        bendCount += 1;
      }
    }
  }

  const straightDistance = segmentLength(points[0], points[points.length - 1]);
  const rawEfficiency = pathLength > 0
    ? Math.min(1, straightDistance / pathLength)
    : 1;

  return {
    labelPosition: {
      x: (longestStart.x + longestEnd.x) / 2,
      y: (longestStart.y + longestEnd.y) / 2,
    },
    bendCount,
    pathLength: Math.round(pathLength),
    efficiencyRatio: Math.round(rawEfficiency * 100) / 100,
  };
};

export const buildWorkerRoutingResult = ({
  job,
  svgPath,
  finalPoints,
  rawPoints,
  strategyName,
  debugData,
  routingObstacles,
  sourceRect,
  targetRect,
  startPosition,
  endPosition,
  hasExplicitSource,
  hasExplicitTarget,
  hasPrecomputedTrunk,
  busPeerGroupSize,
  busPeerGroupKey,
  busPeerGroupMembers,
}: BuildWorkerRoutingResultOptions): PathFindingResult => {
  const presentation = calculateWorkerPathPresentation(finalPoints);
  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };
  const targetCenter = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };
  const centerDeltaX = targetCenter.x - sourceCenter.x;
  const centerDeltaY = targetCenter.y - sourceCenter.y;
  const detectedGeometry = analyzeGeometry(centerDeltaX, centerDeltaY, {
    sourceSize: { width: sourceRect.width, height: sourceRect.height },
    targetSize: { width: targetRect.width, height: targetRect.height },
  });
  const trunkIsVertical = hasPrecomputedTrunk
    && job.busTrunkSource
    && job.busTrunkTarget
    ? Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1
    : null;
  const trunkAxis = trunkIsVertical === null
    ? null
    : (trunkIsVertical ? job.busTrunkSource!.x : job.busTrunkSource!.y);

  return {
    jobId: job.jobId,
    edgeId: job.edgeId,
    path: svgPath,
    points: finalPoints,
    labelX: presentation.labelPosition.x,
    labelY: presentation.labelPosition.y,
    sourcePos: startPosition,
    targetPos: endPosition,
    usedSourcePos: startPosition,
    usedTargetPos: endPosition,
    effectiveIsManyToOne: job.effectiveIsManyToOne,
    busTrunkSource: job.busTrunkSource,
    busTrunkTarget: job.busTrunkTarget,
    metadata: {
      strategy: strategyName,
      bendCount: presentation.bendCount,
      pathLength: presentation.pathLength,
      efficiencyRatio: presentation.efficiencyRatio,
    },
    debugInfo: {
      algorithmDebug: {
        strategy: strategyName,
        rawPoints,
        visited: debugData.visited,
        grid: debugData.grid,
        obstacles: routingObstacles,
        sourceRect,
        targetRect,
        portSelection: {
          selected: { source: startPosition, target: endPosition },
          layoutDirection: job.layoutDirection,
          detectedGeometry,
          hasExplicitSource,
          hasExplicitTarget,
          isManyToOne: !!job.isManyToOne,
          incomingCount: typeof job.incomingCount === 'number'
            ? job.incomingCount
            : (job.isManyToOne ? 1 : 0),
          hasPrecomputedTrunk,
          peerGroupSize: busPeerGroupSize,
          peerGroupKey: busPeerGroupKey,
          peerGroupMembers: busPeerGroupMembers,
          trunkAxis,
          trunkVertical: trunkIsVertical,
          sourceHandle: job.sourceHandle,
          targetHandle: job.targetHandle,
          centers: {
            source: sourceCenter,
            target: targetCenter,
            dx: centerDeltaX,
            dy: centerDeltaY,
          },
        },
      },
      obstacles: routingObstacles,
      selectedSourcePos: startPosition,
      selectedTargetPos: endPosition,
    },
  };
};
