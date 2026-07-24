import type { LineObstacle } from '../algorithms/pathfinding';
import type { PathFindingResult, Point, SharedGraphContext } from '../types/routing';
import type { LatestRoutingRequestEntry } from './edgeRoutingBatchLifecycle';
import type { KnownRoutingPathCandidate } from './edgeRoutingCoordinatorPostProcessing';
import {
  collectFixedRoutingPathContext,
  collectPendingRoutingLineObstacles,
} from './edgeRoutingCoordinatorPostProcessing';
import {
  buildRoutedLabelObstacle,
  getGraphEdgeLabelText,
  type RoutedLabelObstacle,
} from './edgeRoutingLabels';

export const MAX_STORED_ROUTING_POINTS = 10_000;

const copyFinitePoints = (points: unknown): Point[] | undefined => {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_STORED_ROUTING_POINTS) {
    return undefined;
  }
  const copied: Point[] = [];
  for (const point of points) {
    const candidate = point as Partial<Point> | null;
    if (
      !candidate
      || typeof candidate.x !== 'number'
      || !Number.isFinite(candidate.x)
      || typeof candidate.y !== 'number'
      || !Number.isFinite(candidate.y)
    ) {
      return undefined;
    }
    copied.push({ x: candidate.x, y: candidate.y });
  }
  return copied;
};

/** Stores validated routed paths and label obstacles used by later routing batches. */
export class EdgeRoutingResultContext {
  private latestPaths = new Map<string, { graphKey: string; points: Point[] }>();
  private labelObstacles = new Map<string, RoutedLabelObstacle>();

  public storePath(edgeId: string, result: PathFindingResult, graphKey: string): void {
    const points = result.error ? undefined : copyFinitePoints(result.points);
    if (!edgeId || !graphKey || !points) {
      this.latestPaths.delete(edgeId);
      return;
    }
    this.latestPaths.set(edgeId, { graphKey, points });
  }

  public deletePath(edgeId: string): void {
    this.latestPaths.delete(edgeId);
  }

  public clearPaths(): void {
    this.latestPaths.clear();
  }

  public updateLabelObstacle(
    edgeId: string,
    result: PathFindingResult,
    graph: SharedGraphContext,
  ): void {
    const obstacle = buildRoutedLabelObstacle(
      edgeId,
      getGraphEdgeLabelText(edgeId, graph),
      result,
    );
    if (obstacle) this.labelObstacles.set(edgeId, obstacle);
    else this.labelObstacles.delete(edgeId);
  }

  public getLabelObstacles(): readonly RoutedLabelObstacle[] {
    return [...this.labelObstacles.values()].map(obstacle => ({ ...obstacle }));
  }

  public clearLabelObstacles(): void {
    this.labelObstacles.clear();
  }

  public buildPathCandidates(
    latestRequests: ReadonlyMap<string, LatestRoutingRequestEntry>,
    getCachedResult: (entry: LatestRoutingRequestEntry) => PathFindingResult | null,
    isDirty: (edgeId: string) => boolean,
  ): KnownRoutingPathCandidate[] {
    return [...latestRequests.entries()].map(([edgeId, entry]) => {
      const cachedPoints = copyFinitePoints(getCachedResult(entry)?.points);
      const latest = this.latestPaths.get(edgeId);
      return {
        edgeId,
        graphKey: entry.graphKey,
        sourceId: entry.request.job?.source,
        targetId: entry.request.job?.target,
        dirty: isDirty(edgeId),
        cachedPoints,
        points: cachedPoints ?? (
          latest?.graphKey === entry.graphKey
            ? latest.points.map(point => ({ ...point }))
            : undefined
        ),
      };
    });
  }

  public collectPendingPathObstacles(
    latestRequests: ReadonlyMap<string, LatestRoutingRequestEntry>,
    getCachedResult: (entry: LatestRoutingRequestEntry) => PathFindingResult | null,
    isDirty: (edgeId: string) => boolean,
    graphKey: string,
    relatedNodeIds: ReadonlySet<string>,
    maxSegments: number,
  ): LineObstacle[] {
    return collectPendingRoutingLineObstacles(
      this.buildPathCandidates(latestRequests, getCachedResult, isDirty),
      graphKey,
      relatedNodeIds,
      maxSegments,
    );
  }

  public collectFixedPathContext(
    latestRequests: ReadonlyMap<string, LatestRoutingRequestEntry>,
    getCachedResult: (entry: LatestRoutingRequestEntry) => PathFindingResult | null,
    isDirty: (edgeId: string) => boolean,
    graphKey: string,
    activeResults: readonly PathFindingResult[],
    activeEdgeIds: ReadonlySet<string>,
    maxEdges = 80,
  ): Map<string, Point[]> {
    return collectFixedRoutingPathContext(
      this.buildPathCandidates(latestRequests, getCachedResult, isDirty),
      graphKey,
      activeResults,
      activeEdgeIds,
      maxEdges,
    );
  }
}
