import { globalChannelRouting } from '../algorithms/globalChannelRouting';
import { repairEdgeCrossingViolations } from '../algorithms/edgeCrossingRepair';
import { repairHardObstacleViolations } from '../algorithms/hardObstaclePathRepair';
import type { Rectangle } from '../algorithms/pathfinding';
import { refineManyToOneFanIn } from '../algorithms/manyToOneFanIn';
import { refineOrthogonalWaypointsDetailed } from '../algorithms/orthogonalWaypointRefiner';
import type {
  PathFindingJob,
  PathFindingResult,
  Point,
  SharedGraphContext,
} from '../types/routing';
import {
  applyRefinedPathsToResults,
  attachWaypointRefinementDebug,
  buildFanInIgnoredRectangles,
  buildManyToOneFanInGroups,
  buildRoutingBuddyGroups,
  type FanInRoutingRequest,
} from './edgeRoutingCoordinatorPostProcessing';

interface GlobalPostProcessingOperations {
  channelRouting: typeof globalChannelRouting;
  refineWaypoints: typeof refineOrthogonalWaypointsDetailed;
  refineFanIn: typeof refineManyToOneFanIn;
  repairHardObstacles: typeof repairHardObstacleViolations;
  repairCrossings: typeof repairEdgeCrossingViolations;
  applyPaths: typeof applyRefinedPathsToResults;
}

interface ApplyGlobalPostProcessingOptions {
  results: Array<PathFindingResult | null>;
  requests: readonly FanInRoutingRequest[];
  graphEdges: readonly { target?: string }[];
  config: SharedGraphContext['config'];
  assignedJobs?: PathFindingJob[];
  fixedContextPaths?: ReadonlyMap<string, readonly Point[]>;
  hardObstacles: Rectangle[];
  softObstacles: Rectangle[];
  candidateAxes: { horizontal: number[]; vertical: number[] };
  onFailure?: (error: unknown) => void;
  operations?: Partial<GlobalPostProcessingOperations>;
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const axisOf = (left: Point, right: Point): 'h' | 'v' | undefined => {
  if (Math.abs(left.y - right.y) < 1.5 && Math.abs(left.x - right.x) > 1.5) {
    return 'h';
  }
  if (Math.abs(left.x - right.x) < 1.5 && Math.abs(left.y - right.y) > 1.5) {
    return 'v';
  }
  return undefined;
};

const collapseCollinear = (points: Point[]): Point[] => {
  if (points.length < 3) return points;
  const collapsed: Point[] = [{ ...points[0] }];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = collapsed[collapsed.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const horizontal = Math.abs(previous.y - current.y) < 1
      && Math.abs(current.y - next.y) < 1;
    const vertical = Math.abs(previous.x - current.x) < 1
      && Math.abs(current.x - next.x) < 1;
    if (!horizontal && !vertical) collapsed.push({ ...current });
  }
  collapsed.push({ ...points[points.length - 1] });
  return collapsed;
};

export const cleanRoutingPath = (rawPoints: readonly Point[]): Point[] => {
  const rounded = rawPoints
    .filter(point => finiteNumber(point?.x) && finiteNumber(point?.y))
    .map(point => ({ x: Math.round(point.x), y: Math.round(point.y) }));
  if (rounded.length < 2) return rounded;

  const orthogonal: Point[] = [{ ...rounded[0] }];
  for (let index = 1; index < rounded.length; index++) {
    const previous = orthogonal[orthogonal.length - 1];
    const current = rounded[index];
    if (
      Math.abs(previous.x - current.x) > 1.5
      && Math.abs(previous.y - current.y) > 1.5
    ) {
      const next = rounded[index + 1];
      const horizontalThenVertical = { x: current.x, y: previous.y };
      const verticalThenHorizontal = { x: previous.x, y: current.y };
      const horizontalScore = next
        && axisOf(horizontalThenVertical, current) !== axisOf(current, next)
        ? 1
        : 0;
      const verticalScore = next
        && axisOf(verticalThenHorizontal, current) !== axisOf(current, next)
        ? 1
        : 0;
      orthogonal.push(
        horizontalScore <= verticalScore
          ? horizontalThenVertical
          : verticalThenHorizontal,
      );
    }
    orthogonal.push({ ...current });
  }

  let cleaned = collapseCollinear(orthogonal);
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 1; index < cleaned.length - 1; index++) {
      const previous = cleaned[index - 1];
      const current = cleaned[index];
      const next = cleaned[index + 1];
      const previousDistance = Math.abs(previous.x - current.x)
        + Math.abs(previous.y - current.y);
      const nextDistance = Math.abs(current.x - next.x)
        + Math.abs(current.y - next.y);
      if ((previousDistance < 8 || nextDistance < 8) && axisOf(previous, next)) {
        cleaned = [...cleaned.slice(0, index), ...cleaned.slice(index + 1)];
        changed = true;
        break;
      }
    }
  }
  return collapseCollinear(cleaned);
};

export const applyGlobalRoutingPostProcessing = ({
  results,
  requests,
  graphEdges,
  config,
  assignedJobs,
  fixedContextPaths = new Map(),
  hardObstacles,
  softObstacles,
  candidateAxes,
  onFailure,
  operations: operationOverrides,
}: ApplyGlobalPostProcessingOptions): void => {
  const validResults = results.filter((result): result is PathFindingResult =>
    !!result
    && !(result as PathFindingResult & { error?: unknown }).error
    && Array.isArray(result.points)
    && result.points.length > 0,
  );
  if (validResults.length === 0) return;

  const operations: GlobalPostProcessingOperations = {
    channelRouting: globalChannelRouting,
    refineWaypoints: refineOrthogonalWaypointsDetailed,
    refineFanIn: refineManyToOneFanIn,
    repairHardObstacles: repairHardObstacleViolations,
    repairCrossings: repairEdgeCrossingViolations,
    applyPaths: applyRefinedPathsToResults,
    ...operationOverrides,
  };
  const edgePaths = new Map<string, Point[]>();
  for (const [edgeId, points] of fixedContextPaths) {
    edgePaths.set(edgeId, cleanRoutingPath(points));
  }
  for (const result of validResults) {
    edgePaths.set(result.edgeId, cleanRoutingPath(result.points));
  }
  const fixedEdgeIds = new Set(fixedContextPaths.keys());
  const buddyGroups = buildRoutingBuddyGroups(requests, assignedJobs);

  try {
    const configuredSpacing = config?.postProcessing?.nudgeSpacing;
    const spacing = finiteNumber(configuredSpacing) && configuredSpacing > 0
      ? configuredSpacing
      : 12;
    const nudgedPaths = operations.channelRouting(
      edgePaths,
      spacing,
      buddyGroups,
      fixedEdgeIds,
    );
    const currentBatchEdgeIds = new Set(
      requests
        .map(request => String(request.edgeId ?? '').trim())
        .filter(Boolean),
    );
    const postProcessing = config?.postProcessing;
    const refinementResult = postProcessing?.enableWaypointRefinement !== false
      ? operations.refineWaypoints(nudgedPaths, {
          buddyGroups,
          fixedEdgeIds,
          hardObstacles,
          softObstacles,
          spacing,
          maxPasses: postProcessing?.waypointRefinementPasses,
          maxEdgesPerPass: postProcessing?.maxWaypointRefineEdgesPerPass,
          enableReroute: postProcessing?.enableWaypointReroute,
          maxRerouteEdges: postProcessing?.maxWaypointRerouteEdges,
          scoring: {
            hardCrossingWeight: postProcessing?.waypointHardCrossingWeight,
            softObstacleWeight: postProcessing?.waypointSoftObstacleWeight,
            softNearMissWeight: postProcessing?.waypointSoftNearMissWeight,
            softNearMissPadding: postProcessing?.waypointSoftNearMissPadding,
            turnbackWeight: postProcessing?.waypointTurnbackWeight,
            bendWeight: postProcessing?.waypointBendWeight,
          },
          candidateAxes,
        })
      : undefined;
    let refinedPaths = refinementResult?.paths ?? nudgedPaths;
    if (refinementResult) {
      attachWaypointRefinementDebug(validResults, refinementResult.summary);
    }

    const ignoredRectsByEdge = buildFanInIgnoredRectangles(requests, assignedJobs);
    const repairOptions = {
      spacing,
      obstacles: hardObstacles,
      ignoredRectsByEdge,
      buddyGroups,
    };
    const crossingOptions = {
      ...repairOptions,
      mutableEdgeIds: currentBatchEdgeIds,
    };
    const minimumClearance = Math.max(18, spacing * 1.5);
    refinedPaths = operations.refineFanIn(
      refinedPaths,
      buildManyToOneFanInGroups(requests, graphEdges, assignedJobs),
      {
        spacing,
        obstacles: hardObstacles,
        ignoredRectsByEdge,
      },
    );
    refinedPaths = operations.repairHardObstacles(refinedPaths, repairOptions);
    refinedPaths = operations.repairCrossings(refinedPaths, {
      ...crossingOptions,
      allowObstacleHitIfImprovesCrossing: true,
    });
    for (let pass = 0; pass < 3; pass++) {
      refinedPaths = operations.repairHardObstacles(refinedPaths, {
        ...repairOptions,
        minClearance: minimumClearance,
      });
      if (pass < 2) {
        refinedPaths = operations.repairCrossings(refinedPaths, crossingOptions);
      }
    }

    const configuredRadius = (config as { borderRadius?: unknown })?.borderRadius;
    operations.applyPaths(
      validResults,
      refinedPaths,
      finiteNumber(configuredRadius) ? configuredRadius : 8,
    );
  } catch (error) {
    onFailure?.(error);
  }
};
