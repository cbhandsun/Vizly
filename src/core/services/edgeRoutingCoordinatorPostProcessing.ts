import type {
  PathFindingJob,
  PathFindingResult,
  Point,
} from '../types/routing';
import type { LineObstacle, Rectangle } from '../algorithms/pathfinding';
import type { ManyToOneFanInGroup } from '../algorithms/manyToOneFanIn';
import type { WaypointRefinementSummary } from '../algorithms/orthogonalWaypointRefiner';
import type { BuddyGroup } from '../algorithms/globalChannelRouting';
import { createFilletedPath } from '../algorithms/smartEdgeUtils';

export interface FanInRoutingRequest {
  edgeId: string;
  job: Partial<PathFindingJob> & {
    target: string;
    sourceRect?: Rectangle;
    targetRect?: Rectangle;
  };
}

export interface KnownRoutingPathCandidate {
  edgeId: string;
  graphKey: string;
  sourceId?: string;
  targetId?: string;
  dirty: boolean;
  cachedPoints?: readonly Point[];
  points?: readonly Point[];
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const endpointKey = (value: unknown): string => String(value ?? '').trim();

const validPoint = (point: Point | undefined): point is Point =>
  !!point && finiteNumber(point.x) && finiteNumber(point.y);

const validRectangle = (rectangle: Rectangle | undefined): rectangle is Rectangle =>
  !!rectangle
  && finiteNumber(rectangle.x)
  && finiteNumber(rectangle.y)
  && finiteNumber(rectangle.width)
  && finiteNumber(rectangle.height)
  && rectangle.width >= 0
  && rectangle.height >= 0;

/**
 * Deduplicates diagonal obstacles and merges nearly collinear axis-aligned
 * segments, returning at most the requested number of finite segments.
 */
export const compactEdgeRoutingLineObstacles = (
  lines: readonly LineObstacle[],
  rawMaxSegments: number,
): LineObstacle[] => {
  const maxSegments = Math.max(
    0,
    Number.isFinite(rawMaxSegments) ? Math.floor(rawMaxSegments) : 0,
  );
  if (maxSegments === 0) return [];
  const finiteLines = lines.filter(line =>
    validPoint(line?.start) && validPoint(line?.end));
  if (finiteLines.length <= 1) return finiteLines.slice(0, maxSegments);

  const axisTolerance = 1.5;
  const mergeGap = 2;
  const axisGroups = new Map<string, {
    isHorizontal: boolean;
    fixed: number;
    ranges: Array<{ min: number; max: number }>;
  }>();
  const diagonalMap = new Map<string, LineObstacle>();
  const rounded = (value: number, quantum = 2): number =>
    Math.round(value / quantum) * quantum;

  for (const line of finiteLines) {
    const isHorizontal = Math.abs(line.start.y - line.end.y) < axisTolerance;
    const isVertical = Math.abs(line.start.x - line.end.x) < axisTolerance;
    if (isHorizontal || isVertical) {
      const fixed = rounded(isHorizontal
        ? (line.start.y + line.end.y) / 2
        : (line.start.x + line.end.x) / 2);
      const minimum = isHorizontal
        ? Math.min(line.start.x, line.end.x)
        : Math.min(line.start.y, line.end.y);
      const maximum = isHorizontal
        ? Math.max(line.start.x, line.end.x)
        : Math.max(line.start.y, line.end.y);
      if (maximum - minimum < 1) continue;
      const key = `${isHorizontal ? 'h' : 'v'}:${fixed}`;
      const group = axisGroups.get(key);
      if (group) group.ranges.push({ min: minimum, max: maximum });
      else {
        axisGroups.set(key, {
          isHorizontal,
          fixed,
          ranges: [{ min: minimum, max: maximum }],
        });
      }
      continue;
    }

    const first = `${rounded(line.start.x)},${rounded(line.start.y)}`;
    const second = `${rounded(line.end.x)},${rounded(line.end.y)}`;
    const key = first < second
      ? `${first}:${second}`
      : `${second}:${first}`;
    diagonalMap.set(key, {
      start: { x: line.start.x, y: line.start.y },
      end: { x: line.end.x, y: line.end.y },
    });
  }

  const compacted: LineObstacle[] = [];
  for (const group of axisGroups.values()) {
    group.ranges.sort((left, right) =>
      left.min - right.min || left.max - right.max);
    let current: { min: number; max: number } | undefined;
    const flush = (): void => {
      if (!current) return;
      compacted.push(group.isHorizontal
        ? {
          start: { x: current.min, y: group.fixed },
          end: { x: current.max, y: group.fixed },
        }
        : {
          start: { x: group.fixed, y: current.min },
          end: { x: group.fixed, y: current.max },
        });
    };
    for (const range of group.ranges) {
      if (!current) current = { ...range };
      else if (range.min <= current.max + mergeGap) {
        current.max = Math.max(current.max, range.max);
      } else {
        flush();
        current = { ...range };
      }
    }
    flush();
  }
  compacted.push(...diagonalMap.values());
  return compacted.slice(0, maxSegments);
};

const finitePoints = (points: readonly Point[] | undefined): Point[] =>
  (points ?? [])
    .filter(validPoint)
    .map(point => ({ x: point.x, y: point.y }));

export const collectPendingRoutingLineObstacles = (
  candidates: readonly KnownRoutingPathCandidate[],
  graphKey: string,
  relatedNodeIds: ReadonlySet<string>,
  maxSegments: number,
): LineObstacle[] => {
  const relatedCachedPoints = candidates
    .filter(candidate =>
      relatedNodeIds.has(candidate.sourceId ?? '')
      || relatedNodeIds.has(candidate.targetId ?? ''))
    .flatMap(candidate => finitePoints(candidate.cachedPoints));
  const spatialMargin = 300;
  const bounds = relatedCachedPoints.length
    ? {
      minX: Math.min(...relatedCachedPoints.map(point => point.x)) - spatialMargin,
      minY: Math.min(...relatedCachedPoints.map(point => point.y)) - spatialMargin,
      maxX: Math.max(...relatedCachedPoints.map(point => point.x)) + spatialMargin,
      maxY: Math.max(...relatedCachedPoints.map(point => point.y)) + spatialMargin,
    }
    : undefined;
  const rawLimit = Math.max(
    0,
    Number.isFinite(maxSegments) ? Math.floor(maxSegments) * 4 : 0,
  );
  if (rawLimit === 0) return [];
  const lines: LineObstacle[] = [];

  for (const candidate of candidates) {
    if (candidate.dirty || candidate.graphKey !== graphKey) continue;
    const points = finitePoints(candidate.points);
    if (points.length < 2) continue;
    if (bounds) {
      if (!points.some(point =>
        point.x >= bounds.minX
        && point.x <= bounds.maxX
        && point.y >= bounds.minY
        && point.y <= bounds.maxY)) {
        continue;
      }
    } else if (
      relatedNodeIds.size > 0
      && !relatedNodeIds.has(candidate.sourceId ?? '')
      && !relatedNodeIds.has(candidate.targetId ?? '')
    ) {
      continue;
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      lines.push({ start: points[index], end: points[index + 1] });
      if (lines.length >= rawLimit) {
        return compactEdgeRoutingLineObstacles(lines, maxSegments);
      }
    }
  }
  return compactEdgeRoutingLineObstacles(lines, maxSegments);
};

export const collectFixedRoutingPathContext = (
  candidates: readonly KnownRoutingPathCandidate[],
  graphKey: string,
  activeResults: readonly PathFindingResult[],
  activeEdgeIds: ReadonlySet<string>,
  rawMaxEdges = 80,
): Map<string, Point[]> => {
  const fixedPaths = new Map<string, Point[]>();
  const activePoints = activeResults.flatMap(result => finitePoints(result.points));
  const maxEdges = Math.max(
    0,
    Number.isFinite(rawMaxEdges) ? Math.floor(rawMaxEdges) : 0,
  );
  if (!activePoints.length || maxEdges === 0) return fixedPaths;
  const spatialMargin = 360;
  const bounds = {
    minX: Math.min(...activePoints.map(point => point.x)) - spatialMargin,
    minY: Math.min(...activePoints.map(point => point.y)) - spatialMargin,
    maxX: Math.max(...activePoints.map(point => point.x)) + spatialMargin,
    maxY: Math.max(...activePoints.map(point => point.y)) + spatialMargin,
  };

  for (const candidate of candidates) {
    if (fixedPaths.size >= maxEdges) break;
    if (
      candidate.dirty
      || activeEdgeIds.has(candidate.edgeId)
      || candidate.graphKey !== graphKey
    ) {
      continue;
    }
    const points = finitePoints(candidate.points);
    if (points.length < 2) continue;
    const overlapsBounds = points.some((point, index) => {
      const next = points[index + 1];
      if (!next) return false;
      const minimumX = Math.min(point.x, next.x);
      const maximumX = Math.max(point.x, next.x);
      const minimumY = Math.min(point.y, next.y);
      const maximumY = Math.max(point.y, next.y);
      return maximumX >= bounds.minX
        && minimumX <= bounds.maxX
        && maximumY >= bounds.minY
        && minimumY <= bounds.maxY;
    });
    if (overlapsBounds) fixedPaths.set(candidate.edgeId, points);
  }
  return fixedPaths;
};

export const buildManyToOneFanInGroups = (
  requests: readonly FanInRoutingRequest[],
  graphEdges: readonly { target?: string }[],
  assignedJobs?: readonly PathFindingJob[],
): ManyToOneFanInGroup[] => {
  const requestCountByTarget = new Map<string, number>();
  for (const request of requests) {
    const target = String(request.job.target ?? '').trim();
    if (target) {
      requestCountByTarget.set(
        target,
        (requestCountByTarget.get(target) ?? 0) + 1,
      );
    }
  }
  const graphIncomingCountByTarget = new Map<string, number>();
  for (const edge of graphEdges) {
    const target = String(edge.target ?? '').trim();
    if (target) {
      graphIncomingCountByTarget.set(
        target,
        (graphIncomingCountByTarget.get(target) ?? 0) + 1,
      );
    }
  }
  const edgeIdsByTarget = new Map<string, Set<string>>();
  requests.forEach((request, index) => {
    const job = assignedJobs?.[index] ?? request.job;
    const target = String(job.target ?? request.job.target ?? '').trim();
    const edgeId = String(request.edgeId ?? '').trim();
    if (!target || !edgeId) return;
    const isManyToOne = job.isManyToOne === true
      || (requestCountByTarget.get(target) ?? 0) > 1
      || (graphIncomingCountByTarget.get(target) ?? 0) > 1;
    if (!isManyToOne) return;
    const edgeIds = edgeIdsByTarget.get(target) ?? new Set<string>();
    edgeIds.add(edgeId);
    edgeIdsByTarget.set(target, edgeIds);
  });
  return [...edgeIdsByTarget.entries()]
    .map(([targetId, edgeIds]) => ({ targetId, edgeIds: [...edgeIds] }))
    .filter(group => group.edgeIds.length >= 2);
};

export const buildFanInIgnoredRectangles = (
  requests: readonly FanInRoutingRequest[],
  assignedJobs?: readonly PathFindingJob[],
): Map<string, Rectangle[]> => {
  const ignored = new Map<string, Rectangle[]>();
  requests.forEach((request, index) => {
    const edgeId = String(request.edgeId ?? '').trim();
    if (!edgeId) return;
    const job = assignedJobs?.[index] ?? request.job;
    const rectangles = [job.sourceRect, job.targetRect].filter(validRectangle);
    if (rectangles.length) ignored.set(edgeId, rectangles.map(rect => ({ ...rect })));
  });
  return ignored;
};

export const attachWaypointRefinementDebug = (
  results: PathFindingResult[],
  summary: WaypointRefinementSummary,
): void => {
  const changedEdgeIds = new Set(
    (summary.changedEdgeIds ?? []).filter(id => typeof id === 'string'),
  );
  for (const result of results) {
    result.debugInfo = {
      ...(result.debugInfo ?? {}),
      algorithmDebug: {
        ...((result.debugInfo as Record<string, unknown> | undefined)
          ?.algorithmDebug as Record<string, unknown> | undefined),
        waypointRefinement: {
          ...summary,
          changed: changedEdgeIds.has(result.edgeId),
        },
      },
    };
  }
};

type BuddyAssignableJob = Partial<PathFindingJob> & {
  o2mPeerGroupKey?: string;
  m2oPeerGroupKey?: string;
};

export const buildRoutingBuddyGroups = (
  requests: readonly FanInRoutingRequest[],
  assignedJobs?: readonly PathFindingJob[],
): BuddyGroup[] => {
  const groups = new Map<string, BuddyGroup>();
  requests.forEach((request, index) => {
    const job = (assignedJobs?.[index] ?? request.job) as BuddyAssignableJob;
    const plan = job.busRoutingPlan;
    const edgeId = String(request.edgeId ?? '').trim();
    if (!edgeId) return;
    if (job.isOneToMany) {
      const key = String(
        plan?.o2mPeerGroupKey
          ?? job.o2mPeerGroupKey
          ?? `o2m:${endpointKey(job.source)}`,
      );
      const group = groups.get(key) ?? { edgeIds: new Set<string>(), type: 'o2m' };
      group.edgeIds.add(edgeId);
      groups.set(key, group);
    }
    if (job.isManyToOne) {
      const key = String(
        plan?.m2oPeerGroupKey
          ?? job.m2oPeerGroupKey
          ?? `m2o:${endpointKey(job.target)}`,
      );
      const group = groups.get(key) ?? { edgeIds: new Set<string>(), type: 'm2o' };
      group.edgeIds.add(edgeId);
      groups.set(key, group);
    }
  });
  return [...groups.values()].filter(group => group.edgeIds.size > 0);
};

export const applyRefinedPathsToResults = (
  results: PathFindingResult[],
  refinedPaths: ReadonlyMap<string, readonly Point[]>,
  rawBorderRadius: number,
): number => {
  const borderRadius = Math.max(
    0,
    Number.isFinite(rawBorderRadius) ? rawBorderRadius : 8,
  );
  let changedCount = 0;
  for (const result of results) {
    const newPoints = finitePoints(refinedPaths.get(result.edgeId));
    if (newPoints.length < 2) continue;
    const changed = newPoints.length !== result.points.length
      || newPoints.some((point, index) => {
        const original = result.points[index];
        return !validPoint(original)
          || Math.abs(point.x - original.x) > 0.5
          || Math.abs(point.y - original.y) > 0.5;
      });
    if (!changed) continue;
    result.points = newPoints;
    result.path = createFilletedPath(newPoints, borderRadius);
    const middleIndex = Math.floor(newPoints.length / 2);
    const first = newPoints[Math.max(0, middleIndex - 1)];
    const second = newPoints[middleIndex];
    result.labelX = (first.x + second.x) / 2;
    result.labelY = (first.y + second.y) / 2;
    changedCount += 1;
  }
  return changedCount;
};
