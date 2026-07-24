import type { Node } from '@xyflow/react';
import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  getDisplayNodeRect,
  isDisplayContainerNode,
  rangesOverlapWithMargin,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  buildStrictInterSegmentLaneXs,
  buildStrictInterSegmentLaneYs,
  buildStrictObstacleSideBridgeXs,
  buildStrictObstacleSideBridgeYs,
  STRICT_OBSTACLE_SIDE_CLEARANCES,
} from './baseReactFlowDisplayLanePositions';

const MIN_DISPLAY_ENDPOINT_STUB = 48;

export {
  STRICT_OUTER_LANE_MAX_CANDIDATES,
  STRICT_OUTER_LANE_MAX_REPAIRED_EDGES,
  STRICT_OUTER_LANE_MIN_SPAN,
  STRICT_OUTER_LANE_STUB_LENGTHS,
  buildDirectionalStrictOuterLaneCandidates,
} from './baseReactFlowDisplayOuterLaneCandidates';
export {
  buildStrictObstacleSideBridgeXs,
  buildStrictObstacleSideBridgeYs,
  STRICT_OBSTACLE_SIDE_CLEARANCES,
} from './baseReactFlowDisplayLanePositions';

export type StrictCrossingSegmentLike = {
  a: DisplayPoint;
  b: DisplayPoint;
  axis: 'h' | 'v';
  edgeIndex: number;
  segIdx: number;
};

export const STRICT_TERMINAL_ESCAPE_CLEARANCES = [24, 32, 48, 64, 96, 128, 160, 224];
export const STRICT_TERMINAL_MAX_CROSSINGS = 6;
export const STRICT_TERMINAL_MAX_CANDIDATES = 160;

export const buildStrictTerminalEscapeCandidates = (
  path: DisplayPoint[],
  segment: StrictCrossingSegmentLike,
  other: StrictCrossingSegmentLike,
  otherSegments: DisplaySegment[],
): DisplayPoint[][] => {
  if (path.length < 4 || segment.axis === other.axis) return [];
  const isStartTerminal = segment.segIdx === 0;
  const isEndTerminal = segment.segIdx === path.length - 2;
  if (!isStartTerminal && !isEndTerminal) return [];

  const candidates: DisplayPoint[][] = [];
  if (segment.axis === 'v') {
    const minX = Math.min(other.a.x, other.b.x);
    const maxX = Math.max(other.a.x, other.b.x);
    const corridorLaneXs = buildStrictInterSegmentLaneXs(path, otherSegments).slice(0, 16);
    for (const clearance of STRICT_TERMINAL_ESCAPE_CLEARANCES) {
      for (const laneX of [...corridorLaneXs, minX - clearance, maxX + clearance]) {
        const globalStart = path[0];
        const globalEnd = path[path.length - 1];
        candidates.push(compactOrthogonalPath([
          globalStart,
          { x: laneX, y: globalStart.y },
          { x: laneX, y: globalEnd.y },
          globalEnd,
        ]));
        if (isStartTerminal) {
          const start = path[0];
          const terminal = path[1];
          candidates.push(compactOrthogonalPath([
            start,
            { x: laneX, y: start.y },
            { x: laneX, y: terminal.y },
            ...path.slice(2),
          ]));
          const next = path[2];
          if (next && displayAxisOf(terminal, next) === 'h') {
            for (const bridgeClearance of STRICT_TERMINAL_ESCAPE_CLEARANCES.slice(0, 6)) {
              for (const bridgeY of [
                terminal.y - bridgeClearance,
                terminal.y + bridgeClearance,
                other.a.y - bridgeClearance,
                other.a.y + bridgeClearance,
              ]) {
                candidates.push(compactOrthogonalPath([
                  start,
                  { x: laneX, y: start.y },
                  { x: laneX, y: bridgeY },
                  { x: next.x, y: bridgeY },
                  ...path.slice(3),
                ]));
              }
            }
          }
        } else {
          const terminal = path[path.length - 2];
          const end = path[path.length - 1];
          candidates.push(compactOrthogonalPath([
            ...path.slice(0, -2),
            { x: laneX, y: terminal.y },
            { x: laneX, y: end.y },
            end,
          ]));
          const previous = path[path.length - 3];
          if (previous && displayAxisOf(previous, terminal) === 'h') {
            for (const bridgeClearance of STRICT_TERMINAL_ESCAPE_CLEARANCES.slice(0, 6)) {
              for (const bridgeY of [
                terminal.y - bridgeClearance,
                terminal.y + bridgeClearance,
                other.a.y - bridgeClearance,
                other.a.y + bridgeClearance,
              ]) {
                candidates.push(compactOrthogonalPath([
                  ...path.slice(0, -3),
                  { x: previous.x, y: bridgeY },
                  { x: laneX, y: bridgeY },
                  { x: laneX, y: end.y },
                  end,
                ]));
              }
            }
          }
        }
      }
    }
  } else {
    const minY = Math.min(other.a.y, other.b.y);
    const maxY = Math.max(other.a.y, other.b.y);
    const corridorLaneYs = buildStrictInterSegmentLaneYs(path, otherSegments).slice(0, 16);
    for (const clearance of STRICT_TERMINAL_ESCAPE_CLEARANCES) {
      for (const laneY of [...corridorLaneYs, minY - clearance, maxY + clearance]) {
        const globalStart = path[0];
        const globalEnd = path[path.length - 1];
        candidates.push(compactOrthogonalPath([
          globalStart,
          { x: globalStart.x, y: laneY },
          { x: globalEnd.x, y: laneY },
          globalEnd,
        ]));
        if (isStartTerminal) {
          const start = path[0];
          const terminal = path[1];
          candidates.push(compactOrthogonalPath([
            start,
            { x: start.x, y: laneY },
            { x: terminal.x, y: laneY },
            ...path.slice(2),
          ]));
          const next = path[2];
          if (next && displayAxisOf(terminal, next) === 'v') {
            for (const bridgeClearance of STRICT_TERMINAL_ESCAPE_CLEARANCES.slice(0, 6)) {
              for (const bridgeX of [
                terminal.x - bridgeClearance,
                terminal.x + bridgeClearance,
                other.a.x - bridgeClearance,
                other.a.x + bridgeClearance,
              ]) {
                candidates.push(compactOrthogonalPath([
                  start,
                  { x: start.x, y: laneY },
                  { x: bridgeX, y: laneY },
                  { x: bridgeX, y: next.y },
                  ...path.slice(3),
                ]));
              }
            }
          }
        } else {
          const terminal = path[path.length - 2];
          const end = path[path.length - 1];
          candidates.push(compactOrthogonalPath([
            ...path.slice(0, -2),
            { x: terminal.x, y: laneY },
            { x: end.x, y: laneY },
            end,
          ]));
          const previous = path[path.length - 3];
          if (previous && displayAxisOf(previous, terminal) === 'v') {
            for (const bridgeClearance of STRICT_TERMINAL_ESCAPE_CLEARANCES.slice(0, 6)) {
              for (const bridgeX of [
                terminal.x - bridgeClearance,
                terminal.x + bridgeClearance,
                other.a.x - bridgeClearance,
                other.a.x + bridgeClearance,
              ]) {
                candidates.push(compactOrthogonalPath([
                  ...path.slice(0, -3),
                  { x: bridgeX, y: previous.y },
                  { x: bridgeX, y: laneY },
                  { x: end.x, y: laneY },
                  end,
                ]));
              }
            }
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  return candidates
    .filter(candidate => candidate.length >= 2 && candidate.every(isFinitePoint))
    .filter((candidate) => {
      const key = candidate.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const buildInternalStrictLaneShiftCandidates = (
  path: DisplayPoint[],
  segment: { axis: 'h' | 'v'; segIdx: number; a: DisplayPoint; b: DisplayPoint },
  other: { axis: 'h' | 'v'; segIdx: number; a: DisplayPoint; b: DisplayPoint },
  otherPath: DisplayPoint[] | undefined,
  nodes: Node[],
): DisplayPoint[][] => {
  if (segment.axis === other.axis) return [];
  if (segment.segIdx <= 0 || segment.segIdx >= path.length - 2) return [];

  const candidates: DisplayPoint[][] = [];
  const appendCandidate = (candidatePath: DisplayPoint[]) => {
    const compacted = compactOrthogonalPath(candidatePath);
    if (compacted.length >= 2 && compacted.every(isFinitePoint)) candidates.push(compacted);
  };
  const uniqueCandidates = (): DisplayPoint[][] => {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = candidate.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  if (segment.axis === 'v') {
    const minX = Math.min(other.a.x, other.b.x);
    const maxX = Math.max(other.a.x, other.b.x);
    let avoidMinY = other.a.y;
    let avoidMaxY = other.a.y;
    if (otherPath) {
      for (const adjacentIndex of [other.segIdx - 1, other.segIdx + 1]) {
        const adjacentStart = otherPath[adjacentIndex];
        const adjacentEnd = otherPath[adjacentIndex + 1];
        if (!adjacentStart || !adjacentEnd) continue;
        if (displayAxisOf(adjacentStart, adjacentEnd) !== 'v') continue;
        avoidMinY = Math.min(avoidMinY, adjacentStart.y, adjacentEnd.y);
        avoidMaxY = Math.max(avoidMaxY, adjacentStart.y, adjacentEnd.y);
      }
    }
    const laneValues = sortedUniqueNumbers([
      minX - MIN_DISPLAY_ENDPOINT_STUB,
      maxX + MIN_DISPLAY_ENDPOINT_STUB,
      minX - RESIDUAL_PARALLEL_LANE_GAP,
      maxX + RESIDUAL_PARALLEL_LANE_GAP,
      minX - RESIDUAL_PARALLEL_LANE_GAP * 2,
      maxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], segment.a.x);
    for (const laneX of laneValues.slice(0, 6)) {
      if (laneX > minX + 1 && laneX < maxX - 1) continue;
      const shifted = shiftDisplayInternalSegment(path, segment.segIdx, 'v', laneX);
      if (shifted) candidates.push(shifted);
    }
    const previousAxis = displayAxisOf(path[segment.segIdx - 1], path[segment.segIdx]);
    if (previousAxis === 'h') {
      const entryYValues = sortedUniqueNumbers([
        avoidMinY - MIN_DISPLAY_ENDPOINT_STUB,
        avoidMaxY + MIN_DISPLAY_ENDPOINT_STUB,
        avoidMinY - RESIDUAL_PARALLEL_LANE_GAP,
        avoidMaxY + RESIDUAL_PARALLEL_LANE_GAP,
        avoidMinY - RESIDUAL_PARALLEL_LANE_GAP * 2,
        avoidMaxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], segment.a.y);
      for (const laneY of entryYValues.slice(0, 6)) {
        for (const laneX of laneValues.slice(0, 6)) {
          if (laneX > minX + 1 && laneX < maxX - 1) continue;
          const shifted = path.map(point => ({ ...point }));
          shifted[segment.segIdx - 1].y = laneY;
          shifted[segment.segIdx].x = laneX;
          shifted[segment.segIdx].y = laneY;
          shifted[segment.segIdx + 1].x = laneX;
          appendCandidate(shifted);
        }
      }
      const bridgeXValues = sortedUniqueNumbers([
        minX - MIN_DISPLAY_ENDPOINT_STUB,
        minX - RESIDUAL_PARALLEL_LANE_GAP,
        minX - RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], segment.a.x);
      const exitXValues = sortedUniqueNumbers([
        maxX + RESIDUAL_PARALLEL_LANE_GAP,
        maxX + MIN_DISPLAY_ENDPOINT_STUB,
        maxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], segment.a.x);
      for (const bridgeX of bridgeXValues.slice(0, 4)) {
        for (const laneY of entryYValues.slice(0, 4)) {
          for (const laneX of exitXValues.slice(0, 4)) {
            appendCandidate([
              ...path.slice(0, segment.segIdx),
              { x: bridgeX, y: segment.a.y },
              { x: bridgeX, y: laneY },
              { x: laneX, y: laneY },
              { x: laneX, y: segment.b.y },
              ...path.slice(segment.segIdx + 2),
            ]);
          }
        }
      }
      const obstacleExitXValues = sortedUniqueNumbers(
        buildStrictObstacleSideBridgeXs(
          nodes,
          Math.min(avoidMinY - RESIDUAL_PARALLEL_LANE_GAP * 2, segment.a.y, segment.b.y),
          Math.max(avoidMaxY + RESIDUAL_PARALLEL_LANE_GAP * 2, segment.a.y, segment.b.y),
        ),
        segment.a.x,
      );
      const obstacleEntryYValues = obstacleExitXValues.length > 0
        ? sortedUniqueNumbers(
          buildStrictObstacleSideBridgeYs(
            nodes,
            Math.min(...bridgeXValues, segment.a.x),
            Math.max(...obstacleExitXValues, segment.a.x),
          ),
          segment.a.y,
        )
        : [];
      const prioritizedObstacleExitXValues = obstacleExitXValues.length > 0
        ? Array.from(new Set([
          ...obstacleExitXValues.slice(0, 12),
          Math.min(...obstacleExitXValues),
          Math.max(...obstacleExitXValues),
        ]))
        : [];
      for (const bridgeX of bridgeXValues.slice(0, 4)) {
        for (const laneY of obstacleEntryYValues.slice(0, 8)) {
          for (const laneX of prioritizedObstacleExitXValues) {
            appendCandidate([
              ...path.slice(0, segment.segIdx),
              { x: bridgeX, y: segment.a.y },
              { x: bridgeX, y: laneY },
              { x: laneX, y: laneY },
              { x: laneX, y: segment.b.y },
              ...path.slice(segment.segIdx + 2),
            ]);
          }
        }
      }
      for (const node of nodes) {
        if (isDisplayContainerNode(node)) continue;
        const rect = getDisplayNodeRect(node);
        if (!rect) continue;
        if (
          !rangesOverlapWithMargin(segment.a.y, segment.b.y, rect.y, rect.y + rect.height, 64)
          && !rangesOverlapWithMargin(minX, maxX, rect.x, rect.x + rect.width, 64)
        ) continue;
        const nodeYValues = sortedUniqueNumbers(
          STRICT_OBSTACLE_SIDE_CLEARANCES.flatMap(clearance => [
            rect.y - clearance,
            rect.y + rect.height + clearance,
          ]),
          segment.a.y,
        );
        const nodeXValues = sortedUniqueNumbers(
          STRICT_OBSTACLE_SIDE_CLEARANCES.flatMap(clearance => [
            rect.x - clearance,
            rect.x + rect.width + clearance,
          ]),
          segment.a.x,
        );
        for (const bridgeX of bridgeXValues.slice(0, 4)) {
          for (const laneY of nodeYValues.slice(0, 8)) {
            for (const laneX of nodeXValues.slice(0, 8)) {
              appendCandidate([
                ...path.slice(0, segment.segIdx),
                { x: bridgeX, y: segment.a.y },
                { x: bridgeX, y: laneY },
                { x: laneX, y: laneY },
                { x: laneX, y: segment.b.y },
                ...path.slice(segment.segIdx + 2),
              ]);
            }
          }
        }
      }
    }
    return uniqueCandidates();
  }

  const minY = Math.min(other.a.y, other.b.y);
  const maxY = Math.max(other.a.y, other.b.y);
  let avoidMinX = other.a.x;
  let avoidMaxX = other.a.x;
  if (otherPath) {
    for (const adjacentIndex of [other.segIdx - 1, other.segIdx + 1]) {
      const adjacentStart = otherPath[adjacentIndex];
      const adjacentEnd = otherPath[adjacentIndex + 1];
      if (!adjacentStart || !adjacentEnd) continue;
      if (displayAxisOf(adjacentStart, adjacentEnd) !== 'h') continue;
      avoidMinX = Math.min(avoidMinX, adjacentStart.x, adjacentEnd.x);
      avoidMaxX = Math.max(avoidMaxX, adjacentStart.x, adjacentEnd.x);
    }
  }
  const laneValues = sortedUniqueNumbers([
    minY - MIN_DISPLAY_ENDPOINT_STUB,
    maxY + MIN_DISPLAY_ENDPOINT_STUB,
    minY - RESIDUAL_PARALLEL_LANE_GAP,
    maxY + RESIDUAL_PARALLEL_LANE_GAP,
    minY - RESIDUAL_PARALLEL_LANE_GAP * 2,
    maxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
  ], segment.a.y);
  for (const laneY of laneValues.slice(0, 6)) {
    if (laneY > minY + 1 && laneY < maxY - 1) continue;
    const shifted = shiftDisplayInternalSegment(path, segment.segIdx, 'h', laneY);
    if (shifted) candidates.push(shifted);
  }
  const previousAxis = displayAxisOf(path[segment.segIdx - 1], path[segment.segIdx]);
  if (previousAxis === 'v') {
    const entryXValues = sortedUniqueNumbers([
      avoidMinX - MIN_DISPLAY_ENDPOINT_STUB,
      avoidMaxX + MIN_DISPLAY_ENDPOINT_STUB,
      avoidMinX - RESIDUAL_PARALLEL_LANE_GAP,
      avoidMaxX + RESIDUAL_PARALLEL_LANE_GAP,
      avoidMinX - RESIDUAL_PARALLEL_LANE_GAP * 2,
      avoidMaxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], segment.a.x);
    for (const laneX of entryXValues.slice(0, 6)) {
      for (const laneY of laneValues.slice(0, 6)) {
        if (laneY > minY + 1 && laneY < maxY - 1) continue;
        const shifted = path.map(point => ({ ...point }));
        shifted[segment.segIdx - 1].x = laneX;
        shifted[segment.segIdx].x = laneX;
        shifted[segment.segIdx].y = laneY;
        shifted[segment.segIdx + 1].y = laneY;
        appendCandidate(shifted);
      }
    }
    const bridgeYValues = sortedUniqueNumbers([
      minY - MIN_DISPLAY_ENDPOINT_STUB,
      minY - RESIDUAL_PARALLEL_LANE_GAP,
      minY - RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], segment.a.y);
    const exitYValues = sortedUniqueNumbers([
      maxY + RESIDUAL_PARALLEL_LANE_GAP,
      maxY + MIN_DISPLAY_ENDPOINT_STUB,
      maxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], segment.a.y);
    for (const bridgeY of bridgeYValues.slice(0, 4)) {
      for (const laneX of entryXValues.slice(0, 4)) {
        for (const laneY of exitYValues.slice(0, 4)) {
          appendCandidate([
            ...path.slice(0, segment.segIdx),
            { x: segment.a.x, y: bridgeY },
            { x: laneX, y: bridgeY },
            { x: laneX, y: laneY },
            { x: segment.b.x, y: laneY },
            ...path.slice(segment.segIdx + 2),
          ]);
        }
      }
    }
    const obstacleExitYValues = sortedUniqueNumbers(
      buildStrictObstacleSideBridgeYs(
        nodes,
        Math.min(avoidMinX - RESIDUAL_PARALLEL_LANE_GAP * 2, segment.a.x, segment.b.x),
        Math.max(avoidMaxX + RESIDUAL_PARALLEL_LANE_GAP * 2, segment.a.x, segment.b.x),
      ),
      segment.a.y,
    );
    const obstacleEntryXValues = obstacleExitYValues.length > 0
      ? sortedUniqueNumbers(
        buildStrictObstacleSideBridgeXs(
          nodes,
          Math.min(...bridgeYValues, segment.a.y),
          Math.max(...obstacleExitYValues, segment.a.y),
        ),
        segment.a.x,
      )
      : [];
    const prioritizedObstacleExitYValues = obstacleExitYValues.length > 0
      ? Array.from(new Set([
        ...obstacleExitYValues.slice(0, 12),
        Math.min(...obstacleExitYValues),
        Math.max(...obstacleExitYValues),
      ]))
      : [];
    for (const bridgeY of bridgeYValues.slice(0, 4)) {
      for (const laneX of obstacleEntryXValues.slice(0, 8)) {
        for (const laneY of prioritizedObstacleExitYValues) {
          appendCandidate([
            ...path.slice(0, segment.segIdx),
            { x: segment.a.x, y: bridgeY },
            { x: laneX, y: bridgeY },
            { x: laneX, y: laneY },
            { x: segment.b.x, y: laneY },
            ...path.slice(segment.segIdx + 2),
          ]);
        }
      }
    }
    for (const node of nodes) {
      if (isDisplayContainerNode(node)) continue;
      const rect = getDisplayNodeRect(node);
      if (!rect) continue;
      if (
        !rangesOverlapWithMargin(segment.a.x, segment.b.x, rect.x, rect.x + rect.width, 64)
        && !rangesOverlapWithMargin(minY, maxY, rect.y, rect.y + rect.height, 64)
      ) continue;
      const nodeXValues = sortedUniqueNumbers(
        STRICT_OBSTACLE_SIDE_CLEARANCES.flatMap(clearance => [
          rect.x - clearance,
          rect.x + rect.width + clearance,
        ]),
        segment.a.x,
      );
      const nodeYValues = sortedUniqueNumbers(
        STRICT_OBSTACLE_SIDE_CLEARANCES.flatMap(clearance => [
          rect.y - clearance,
          rect.y + rect.height + clearance,
        ]),
        segment.a.y,
      );
      for (const bridgeY of bridgeYValues.slice(0, 4)) {
        for (const laneX of nodeXValues.slice(0, 8)) {
          for (const laneY of nodeYValues.slice(0, 8)) {
            appendCandidate([
              ...path.slice(0, segment.segIdx),
              { x: segment.a.x, y: bridgeY },
              { x: laneX, y: bridgeY },
              { x: laneX, y: laneY },
              { x: segment.b.x, y: laneY },
              ...path.slice(segment.segIdx + 2),
            ]);
          }
        }
      }
    }
  }
  return uniqueCandidates();
};

export const buildStrictCompanionAroundTerminalCandidates = (
  path: DisplayPoint[],
  segment: StrictCrossingSegmentLike,
  terminal: StrictCrossingSegmentLike,
  nodes: Node[],
): DisplayPoint[][] => {
  if (path.length < 5 || segment.axis === terminal.axis) return [];
  const segmentIsEndpoint = segment.segIdx === 0 || segment.segIdx === path.length - 2;
  if (segmentIsEndpoint) return [];

  const before = path[segment.segIdx - 1];
  const start = path[segment.segIdx];
  const end = path[segment.segIdx + 1];
  const after = path[segment.segIdx + 2];
  if (!before || !start || !end || !after) return [];

  const candidates: DisplayPoint[][] = [];
  if (terminal.axis === 'v' && segment.axis === 'h') {
    if (displayAxisOf(before, start) !== 'v' || displayAxisOf(end, after) !== 'v') return [];
    const minTerminalY = Math.min(terminal.a.y, terminal.b.y);
    const maxTerminalY = Math.max(terminal.a.y, terminal.b.y);
    const minSegmentX = Math.min(start.x, end.x);
    const maxSegmentX = Math.max(start.x, end.x);
    for (const clearance of STRICT_TERMINAL_ESCAPE_CLEARANCES) {
      for (const laneY of [minTerminalY - clearance, maxTerminalY + clearance]) {
        const bridgeXs = [
          ...buildStrictObstacleSideBridgeXs(nodes, laneY, after.y),
          terminal.a.x - clearance,
          terminal.a.x + clearance,
          minSegmentX - clearance,
          maxSegmentX + clearance,
        ];
        for (const bridgeX of bridgeXs) {
          candidates.push(compactOrthogonalPath([
            ...path.slice(0, segment.segIdx),
            { x: start.x, y: laneY },
            { x: bridgeX, y: laneY },
            { x: bridgeX, y: after.y },
            ...path.slice(segment.segIdx + 3),
          ]));
        }
      }
    }
  } else if (terminal.axis === 'h' && segment.axis === 'v') {
    if (displayAxisOf(before, start) !== 'h' || displayAxisOf(end, after) !== 'h') return [];
    const minTerminalX = Math.min(terminal.a.x, terminal.b.x);
    const maxTerminalX = Math.max(terminal.a.x, terminal.b.x);
    const minSegmentY = Math.min(start.y, end.y);
    const maxSegmentY = Math.max(start.y, end.y);
    for (const clearance of STRICT_TERMINAL_ESCAPE_CLEARANCES) {
      for (const laneX of [minTerminalX - clearance, maxTerminalX + clearance]) {
        const bridgeYs = [
          ...buildStrictObstacleSideBridgeYs(nodes, laneX, after.x),
          terminal.a.y - clearance,
          terminal.a.y + clearance,
          minSegmentY - clearance,
          maxSegmentY + clearance,
        ];
        for (const bridgeY of bridgeYs) {
          candidates.push(compactOrthogonalPath([
            ...path.slice(0, segment.segIdx),
            { x: laneX, y: start.y },
            { x: laneX, y: bridgeY },
            { x: after.x, y: bridgeY },
            ...path.slice(segment.segIdx + 3),
          ]));
        }
      }
    }
  }

  const seen = new Set<string>();
  return candidates
    .filter(candidate => candidate.length >= 2 && candidate.every(isFinitePoint))
    .filter((candidate) => {
      const key = candidate.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};
