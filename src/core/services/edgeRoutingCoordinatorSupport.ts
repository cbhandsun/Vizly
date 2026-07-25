import type { PathFindingResult } from '../types/routing';
import { retainRenderedPathCacheEdges } from '../routing/renderedPathCache';
import { PathfindingWorkerPool } from '../workers/PathfindingWorkerPool';
import {
  logEdgeRoutingCoordinatorDebugToolsReady,
  logEdgeRoutingCoordinatorParallelPoolInitFailure,
} from '../utils/routingLogging';
import { buildEdgeRoutingFailureFallback } from './edgeRoutingFailureFallback';
import type { EdgeRoutingCoordinator, RoutingRequest } from './EdgeRoutingCoordinator';

export type LatestRoutingRequest = {
  request: RoutingRequest;
  graphKey: string;
  seq: number;
  updatedAt: number;
};

export type PendingRoutingResolver = {
  resolve: (value: PathFindingResult | PromiseLike<PathFindingResult>) => void;
  seq: number;
};

type RoutingDebugWindow = Window & {
  __vizly_coordinator__?: EdgeRoutingCoordinator;
  __vizly_routing__?: {
    clearCache: () => void;
    coordinator: () => EdgeRoutingCoordinator;
  };
};

export const finiteMetadataNumber = (
  metadata: PathFindingResult['metadata'],
  key: string,
): number | undefined => {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const createParallelRoutingPool = (): PathfindingWorkerPool | null => {
  try {
    return new PathfindingWorkerPool();
  } catch (error) {
    logEdgeRoutingCoordinatorParallelPoolInitFailure(error);
    return null;
  }
};

export const pruneInactiveRoutingEdges = ({
  activeEdgeIds,
  latestRequests,
  pendingResolvers,
  deleteCachedEdge,
  deleteResultEdge,
}: {
  activeEdgeIds: ReadonlySet<string>;
  latestRequests: Map<string, LatestRoutingRequest>;
  pendingResolvers: Map<string, PendingRoutingResolver>;
  deleteCachedEdge: (edgeId: string) => void;
  deleteResultEdge: (edgeId: string) => void;
}): void => {
  for (const [edgeId, entry] of latestRequests) {
    if (activeEdgeIds.has(edgeId)) continue;
    latestRequests.delete(edgeId);
    pendingResolvers.get(edgeId)?.resolve(buildEdgeRoutingFailureFallback(edgeId, entry.request.job));
    pendingResolvers.delete(edgeId);
    deleteCachedEdge(edgeId);
    deleteResultEdge(edgeId);
  }
  retainRenderedPathCacheEdges(activeEdgeIds);
};

export const settlePendingRoutingRequests = (
  latestRequests: ReadonlyMap<string, LatestRoutingRequest>,
  pendingResolvers: Map<string, PendingRoutingResolver>,
): void => {
  for (const [edgeId, pending] of pendingResolvers) {
    pending.resolve(buildEdgeRoutingFailureFallback(edgeId, latestRequests.get(edgeId)?.request.job));
  }
  pendingResolvers.clear();
};

export const exposeRoutingCoordinatorInstance = (coordinator: EdgeRoutingCoordinator): void => {
  if (typeof window !== 'undefined') {
    (window as RoutingDebugWindow).__vizly_coordinator__ = coordinator;
  }
};

export const installEdgeRoutingDebugTools = (
  getCoordinator: () => EdgeRoutingCoordinator,
): void => {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return;
  (window as RoutingDebugWindow).__vizly_routing__ = {
    clearCache: () => getCoordinator().clearAllCaches(),
    coordinator: getCoordinator,
  };
  logEdgeRoutingCoordinatorDebugToolsReady();
};
