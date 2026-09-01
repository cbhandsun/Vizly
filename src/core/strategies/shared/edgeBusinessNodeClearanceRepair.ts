import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import type { EdgePathQualityScore } from './edgePathQualityGeometry';
import {
  iterateBusinessNodeClearanceCandidates,
} from './edgeBusinessNodeClearanceCandidateRanking';
import { createBusinessNodeClearanceCandidateRankCache } from './edgeBusinessNodeClearanceCandidateRankCache';
import {
  createBusinessNodeClearanceGeometryContext,
  type BusinessNodeClearanceGeometryContext,
} from './edgeBusinessNodeClearanceGeometryContext';
import {
  createBusinessNodeClearanceCandidateCache,
  resetBusinessNodeClearanceRepairDiagnostics,
  type BusinessNodeClearanceRepairDiagnostics,
} from './edgeBusinessNodeClearanceCandidateCache';
import {
  createBusinessNodeClearanceCandidateCollection,
} from './edgeBusinessNodeClearanceCandidateCollection';
import {
  selectAcceptedBusinessNodeClearanceCandidate,
  type BusinessNodeClearanceCandidateValidation,
} from './edgeBusinessNodeClearanceCandidateSelection';
import { buildBusinessNodeTerminalCorridorCandidates } from './edgeBusinessNodeClearanceCorridorCandidates';
import { segmentToClearanceRectDistance } from './edgeNodeClearanceGeometry';
import {
  createEdgePathQualityEvaluationContext,
} from './edgeStrictCrossingGuard';
type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

export type { BusinessNodeClearanceRepairDiagnostics } from './edgeBusinessNodeClearanceCandidateCache';
export type { BusinessNodeClearanceCandidateValidation } from './edgeBusinessNodeClearanceCandidateSelection';

export interface BusinessNodeClearanceRepairOptions {
  eligibleEdgeIds?: ReadonlySet<string>;
  minimumClearance?: number;
  /** Allows one temporary point crossing when the caller owns a strict closure. */
  allowTransientStrictCrossing?: boolean;
  validateCandidate?: (context: BusinessNodeClearanceCandidateValidation) => boolean;
  /** Aggregate-only counters; never contains path, node, or user content. */
  diagnostics?: BusinessNodeClearanceRepairDiagnostics;
  /** Reuse only within one synchronous request over the same immutable node-array snapshot. */
  geometryContext?: BusinessNodeClearanceGeometryContext;
}

const EPS = 0.5;
export const COMMERCIAL_BUSINESS_NODE_CLEARANCE = 48;
/** Minimum local repair target; commercial routing targets 48px or more. */
export const MINIMUM_BUSINESS_NODE_CLEARANCE = 16;
export const COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE = 192;
const CONTAINER_CLEARANCE_OVERFLOW = (
  COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE - COMMERCIAL_BUSINESS_NODE_CLEARANCE
);
const LEGACY_LANE_CLEARANCES = [20, 40, COMMERCIAL_BUSINESS_NODE_CLEARANCE] as const;
const MIN_CLEARANCE_DETOUR_LEG = COMMERCIAL_BUSINESS_NODE_CLEARANCE / 2;
const TERMINAL_BRANCH_STEM_LENGTHS = [48, 96, 192] as const;
const edgePath = (edge: Edge): Point[] => {
  const raw = (edge.data as { computedPath?: unknown } | undefined)?.computedPath;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const point = value as { x?: unknown; y?: unknown };
    return typeof point.x === 'number' && Number.isFinite(point.x)
      && typeof point.y === 'number' && Number.isFinite(point.y)
      ? [{ x: point.x, y: point.y }]
      : [];
  });
};

const axisOf = (start: Point, end: Point): 'h' | 'v' | null => {
  if (Math.abs(start.y - end.y) <= EPS && Math.abs(start.x - end.x) > EPS) return 'h';
  if (Math.abs(start.x - end.x) <= EPS && Math.abs(start.y - end.y) > EPS) return 'v';
  return null;
};

const overlaps = (a1: number, a2: number, b1: number, b2: number): boolean => (
  Math.max(Math.min(a1, a2), Math.min(b1, b2))
    < Math.min(Math.max(a1, a2), Math.max(b1, b2))
);

const samePoint = (first: Point, second: Point): boolean => (
  Math.abs(first.x - second.x) <= EPS
  && Math.abs(first.y - second.y) <= EPS
);

const widenClearanceDetourLane = (originalLane: number, candidateLane: number): number => {
  const offset = candidateLane - originalLane;
  if (Math.abs(offset) <= EPS || Math.abs(offset) >= MIN_CLEARANCE_DETOUR_LEG) {
    return candidateLane;
  }
  return originalLane + Math.sign(offset) * MIN_CLEARANCE_DETOUR_LEG;
};

const compactPath = (path: Point[]): Point[] => {
  const deduped = path.filter((point, index) => index === 0 || !samePoint(point, path[index - 1]));
  if (deduped.length < 3) return deduped;
  const compacted = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = compacted[compacted.length - 1];
    const point = deduped[index];
    const next = deduped[index + 1];
    const collinear = (
      Math.abs(previous.x - point.x) <= EPS && Math.abs(point.x - next.x) <= EPS
    ) || (
      Math.abs(previous.y - point.y) <= EPS && Math.abs(point.y - next.y) <= EPS
    );
    if (!collinear) compacted.push(point);
  }
  compacted.push(deduped[deduped.length - 1]);
  return compacted;
};

export { uniqueBusinessNodeClearancePaths } from './edgeBusinessNodeClearanceCandidateCollection';

const pointToRectDistance = (point: Point, rect: Rect): number => {
  const dx = Math.max(rect.x - point.x, point.x - (rect.x + rect.width), 0);
  const dy = Math.max(rect.y - point.y, point.y - (rect.y + rect.height), 0);
  return Math.hypot(dx, dy);
};

const isDiagonalToRect = (point: Point, rect: Rect): boolean => (
  Math.max(rect.x - point.x, point.x - (rect.x + rect.width), 0) > EPS
  && Math.max(rect.y - point.y, point.y - (rect.y + rect.height), 0) > EPS
);

const cornerDetourCandidates = (
  path: Point[],
  rects: Rect[],
  clearances: readonly number[],
): Point[][] => {
  const candidates: Point[][] = [];
  for (let index = 1; index < path.length - 2; index += 1) {
    const previousAxis = axisOf(path[index - 1], path[index]);
    const nextAxis = axisOf(path[index], path[index + 1]);
    if (!previousAxis || !nextAxis || previousAxis === nextAxis) continue;
    const corner = path[index];
    for (const rect of rects) {
      if (!isDiagonalToRect(corner, rect)) continue;
      for (const clearance of clearances) {
        if (pointToRectDistance(corner, rect) >= clearance - EPS) continue;
        const coordinates = previousAxis === 'v'
          ? [rect.y - clearance, rect.y + rect.height + clearance]
          : [rect.x - clearance, rect.x + rect.width + clearance];
        for (const coordinate of coordinates) {
          const candidate = path.map(point => ({ ...point }));
          if (previousAxis === 'v') {
            candidate[index].y = coordinate;
            candidate[index + 1].y = coordinate;
          } else {
            candidate[index].x = coordinate;
            candidate[index + 1].x = coordinate;
          }
          candidates.push(compactPath(candidate));
        }
      }
    }
  }
  return candidates;
};

const sourceBranchCornerDetourCandidates = (
  path: Point[],
  rects: Rect[],
  clearance: number,
  includeSegmentRisks = false,
) => {
  if (path.length < 4) return [];
  const start = path[0];
  const corner = path[1];
  const previousAxis = axisOf(start, corner);
  const nextAxis = axisOf(corner, path[2]);
  if (!previousAxis || !nextAxis || previousAxis === nextAxis) return [];

  const candidates: Point[][] = [];
  const direction = previousAxis === 'h'
    ? Math.sign(corner.x - start.x)
    : Math.sign(corner.y - start.y);
  const availableStem = previousAxis === 'h'
    ? Math.abs(corner.x - start.x)
    : Math.abs(corner.y - start.y);
  if (direction === 0) return candidates;

  for (const rect of rects) {
    // Preserve corner-only candidates when the run stops before the obstacle;
    // additionally cover a run skimming alongside its longitudinal span.
    const overlapsRun = previousAxis === 'h'
      ? Math.max(start.x, corner.x) > rect.x + EPS && Math.min(start.x, corner.x) < rect.x + rect.width - EPS
      : Math.max(start.y, corner.y) > rect.y + EPS && Math.min(start.y, corner.y) < rect.y + rect.height - EPS;
    const riskyCorner = isDiagonalToRect(corner, rect) && pointToRectDistance(corner, rect) < clearance - EPS;
    if (!riskyCorner && !(includeSegmentRisks && overlapsRun
      && segmentToClearanceRectDistance({ a: start, b: corner }, rect) < clearance - EPS)) continue;
    const allDetourLanes = previousAxis === 'h'
      ? [rect.y - clearance, rect.y + rect.height + clearance]
      : [rect.x - clearance, rect.x + rect.width + clearance];
    const nextDirection = previousAxis === 'h'
      ? Math.sign(path[2].y - corner.y)
      : Math.sign(path[2].x - corner.x);
    const directionalDetourLanes = allDetourLanes.filter(lane => (
      (previousAxis === 'h' ? lane - corner.y : lane - corner.x) * nextDirection > EPS
    ));
    const detourLanes = directionalDetourLanes.length > 0
      ? directionalDetourLanes
      : allDetourLanes;
    for (const stemLength of TERMINAL_BRANCH_STEM_LENGTHS) {
      if (stemLength >= availableStem - EPS) continue;
      const branch = previousAxis === 'h'
        ? { x: start.x + direction * stemLength, y: start.y }
        : { x: start.x, y: start.y + direction * stemLength };
      for (const requestedLane of detourLanes) {
        const lane = widenClearanceDetourLane(previousAxis === 'h' ? corner.y : corner.x, requestedLane);
        const branchOnLane = previousAxis === 'h'
          ? { x: branch.x, y: lane }
          : { x: lane, y: branch.y };
        const cornerOnLane = previousAxis === 'h'
          ? { x: corner.x, y: lane }
          : { x: lane, y: corner.y };
        candidates.push(compactPath([
          start,
          branch,
          branchOnLane,
          cornerOnLane,
          ...path.slice(2),
        ]));
      }
    }
  }
  return candidates;
};

const terminalBranchCornerDetourCandidates = (
  path: Point[],
  rects: Rect[],
  clearance: number,
  includeSegmentRisks = false,
): Point[][] => [
  ...sourceBranchCornerDetourCandidates(path, rects, clearance, includeSegmentRisks),
  ...sourceBranchCornerDetourCandidates([...path].reverse(), rects, clearance, includeSegmentRisks)
    .map(candidate => candidate.reverse()),
];

const laneLeavesContainingContainer = (
  containerRects: Rect[],
  axis: 'h' | 'v',
  originalLanePoint: Point,
  lane: number,
  laneSegmentStart: number,
  laneSegmentEnd: number,
): boolean => containerRects.some(rect => {
  const originalLane = axis === 'v' ? originalLanePoint.x : originalLanePoint.y;
  const containsOriginalLane = axis === 'v'
    ? originalLane >= rect.x - EPS && originalLane <= rect.x + rect.width + EPS
    : originalLane >= rect.y - EPS && originalLane <= rect.y + rect.height + EPS;
  const spansSegment = axis === 'v'
    ? overlaps(laneSegmentStart, laneSegmentEnd, rect.y, rect.y + rect.height)
    : overlaps(laneSegmentStart, laneSegmentEnd, rect.x, rect.x + rect.width);
  const containsCandidateLane = axis === 'v'
    ? lane >= rect.x - CONTAINER_CLEARANCE_OVERFLOW - EPS
      && lane <= rect.x + rect.width + CONTAINER_CLEARANCE_OVERFLOW + EPS
    : lane >= rect.y - CONTAINER_CLEARANCE_OVERFLOW - EPS
      && lane <= rect.y + rect.height + CONTAINER_CLEARANCE_OVERFLOW + EPS;
  return containsOriginalLane && spansSegment && !containsCandidateLane;
});

const segmentDetourCandidate = (
  path: Point[],
  segmentIndex: number,
  rect: Rect,
  clearance: number,
  lane: number,
): Point[] | null => {
  const start = path[segmentIndex];
  const end = path[segmentIndex + 1];
  const axis = axisOf(start, end);
  if (!axis) return null;

  if (axis === 'v') {
    const direction = Math.sign(end.y - start.y);
    if (direction === 0) return null;
    const approach = direction > 0 ? rect.y - clearance : rect.y + rect.height + clearance;
    const exit = direction > 0 ? rect.y + rect.height + clearance : rect.y - clearance;
    const nextPoint = path[segmentIndex + 2];
    if (
      segmentIndex === 0
      && nextPoint
      && axisOf(end, nextPoint) === 'h'
      && end.y >= rect.y - clearance - EPS
      && end.y <= rect.y + rect.height + clearance + EPS
      && start.x >= rect.x - EPS
      && start.x <= rect.x + rect.width + EPS
    ) {
      const stubY = start.y + direction * MIN_CLEARANCE_DETOUR_LEG;
      return compactPath([
        start,
        { x: start.x, y: stubY },
        { x: lane, y: stubY },
        { x: lane, y: end.y },
        ...path.slice(segmentIndex + 2),
      ]);
    }
    const segmentMin = Math.min(start.y, end.y);
    const segmentMax = Math.max(start.y, end.y);
    const startsInsideApproachZone = direction > 0
      ? approach <= start.y + EPS && exit < end.y - EPS
      : approach >= start.y - EPS && exit > end.y + EPS;
    if (startsInsideApproachZone) {
      const escapeLane = lane < start.x
        ? Math.min(
          start.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
          rect.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        )
        : Math.max(
          start.x + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
          rect.x + rect.width + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        );
      const safeStubLimit = direction > 0
        ? rect.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE
        : rect.y + rect.height + COMMERCIAL_BUSINESS_NODE_CLEARANCE;
      const stubY = direction > 0
        ? Math.min(start.y + COMMERCIAL_BUSINESS_NODE_CLEARANCE, safeStubLimit)
        : Math.max(start.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE, safeStubLimit);
      return compactPath([
        ...path.slice(0, segmentIndex + 1),
        { x: start.x, y: stubY },
        { x: escapeLane, y: stubY },
        { x: escapeLane, y: exit },
        { x: start.x, y: exit },
        ...path.slice(segmentIndex + 1),
      ]);
    }
    if (
      nextPoint
      && axisOf(end, nextPoint) === 'h'
      && Math.abs(exit - end.y) <= clearance + EPS
      && approach > segmentMin + EPS
      && approach < segmentMax - EPS
    ) {
      return compactPath([
        ...path.slice(0, segmentIndex + 1),
        { x: start.x, y: approach },
        { x: lane, y: approach },
        { x: lane, y: exit },
        { x: nextPoint.x, y: exit },
        ...path.slice(segmentIndex + 3),
      ]);
    }
    if (
      Math.abs(exit - end.y) <= EPS
      && approach > segmentMin + EPS
      && approach < segmentMax - EPS
    ) {
      return compactPath([
        ...path.slice(0, segmentIndex + 1),
        { x: start.x, y: approach },
        { x: lane, y: approach },
        { x: lane, y: end.y },
        ...path.slice(segmentIndex + 2),
      ]);
    }
    if (Math.min(approach, exit) <= segmentMin + EPS || Math.max(approach, exit) >= segmentMax - EPS) {
      return null;
    }
    const detourApproach = Math.abs(approach - start.y) < MIN_CLEARANCE_DETOUR_LEG
      ? start.y
      : approach;
    return compactPath([
      ...path.slice(0, segmentIndex + 1),
      { x: start.x, y: detourApproach },
      { x: lane, y: detourApproach },
      { x: lane, y: exit },
      { x: start.x, y: exit },
      ...path.slice(segmentIndex + 1),
    ]);
  }

  const direction = Math.sign(end.x - start.x);
  if (direction === 0) return null;
  const approach = direction > 0 ? rect.x - clearance : rect.x + rect.width + clearance;
  const exit = direction > 0 ? rect.x + rect.width + clearance : rect.x - clearance;
  const nextPoint = path[segmentIndex + 2];
  if (
    segmentIndex === 0
    && nextPoint
    && axisOf(end, nextPoint) === 'v'
    && end.x >= rect.x - clearance - EPS
    && end.x <= rect.x + rect.width + clearance + EPS
    && start.y >= rect.y - EPS
    && start.y <= rect.y + rect.height + EPS
  ) {
    const stubX = start.x + direction * MIN_CLEARANCE_DETOUR_LEG;
    return compactPath([
      start,
      { x: stubX, y: start.y },
      { x: stubX, y: lane },
      { x: end.x, y: lane },
      ...path.slice(segmentIndex + 2),
    ]);
  }
  const segmentMin = Math.min(start.x, end.x);
  const segmentMax = Math.max(start.x, end.x);
  const startsInsideApproachZone = direction > 0
    ? approach <= start.x + EPS && exit < end.x - EPS
    : approach >= start.x - EPS && exit > end.x + EPS;
  if (startsInsideApproachZone) {
    const escapeLane = lane < start.y
      ? Math.min(
        start.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        rect.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      )
      : Math.max(
        start.y + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
          rect.y + rect.height + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        );
    const safeStubLimit = direction > 0
      ? rect.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE
      : rect.x + rect.width + COMMERCIAL_BUSINESS_NODE_CLEARANCE;
    const stubX = direction > 0
      ? Math.min(start.x + COMMERCIAL_BUSINESS_NODE_CLEARANCE, safeStubLimit)
      : Math.max(start.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE, safeStubLimit);
    return compactPath([
      ...path.slice(0, segmentIndex + 1),
      { x: stubX, y: start.y },
      { x: stubX, y: escapeLane },
      { x: exit, y: escapeLane },
      { x: exit, y: start.y },
      ...path.slice(segmentIndex + 1),
    ]);
  }
  if (
    nextPoint
    && axisOf(end, nextPoint) === 'v'
    && Math.abs(exit - end.x) <= clearance + EPS
    && approach > segmentMin + EPS
    && approach < segmentMax - EPS
  ) {
    return compactPath([
      ...path.slice(0, segmentIndex + 1),
      { x: approach, y: start.y },
      { x: approach, y: lane },
      { x: exit, y: lane },
      { x: exit, y: nextPoint.y },
      ...path.slice(segmentIndex + 3),
    ]);
  }
  if (
    Math.abs(exit - end.x) <= EPS
    && approach > segmentMin + EPS
    && approach < segmentMax - EPS
  ) {
    return compactPath([
      ...path.slice(0, segmentIndex + 1),
      { x: approach, y: start.y },
      { x: approach, y: lane },
      { x: end.x, y: lane },
      ...path.slice(segmentIndex + 2),
    ]);
  }
  if (Math.min(approach, exit) <= segmentMin + EPS || Math.max(approach, exit) >= segmentMax - EPS) {
    return null;
  }
  const detourApproach = Math.abs(approach - start.x) < MIN_CLEARANCE_DETOUR_LEG
    ? start.x
    : approach;
  return compactPath([
    ...path.slice(0, segmentIndex + 1),
    { x: detourApproach, y: start.y },
    { x: detourApproach, y: lane },
    { x: exit, y: lane },
    { x: exit, y: start.y },
    ...path.slice(segmentIndex + 1),
  ]);
};

const clearanceCandidates = (
  path: Point[],
  rects: Rect[],
  containerRects: Rect[],
  minimumClearance: number,
  maximumHits: number,
  countHits: (candidate: Point[], maximumHits: number) => number,
  terminalCorridorsOnly = false,
) => {
  const hitByCandidate = new WeakMap<Point[], number>();
  const candidates = createBusinessNodeClearanceCandidateCollection<Point[]>(candidate => {
    const hits = countHits(candidate, maximumHits);
    if (!Number.isSafeInteger(hits) || hits < 0 || hits > maximumHits) return false;
    hitByCandidate.set(candidate, hits);
    return true;
  });
  if (terminalCorridorsOnly) {
    // Try the existing simple lane moves first. Only then introduce a new
    // terminal branch to clear an obstacle alongside the outgoing segment.
    candidates.addAll(terminalBranchCornerDetourCandidates(path, rects, minimumClearance, true));
    candidates.addAll(buildBusinessNodeTerminalCorridorCandidates(
      path,
      rects,
      minimumClearance,
      containerRects,
      CONTAINER_CLEARANCE_OVERFLOW,
    ));
    const result = candidates.read();
    return {
      candidates: result.paths.map(candidate => ({
        candidate,
        hits: hitByCandidate.get(candidate) ?? maximumHits + 1,
      })),
      generatedCandidateCount: result.generatedCandidateCount,
      uniqueCandidateCount: result.uniqueCandidateCount,
    };
  }
  const laneClearances = [...new Set([
    ...LEGACY_LANE_CLEARANCES,
    minimumClearance,
  ])].sort((left, right) => left - right);
  candidates.addAll(cornerDetourCandidates(path, rects, laneClearances));
  candidates.addAll(terminalBranchCornerDetourCandidates(path, rects, minimumClearance));
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const axis = axisOf(start, end);
    if (!axis) continue;
    const nearbyRects = rects.filter(rect => {
      const alongAxisOverlap = axis === 'v'
        ? overlaps(start.y, end.y, rect.y, rect.y + rect.height)
        : overlaps(start.x, end.x, rect.x, rect.x + rect.width);
      if (!alongAxisOverlap) return false;
      const lane = axis === 'v' ? start.x : start.y;
      const crossAxisDistance = axis === 'v'
        ? Math.max(rect.x - lane, lane - (rect.x + rect.width), 0)
        : Math.max(rect.y - lane, lane - (rect.y + rect.height), 0);
      return crossAxisDistance < minimumClearance - EPS;
    });
    if (nearbyRects.length > 1) {
      const envelope: Rect = {
        x: Math.min(...nearbyRects.map(rect => rect.x)),
        y: Math.min(...nearbyRects.map(rect => rect.y)),
        width: Math.max(...nearbyRects.map(rect => rect.x + rect.width))
          - Math.min(...nearbyRects.map(rect => rect.x)),
        height: Math.max(...nearbyRects.map(rect => rect.y + rect.height))
          - Math.min(...nearbyRects.map(rect => rect.y)),
      };
      const clusterLanes = axis === 'v'
        ? [envelope.x - minimumClearance, envelope.x + envelope.width + minimumClearance]
        : [envelope.y - minimumClearance, envelope.y + envelope.height + minimumClearance];
      const clusterLaneStart = axis === 'v'
        ? envelope.y - minimumClearance
        : envelope.x - minimumClearance;
      const clusterLaneEnd = axis === 'v'
        ? envelope.y + envelope.height + minimumClearance
        : envelope.x + envelope.width + minimumClearance;
      for (const lane of clusterLanes) {
        const detourLane = widenClearanceDetourLane(
          axis === 'v' ? start.x : start.y,
          lane,
        );
        if (laneLeavesContainingContainer(
          containerRects,
          axis,
          start,
          detourLane,
          clusterLaneStart,
          clusterLaneEnd,
        )) continue;
        const detour = segmentDetourCandidate(
          path,
          index,
          envelope,
          minimumClearance,
          detourLane,
        );
        if (detour) candidates.add(detour);
      }
    }
    for (const rect of rects) {
      const crossAxisOverlap = axis === 'v'
        ? overlaps(start.y, end.y, rect.y, rect.y + rect.height)
        : overlaps(start.x, end.x, rect.x, rect.x + rect.width);
      if (!crossAxisOverlap) continue;
      for (const clearance of laneClearances) {
        const lanes = axis === 'v'
          ? [rect.x - clearance, rect.x + rect.width + clearance]
          : [rect.y - clearance, rect.y + rect.height + clearance];
        const detourLaneStart = axis === 'v'
          ? rect.y - clearance
          : rect.x - clearance;
        const detourLaneEnd = axis === 'v'
          ? rect.y + rect.height + clearance
          : rect.x + rect.width + clearance;
        for (const lane of lanes) {
          const detourLane = widenClearanceDetourLane(
            axis === 'v' ? start.x : start.y,
            lane,
          );
          if (laneLeavesContainingContainer(
            containerRects,
            axis,
            start,
            detourLane,
            detourLaneStart,
            detourLaneEnd,
          )) continue;

          const detour = segmentDetourCandidate(path, index, rect, clearance, detourLane);
          if (detour) candidates.add(detour);

          if (index > 0 && index < path.length - 2) {
            const originalSegmentStart = axis === 'v' ? start.y : start.x;
            const originalSegmentEnd = axis === 'v' ? end.y : end.x;
            if (laneLeavesContainingContainer(
              containerRects,
              axis,
              start,
              lane,
              originalSegmentStart,
              originalSegmentEnd,
            )) continue;
            const candidate = path.map(point => ({ ...point }));
            if (axis === 'v') {
              candidate[index].x = lane;
              candidate[index + 1].x = lane;
            } else {
              candidate[index].y = lane;
              candidate[index + 1].y = lane;
            }
            candidates.add(compactPath(candidate));
          }
        }
      }
    }
  }
  const result = candidates.read();
  return {
    candidates: result.paths.map(candidate => ({
      candidate,
      hits: hitByCandidate.get(candidate) ?? maximumHits + 1,
    })),
    generatedCandidateCount: result.generatedCandidateCount,
    uniqueCandidateCount: result.uniqueCandidateCount,
  };
};

export const repairBusinessNodeClearanceRisks = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: BusinessNodeClearanceRepairOptions = {},
): Edge[] => {
  resetBusinessNodeClearanceRepairDiagnostics(options.diagnostics);
  const minimumClearance = Number.isFinite(options.minimumClearance)
    ? Math.max(
      MINIMUM_BUSINESS_NODE_CLEARANCE,
      Math.min(256, options.minimumClearance ?? COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE),
    )
    : COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE;
  const geometryContext = options.geometryContext?.matchesNodes(nodes)
    ? options.geometryContext
    : createBusinessNodeClearanceGeometryContext(nodes);
  const rectContext = geometryContext.rects;
  const clearanceContext = geometryContext.clearance;
  const candidateCollectionCache = createBusinessNodeClearanceCandidateCache<
    ReturnType<typeof clearanceCandidates>
  >();
  const candidateRankCache = createBusinessNodeClearanceCandidateRankCache();
  let current = edges;
  let qualityBaselineEdges: Edge[] | null = null;
  let qualityContext: ReturnType<typeof createEdgePathQualityEvaluationContext> | null = null;
  let baselineQuality: EdgePathQualityScore | null = null;
  const getQualityBaseline = (): Readonly<{
    context: ReturnType<typeof createEdgePathQualityEvaluationContext>;
    score: EdgePathQualityScore;
  }> => {
    if (qualityBaselineEdges === current && qualityContext && baselineQuality) {
      if (options.diagnostics) options.diagnostics.qualityContextCacheHitCount += 1;
      return { context: qualityContext, score: baselineQuality };
    }
    qualityBaselineEdges = current;
    qualityContext = createEdgePathQualityEvaluationContext(current);
    baselineQuality = qualityContext.evaluate(current);
    if (options.diagnostics) options.diagnostics.qualityContextBuildCount += 1;
    return { context: qualityContext, score: baselineQuality };
  };
  const maxPasses = Math.min(64, Math.max(4, current.length));
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const passBaseline = current;
    const riskyEdgeIds = current
      .filter(edge => !options.eligibleEdgeIds || options.eligibleEdgeIds.has(edge.id))
      .map(edge => ({
        edge,
        risk: clearanceContext.score(
          edgePath(edge),
          edge,
          minimumClearance,
        ),
      }))
      .filter(entry => entry.risk > 0)
      .sort((first, second) => second.risk - first.risk)
      .map(entry => entry.edge.id);
    if (riskyEdgeIds.length === 0) break;

    for (const edgeId of riskyEdgeIds) {
      const edgeIndex = current.findIndex(edge => edge.id === edgeId);
      const edge = current[edgeIndex];
      if (!edge) continue;
      const path = edgePath(edge);
      const obstacleContext = geometryContext.obstacleFor(edge);
      const qualityBaseline = getQualityBaseline();
      const [baselineRisk, baselineCommercialRisk] = clearanceContext.scorePair(
        path,
        edge,
        minimumClearance,
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      );
      const baselineHits = obstacleContext.countUnrelatedObstacleHits(path);
      const candidateCollectionResult = candidateCollectionCache.getOrCreate({
        path,
        sourceId: edge.source,
        targetId: edge.target,
        minimumClearance,
        create: () => clearanceCandidates(
          path,
          rectContext.rectsForTerminals(edge.source, edge.target),
          rectContext.containerRects,
          minimumClearance,
          baselineHits,
          (candidatePath, maximumHits) => obstacleContext.countUnrelatedObstacleHits(
            candidatePath,
            maximumHits,
          ),
        ),
      });
      const candidateCollection = candidateCollectionResult.value;
      if (candidateCollectionResult.cacheHit && options.diagnostics) {
        options.diagnostics.candidateCollectionCacheHitCount += 1;
      }
      if (options.diagnostics) {
        options.diagnostics.generatedCandidateCount += candidateCollection.generatedCandidateCount;
        options.diagnostics.uniqueCandidateCount += candidateCollection.uniqueCandidateCount;
      }
      const rankedCandidatesFor = (collection: typeof candidateCollection) => {
        const result = candidateRankCache.getOrCreate(
          collection,
          collection.candidates,
          candidate => clearanceContext.scorePair(
            candidate, edge, minimumClearance, COMMERCIAL_BUSINESS_NODE_CLEARANCE,
          ),
        );
        if (result.cacheHit && options.diagnostics) {
          options.diagnostics.candidateRankCacheHitCount += 1;
        }
        return iterateBusinessNodeClearanceCandidates(result.value, {
          hits: baselineHits,
          risk: baselineRisk,
          commercialRisk: baselineCommercialRisk,
        });
      };
      const selectCandidate = (collection: typeof candidateCollection) => (
        selectAcceptedBusinessNodeClearanceCandidate({
          allowTransientStrictCrossing: options.allowTransientStrictCrossing === true,
          baselineEdges: current,
          baselineObstacleHits: baselineHits,
          baselineQuality: qualityBaseline.score,
          edge,
          edgeIndex,
          obstacleContext,
          qualityContext: qualityBaseline.context,
          rankedCandidates: rankedCandidatesFor(collection),
          validateCandidate: options.validateCandidate,
        })
      );
      const standardCandidate = selectCandidate(candidateCollection);
      if (standardCandidate) {
        current = standardCandidate;
        continue;
      }
      const corridorCollection = clearanceCandidates(
        path, rectContext.rectsForTerminals(edge.source, edge.target),
        rectContext.containerRects, minimumClearance, baselineHits,
        (candidatePath, maximumHits) => obstacleContext.countUnrelatedObstacleHits(
          candidatePath, maximumHits,
        ),
        true,
      );
      if (options.diagnostics) {
        options.diagnostics.generatedCandidateCount += corridorCollection.generatedCandidateCount;
        options.diagnostics.uniqueCandidateCount += corridorCollection.uniqueCandidateCount;
      }
      current = selectCandidate(corridorCollection) ?? current;
    }
    if (current === passBaseline || current.every((edge, index) => edge === passBaseline[index])) break;
  }
  if (options.diagnostics) {
    const clearanceMetrics = clearanceContext.readMetrics();
    options.diagnostics.clearanceScoreCacheHitCount = clearanceMetrics.cacheHitCount;
    options.diagnostics.clearanceScannedNodeCount = clearanceMetrics.scannedNodeCount;
  }
  return current;
};
