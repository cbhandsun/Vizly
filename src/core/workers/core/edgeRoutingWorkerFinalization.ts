import type {
  PathFindingJob,
  PathFindingResult,
  PathfindingContext,
  Point,
} from '../../types/routing';
import type { LineObstacle } from '../../algorithms/pathfinding';
import type { ResolvedWorkerRoutingContext } from './edgeRoutingWorkerContext';
import type { WorkerEndpointResolution } from './edgeRoutingWorkerEndpointResolution';
import type { WorkerRoutingModules } from './edgeRoutingWorkerModules';
import { buildWorkerReverseBypassPath } from './edgeRoutingWorkerPathSafety';
import { routeWorkerFallback } from './edgeRoutingWorkerFallback';
import {
  buildWorkerPostProcessContext,
  buildWorkerRoutingResult,
} from './edgeRoutingWorkerResult';

export interface WorkerRouteDebugData {
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

export const createWorkerRoutingErrorResult = (
  job: PathFindingJob,
  message: string,
): PathFindingResult => ({
  jobId: job.jobId,
  edgeId: job.edgeId,
  path: '',
  points: [],
  labelX: 0,
  labelY: 0,
  error: message,
});

export const finalizeWorkerRoute = ({
  context,
  resolved,
  endpoints,
  modules,
  initialPoints,
  initialStrategyName,
  finalStartPosition,
  finalEndPosition,
  debugData,
  shouldCollectDebugData,
  hasPrecomputedTrunk,
  isSharedGlobalTrunk,
}: {
  context: PathfindingContext;
  resolved: ResolvedWorkerRoutingContext;
  endpoints: WorkerEndpointResolution;
  modules: Pick<
    WorkerRoutingModules,
    'analyzer' | 'astar' | 'gridBuilder' | 'postProcessor' | 'vgRouter'
  >;
  initialPoints: Point[] | null;
  initialStrategyName: string;
  finalStartPosition: WorkerEndpointResolution['startPosition'];
  finalEndPosition: WorkerEndpointResolution['endPosition'];
  debugData: WorkerRouteDebugData;
  shouldCollectDebugData: boolean;
  hasPrecomputedTrunk: boolean;
  isSharedGlobalTrunk: boolean;
}): PathFindingResult => {
  const { job, graph, config, runtime = {} } = context;
  const {
    sourceRect,
    targetRect,
    routingObstacles,
    allObstacles,
    spatialIndex,
    clearanceRects,
    containerBorders,
  } = resolved;
  const {
    startPoint,
    startOffset,
    endOffset,
    endPoint,
  } = endpoints;
  const startPosition = finalStartPosition;
  const endPosition = finalEndPosition;
  const { analyzer, astar, gridBuilder, postProcessor, vgRouter } = modules;
  let pathPoints = initialPoints;
  let strategyName = initialStrategyName;

  if (!pathPoints && endpoints.isReverseBypassActive && endpoints.reverseBypassSide !== null) {
    pathPoints = buildWorkerReverseBypassPath({
      layoutDirection: job.layoutDirection,
      bypassSide: endpoints.reverseBypassSide,
      sourceRect,
      targetRect,
      obstacles: routingObstacles,
      startPoint,
      startOffset,
      endOffset,
      endPoint,
      analyzer,
    });
    if (pathPoints) strategyName = 'Reverse U-Turn';
  }

  if (!pathPoints) {
    const fallback = routeWorkerFallback({
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
      lineObstacles: (graph.pendingEdges ?? []) as LineObstacle[],
      prebuiltGrid: runtime.prebuiltGrid,
      congestionGrid: runtime.congestionGrid,
      shouldCollectDebugData,
      debugData,
      gridBuilder,
      astar,
      visibilityGraphRouter: vgRouter,
      analyzer,
    });
    pathPoints = fallback.points;
    strategyName = fallback.strategyName;
  }

  if (!pathPoints?.length) {
    return createWorkerRoutingErrorResult(job, 'Pathfinding failed to generate any path');
  }
  const postContext = buildWorkerPostProcessContext({
    job,
    config,
    obstacles: routingObstacles,
    sourceRect,
    targetRect,
    startPosition,
    endPosition,
    strategyName,
    hasSharedTrunk: isSharedGlobalTrunk,
  });
  const { points: finalPoints, svgPath } = postProcessor.process(pathPoints, postContext);
  return buildWorkerRoutingResult({
    job,
    svgPath,
    finalPoints,
    rawPoints: pathPoints,
    strategyName,
    debugData,
    routingObstacles,
    sourceRect,
    targetRect,
    startPosition,
    endPosition,
    hasExplicitSource: endpoints.hasExplicitSource,
    hasExplicitTarget: endpoints.hasExplicitTarget,
    hasPrecomputedTrunk,
    busPeerGroupSize: endpoints.busPeerGroupSize,
    busPeerGroupKey: endpoints.busPeerGroupKey,
    busPeerGroupMembers: endpoints.busPeerGroupMembers,
  });
};
