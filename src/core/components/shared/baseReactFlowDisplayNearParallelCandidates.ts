import type { Edge, Node } from '@xyflow/react';

import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  NEAR_PARALLEL_LANE_TOLERANCE,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  sortedUniqueNumbers,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';

const candidateSignature = (candidate: DisplayPoint[]): string => (
  candidate.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|')
);

export const buildNearParallelLaneNudgePaths = (
  path: DisplayPoint[],
  segment: DisplaySegment,
  other: DisplaySegment,
  otherPath: DisplayPoint[],
  nodes: Node[],
  edge: Edge,
  allEdges: Edge[],
  maxCandidates = Number.POSITIVE_INFINITY,
): DisplayPoint[][] => {
  if (segment.segmentIndex < 0 || segment.segmentIndex >= path.length - 1) return [];
  const candidateLimit = maxCandidates === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Number.isFinite(maxCandidates)
    ? Math.max(0, Math.floor(maxCandidates))
    : 0;
  if (candidateLimit === 0) return [];
  const laneCandidates = new Set<number>();
  const addLane = (lane: number) => {
    if (Number.isFinite(lane)) laneCandidates.add(Math.round(lane));
  };
  const isEndpointSegment = segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2;
  if (!isEndpointSegment) {
    // Prefer collapsing an H-V-H / V-H-V stair onto either existing outer
    // lane before inventing a new lane. This removes the common case where an
    // interior segment doubles back onto a sibling's terminal breakout while
    // also reducing bends and total length. The full quality, terminal and
    // obstacle gates still decide whether either straightening is safe.
    for (const neighborIndex of [segment.segmentIndex - 2, segment.segmentIndex + 2]) {
      const neighborStart = path[neighborIndex];
      const neighborEnd = path[neighborIndex + 1];
      if (!neighborStart || !neighborEnd) continue;
      if (displayAxisOf(neighborStart, neighborEnd) !== segment.axis) continue;
      addLane(segment.axis === 'v' ? neighborStart.x : neighborStart.y);
    }
  }
  [-1, 1].forEach((direction) => {
    if (segment.axis === 'v') {
      [
        NEAR_PARALLEL_LANE_TOLERANCE + 1,
        NEAR_PARALLEL_LANE_TOLERANCE * 2,
        12,
        RESIDUAL_PARALLEL_LANE_GAP,
        RESIDUAL_PARALLEL_LANE_GAP * 2,
        RESIDUAL_PARALLEL_LANE_GAP * 3,
        RESIDUAL_PARALLEL_LANE_GAP * 4,
      ].forEach(gap => addLane(other.a.x + direction * gap));
    } else {
      [
        NEAR_PARALLEL_LANE_TOLERANCE + 1,
        NEAR_PARALLEL_LANE_TOLERANCE * 2,
        12,
        RESIDUAL_PARALLEL_LANE_GAP,
        RESIDUAL_PARALLEL_LANE_GAP * 2,
        RESIDUAL_PARALLEL_LANE_GAP * 3,
        RESIDUAL_PARALLEL_LANE_GAP * 4,
      ].forEach(gap => addLane(other.a.y + direction * gap));
    }
  });

  const segmentMainMin = segment.axis === 'h'
    ? Math.min(segment.a.x, segment.b.x)
    : Math.min(segment.a.y, segment.b.y);
  const segmentMainMax = segment.axis === 'h'
    ? Math.max(segment.a.x, segment.b.x)
    : Math.max(segment.a.y, segment.b.y);
  const blockingLaneValues: number[] = [];
  [other.segmentIndex - 1, other.segmentIndex + 1].forEach((neighborIndex) => {
    const neighborStart = otherPath[neighborIndex];
    const neighborEnd = otherPath[neighborIndex + 1];
    if (!neighborStart || !neighborEnd) return;
    const neighborAxis = displayAxisOf(neighborStart, neighborEnd);
    if (!neighborAxis || neighborAxis === segment.axis) return;
    const neighborMain = segment.axis === 'h' ? neighborStart.x : neighborStart.y;
    if (neighborMain < segmentMainMin - 0.5 || neighborMain > segmentMainMax + 0.5) return;
    blockingLaneValues.push(
      segment.axis === 'h' ? neighborStart.y : neighborStart.x,
      segment.axis === 'h' ? neighborEnd.y : neighborEnd.x,
    );
  });
  if (blockingLaneValues.length > 0) {
    const minLane = Math.min(...blockingLaneValues);
    const maxLane = Math.max(...blockingLaneValues);
    [RESIDUAL_PARALLEL_LANE_GAP, 32, 48, 64].forEach((gap) => {
      addLane(minLane - gap);
      addLane(maxLane + gap);
    });
  }

  const candidatePaths: DisplayPoint[][] = [];
  const seenCandidateSignatures = new Set<string>();
  const appendCandidate = (candidate: DisplayPoint[]): boolean => {
    const compacted = compactOrthogonalPath(candidate);
    if (compacted.length < 2 || !compacted.every(isFinitePoint)) return false;
    const signature = candidateSignature(compacted);
    if (seenCandidateSignatures.has(signature)) return false;
    seenCandidateSignatures.add(signature);
    candidatePaths.push(compacted);
    return candidatePaths.length >= candidateLimit;
  };

  if (isEndpointSegment) {
    const start = path[segment.segmentIndex];
    const end = path[segment.segmentIndex + 1];
    if (start && end) {
      for (const lane of laneCandidates) {
        if (segment.axis === 'v') {
          if (Math.abs(lane - segment.a.x) <= NEAR_PARALLEL_LANE_TOLERANCE) continue;
          if (appendCandidate([
            ...path.slice(0, segment.segmentIndex + 1),
            { x: lane, y: start.y },
            { x: lane, y: end.y },
            ...path.slice(segment.segmentIndex + 1),
          ])) return candidatePaths;
        } else {
          if (Math.abs(lane - segment.a.y) <= NEAR_PARALLEL_LANE_TOLERANCE) continue;
          if (appendCandidate([
            ...path.slice(0, segment.segmentIndex + 1),
            { x: start.x, y: lane },
            { x: end.x, y: lane },
            ...path.slice(segment.segmentIndex + 1),
          ])) return candidatePaths;
        }
      }
    }
  }

  if (isEndpointSegment) return candidatePaths;

  for (const lane of laneCandidates) {
    const next = path.map(point => ({ ...point }));
    if (segment.axis === 'v') {
      if (Math.abs(lane - segment.a.x) <= NEAR_PARALLEL_LANE_TOLERANCE) continue;
      next[segment.segmentIndex].x = lane;
      next[segment.segmentIndex + 1].x = lane;
    } else {
      if (Math.abs(lane - segment.a.y) <= NEAR_PARALLEL_LANE_TOLERANCE) continue;
      next[segment.segmentIndex].y = lane;
      next[segment.segmentIndex + 1].y = lane;
    }
    if (appendCandidate(next)) return candidatePaths;

    const firstAnchor = Math.max(0, segment.segmentIndex - 3);
    const segmentDirection = segment.direction || 1;
    const exitOffsets = [0, 24, 32, 48, 64, 96, 128];
    const exitMainCandidates = exitOffsets.map((offset) => (
      segment.axis === 'v'
        ? segment.b.y + segmentDirection * offset
        : segment.b.x + segmentDirection * offset
    ));
    for (let anchorIndex = firstAnchor; anchorIndex < segment.segmentIndex; anchorIndex += 1) {
      const anchor = path[anchorIndex];
      if (!anchor) continue;
      if (appendCandidate(segment.axis === 'v'
        ? [
          ...path.slice(0, anchorIndex + 1),
          { x: lane, y: anchor.y },
          { x: lane, y: segment.b.y },
          ...path.slice(segment.segmentIndex + 2),
        ]
        : [
          ...path.slice(0, anchorIndex + 1),
          { x: anchor.x, y: lane },
          { x: segment.b.x, y: lane },
          ...path.slice(segment.segmentIndex + 2),
        ])) return candidatePaths;
      const exitContinuation = path[segment.segmentIndex + 2];
      if (!exitContinuation) continue;
      for (const exitMain of exitMainCandidates) {
        if (appendCandidate(segment.axis === 'v'
          ? [
            ...path.slice(0, anchorIndex + 1),
            { x: lane, y: anchor.y },
            { x: lane, y: exitMain },
            { x: exitContinuation.x, y: exitMain },
            ...path.slice(segment.segmentIndex + 3),
          ]
          : [
            ...path.slice(0, anchorIndex + 1),
            { x: anchor.x, y: lane },
            { x: exitMain, y: lane },
            { x: exitMain, y: exitContinuation.y },
            ...path.slice(segment.segmentIndex + 3),
          ])) return candidatePaths;
      }
    }
  }

  for (const candidatePath of buildObstacleSkirtCandidates(path, nodes, edge, allEdges)) {
    if (appendCandidate(candidatePath)) return candidatePaths;
  }

  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect)
    .sort((first, second) => {
      const firstDistance = segment.axis === 'v'
        ? Math.abs((first.x + first.width / 2) - segment.a.x)
        : Math.abs((first.y + first.height / 2) - segment.a.y);
      const secondDistance = segment.axis === 'v'
        ? Math.abs((second.x + second.width / 2) - segment.a.x)
        : Math.abs((second.y + second.height / 2) - segment.a.y);
      return firstDistance - secondDistance;
    })
    .slice(0, 8);
  const entry = path[segment.segmentIndex];
  const suffixStart = segment.segmentIndex + 2;
  for (const rect of obstacles) {
    if (segment.axis === 'v') {
      const laneValues = sortedUniqueNumbers([
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP * 2,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], segment.a.x);
      const bypassValues = sortedUniqueNumbers([
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - 1,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + 1,
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
      ], segment.b.y);
      for (const laneX of laneValues.slice(0, 4)) {
        for (const bypassY of bypassValues.slice(0, 4)) {
          for (let exitIndex = suffixStart; exitIndex < path.length; exitIndex += 1) {
            const exit = path[exitIndex];
            if (!entry || !exit) continue;
            if (appendCandidate([
              ...path.slice(0, segment.segmentIndex),
              { x: laneX, y: entry.y },
              { x: laneX, y: bypassY },
              { x: exit.x, y: bypassY },
              ...path.slice(exitIndex + 1),
            ])) return candidatePaths;
          }
        }
      }
    } else {
      const laneValues = sortedUniqueNumbers([
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP * 2,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], segment.a.y);
      const bypassValues = sortedUniqueNumbers([
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - 1,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + 1,
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
      ], segment.b.x);
      for (const laneY of laneValues.slice(0, 4)) {
        for (const bypassX of bypassValues.slice(0, 4)) {
          for (let exitIndex = suffixStart; exitIndex < path.length; exitIndex += 1) {
            const exit = path[exitIndex];
            if (!entry || !exit) continue;
            if (appendCandidate([
              ...path.slice(0, segment.segmentIndex),
              { x: entry.x, y: laneY },
              { x: bypassX, y: laneY },
              { x: bypassX, y: exit.y },
              ...path.slice(exitIndex + 1),
            ])) return candidatePaths;
          }
        }
      }
    }
  }

  return candidatePaths;
};
