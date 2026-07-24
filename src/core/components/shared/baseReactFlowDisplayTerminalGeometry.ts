import type { Edge, Node } from '@xyflow/react';

import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  extractDisplaySegments,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  sortedUniqueNumbers,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';

export const MIN_DISPLAY_ENDPOINT_STUB = 48;
const MAX_TERMINAL_STUB_NUMERIC_DRIFT = 2;

export const buildShortTerminalStaircaseTranslationCandidate = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint[] | null => {
  if (path.length < 4) return null;
  const oriented = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const terminal = oriented[0];
  const adjacent = oriented[1];
  if (!terminal || !adjacent) return null;
  const horizontalTerminal = side === 'left' || side === 'right';
  const expectedAxis = horizontalTerminal ? 'h' : 'v';
  if (displayAxisOf(terminal, adjacent) !== expectedAxis) return null;
  const outwardDirection = side === 'right' || side === 'bottom' ? 1 : -1;
  const axisCoordinate = (point: DisplayPoint): number => (
    horizontalTerminal ? point.x : point.y
  );
  const outwardSpan = (axisCoordinate(adjacent) - axisCoordinate(terminal)) * outwardDirection;
  const shortfall = MIN_DISPLAY_ENDPOINT_STUB - outwardSpan;
  if (outwardSpan <= 0 || shortfall <= 0 || shortfall > MAX_TERMINAL_STUB_NUMERIC_DRIFT) return null;

  let shiftedEndIndex = 1;
  while (shiftedEndIndex < oriented.length - 1) {
    const current = oriented[shiftedEndIndex];
    const next = oriented[shiftedEndIndex + 1];
    if (displayAxisOf(current, next) !== expectedAxis) {
      shiftedEndIndex += 1;
      continue;
    }
    const shiftedCurrentCoordinate = axisCoordinate(current) + outwardDirection * shortfall;
    const adjustedBoundaryLength = Math.abs(axisCoordinate(next) - shiftedCurrentCoordinate);
    if (adjustedBoundaryLength >= RESIDUAL_PARALLEL_LANE_GAP) break;
    shiftedEndIndex += 1;
  }
  if (shiftedEndIndex >= oriented.length - 1) return null;

  const translated = oriented.map((point, index) => {
    if (index < 1 || index > shiftedEndIndex) return point;
    return horizontalTerminal
      ? { x: point.x + outwardDirection * shortfall, y: point.y }
      : { x: point.x, y: point.y + outwardDirection * shortfall };
  });
  const candidate = compactOrthogonalPath(role === 'source' ? translated : [...translated].reverse());
  return candidate.length >= 2 ? candidate : null;
};
export const adaptiveDetachedTerminalStub = (
  edges: Edge[],
  nodes: Node[],
  edgeIndex: number,
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): number => {
  const oriented = role === 'target' ? path : [...path].reverse();
  const splice = oriented[Math.max(1, oriented.length - 5)];
  if (!splice) return MIN_DISPLAY_ENDPOINT_STUB;
  const endpoint = side === 'left'
    ? { x: rect.x, y: rect.y + rect.height / 2 }
    : side === 'right'
      ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
      : side === 'top'
        ? { x: rect.x + rect.width / 2, y: rect.y }
        : { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  const segments = extractDisplaySegments(edges).filter(segment => segment.edgeIndex !== edgeIndex);
  const obstacles = buildDisplayRoutingObstacles(nodes);
  const horizontalTerminal = side === 'left' || side === 'right';
  const boundary = side === 'left'
    ? rect.x
    : side === 'right'
      ? rect.x + rect.width
      : side === 'top'
        ? rect.y
        : rect.y + rect.height;
  let lane = side === 'left' || side === 'top'
    ? boundary - MIN_DISPLAY_ENDPOINT_STUB
    : boundary + MIN_DISPLAY_ENDPOINT_STUB;
  const spanStart = horizontalTerminal ? splice.y : splice.x;
  const spanEnd = horizontalTerminal ? endpoint.y : endpoint.x;
  const spanMin = Math.min(spanStart, spanEnd);
  const spanMax = Math.max(spanStart, spanEnd);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let nextLane = lane;
    for (const segment of segments) {
      if (horizontalTerminal && segment.axis === 'h') {
        if (segment.a.y <= spanMin + 1 || segment.a.y >= spanMax - 1) continue;
        const min = Math.min(segment.a.x, segment.b.x);
        const max = Math.max(segment.a.x, segment.b.x);
        if (lane <= min + 1 || lane >= max - 1) continue;
        nextLane = side === 'right'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      }
      if (!horizontalTerminal && segment.axis === 'v') {
        if (segment.a.x <= spanMin + 1 || segment.a.x >= spanMax - 1) continue;
        const min = Math.min(segment.a.y, segment.b.y);
        const max = Math.max(segment.a.y, segment.b.y);
        if (lane <= min + 1 || lane >= max - 1) continue;
        nextLane = side === 'bottom'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      }
    }
    for (const [nodeId, obstacle] of obstacles) {
      const edge = edges[edgeIndex];
      if (!edge || nodeId === edge.source || nodeId === edge.target) continue;
      if (horizontalTerminal) {
        if (obstacle.y + obstacle.height <= spanMin || obstacle.y >= spanMax) continue;
        const min = obstacle.x - OBSTACLE_REPAIR_NODE_PADDING;
        const max = obstacle.x + obstacle.width + OBSTACLE_REPAIR_NODE_PADDING;
        if (lane <= min || lane >= max) continue;
        nextLane = side === 'right'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      } else {
        if (obstacle.x + obstacle.width <= spanMin || obstacle.x >= spanMax) continue;
        const min = obstacle.y - OBSTACLE_REPAIR_NODE_PADDING;
        const max = obstacle.y + obstacle.height + OBSTACLE_REPAIR_NODE_PADDING;
        if (lane <= min || lane >= max) continue;
        nextLane = side === 'bottom'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      }
    }
    if (Math.abs(nextLane - lane) <= 0.5) break;
    lane = nextLane;
  }
  return Math.max(MIN_DISPLAY_ENDPOINT_STUB, Math.abs(lane - boundary));
};

export const detachedTerminalConnectorLanes = (
  edge: Edge,
  nodes: Node[],
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
  stubLength: number,
): number[] => {
  const oriented = role === 'target' ? path : [...path].reverse();
  const splice = oriented[Math.max(1, oriented.length - 5)];
  if (!splice) return [];
  const horizontalTerminal = side === 'left' || side === 'right';
  const endpointCoordinate = horizontalTerminal
    ? rect.y + rect.height / 2
    : rect.x + rect.width / 2;
  const outerCoordinate = side === 'left'
    ? rect.x - stubLength
    : side === 'right'
      ? rect.x + rect.width + stubLength
      : side === 'top'
        ? rect.y - stubLength
        : rect.y + rect.height + stubLength;
  const directCoordinate = horizontalTerminal ? splice.y : splice.x;
  const mainStart = horizontalTerminal ? splice.x : splice.y;
  const mainMin = Math.min(mainStart, outerCoordinate);
  const mainMax = Math.max(mainStart, outerCoordinate);
  let before: number | null = null;
  let after: number | null = null;

  for (const [nodeId, obstacle] of buildDisplayRoutingObstacles(nodes)) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    if (horizontalTerminal) {
      if (
        directCoordinate <= obstacle.y - OBSTACLE_REPAIR_NODE_PADDING
        || directCoordinate >= obstacle.y + obstacle.height + OBSTACLE_REPAIR_NODE_PADDING
        || obstacle.x + obstacle.width <= mainMin
        || obstacle.x >= mainMax
      ) continue;
      const upper = obstacle.y - OBSTACLE_REPAIR_NODE_PADDING - MIN_DISPLAY_ENDPOINT_STUB;
      const lower = obstacle.y + obstacle.height + OBSTACLE_REPAIR_NODE_PADDING + MIN_DISPLAY_ENDPOINT_STUB;
      before = before === null ? upper : Math.min(before, upper);
      after = after === null ? lower : Math.max(after, lower);
    } else {
      if (
        directCoordinate <= obstacle.x - OBSTACLE_REPAIR_NODE_PADDING
        || directCoordinate >= obstacle.x + obstacle.width + OBSTACLE_REPAIR_NODE_PADDING
        || obstacle.y + obstacle.height <= mainMin
        || obstacle.y >= mainMax
      ) continue;
      const left = obstacle.x - OBSTACLE_REPAIR_NODE_PADDING - MIN_DISPLAY_ENDPOINT_STUB;
      const right = obstacle.x + obstacle.width + OBSTACLE_REPAIR_NODE_PADDING + MIN_DISPLAY_ENDPOINT_STUB;
      before = before === null ? left : Math.min(before, left);
      after = after === null ? right : Math.max(after, right);
    }
  }
  const towardEndpoint = Math.sign(endpointCoordinate - directCoordinate);
  return [before, after]
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((first, second) => {
      const firstToward = Math.sign(first - directCoordinate) === towardEndpoint ? 0 : 1;
      const secondToward = Math.sign(second - directCoordinate) === towardEndpoint ? 0 : 1;
      return firstToward - secondToward
        || Math.abs(first - directCoordinate) - Math.abs(second - directCoordinate);
    });
};

export const buildDeclaredTerminalInsetNudgeCandidates = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint[][] => {
  if (path.length < 2) return [];
  const oriented = role === 'source' ? path : [...path].reverse();
  const terminal = oriented[0];
  const horizontalSide = side === 'left' || side === 'right';
  const tangentMinimum = horizontalSide ? rect.y : rect.x;
  const tangentMaximum = tangentMinimum + (horizontalSide ? rect.height : rect.width);
  const terminalTangent = horizontalSide ? terminal.y : terminal.x;
  const tangentValues = sortedUniqueNumbers([
    terminalTangent - 48,
    terminalTangent - 24,
    terminalTangent + 24,
    terminalTangent + 48,
    tangentMinimum + 24,
    tangentMinimum + 48,
    tangentMaximum - 48,
    tangentMaximum - 24,
  ], terminalTangent).filter(value => value >= tangentMinimum + 16 && value <= tangentMaximum - 16);
  if (tangentValues.length === 0) return [];

  const boundary = side === 'left'
    ? rect.x
    : side === 'right'
      ? rect.x + rect.width
      : side === 'top'
        ? rect.y
        : rect.y + rect.height;
  const outwardDirection = side === 'right' || side === 'bottom' ? 1 : -1;
  const axisCoordinate = (point: DisplayPoint): number => (horizontalSide ? point.x : point.y);
  let spliceIndex = oriented.slice(1, 5).findIndex(point => (
    (axisCoordinate(point) - boundary) * outwardDirection >= MIN_DISPLAY_ENDPOINT_STUB - 1
  ));
  spliceIndex = spliceIndex < 0 ? 1 : spliceIndex + 1;
  const splice = oriented[spliceIndex];
  if (!splice) return [];
  const spliceAxisCoordinate = axisCoordinate(splice);
  const outwardCoordinate = (spliceAxisCoordinate - boundary) * outwardDirection
    >= MIN_DISPLAY_ENDPOINT_STUB - 1
    ? spliceAxisCoordinate
    : boundary + outwardDirection * MIN_DISPLAY_ENDPOINT_STUB;

  return tangentValues.map((tangent): DisplayPoint[] => {
    const endpoint = horizontalSide
      ? { x: boundary, y: tangent }
      : { x: tangent, y: boundary };
    const stub = horizontalSide
      ? { x: outwardCoordinate, y: tangent }
      : { x: tangent, y: outwardCoordinate };
    const bridge = horizontalSide
      ? { x: outwardCoordinate, y: splice.y }
      : { x: splice.x, y: outwardCoordinate };
    const candidate = compactOrthogonalPath([
      endpoint,
      stub,
      bridge,
      splice,
      ...oriented.slice(spliceIndex + 1),
    ]);
    return role === 'source' ? candidate : [...candidate].reverse();
  });
};

export const inferTerminalGeometrySide = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
): 'top' | 'bottom' | 'left' | 'right' | null => {
  if (path.length < 2) return null;
  const oriented = role === 'source' ? path : [...path].reverse();
  const [terminal, adjacent, next] = oriented;
  if (!terminal || !adjacent) return null;
  const candidates = (['top', 'bottom', 'left', 'right'] as const)
    .map((side) => {
      const horizontalSide = side === 'left' || side === 'right';
      const onBoundary = side === 'top'
        ? Math.abs(terminal.y - rect.y) <= 3
          && terminal.x >= rect.x - 3 && terminal.x <= rect.x + rect.width + 3
        : side === 'bottom'
          ? Math.abs(terminal.y - (rect.y + rect.height)) <= 3
            && terminal.x >= rect.x - 3 && terminal.x <= rect.x + rect.width + 3
          : side === 'left'
            ? Math.abs(terminal.x - rect.x) <= 3
              && terminal.y >= rect.y - 3 && terminal.y <= rect.y + rect.height + 3
            : Math.abs(terminal.x - (rect.x + rect.width)) <= 3
              && terminal.y >= rect.y - 3 && terminal.y <= rect.y + rect.height + 3;
      if (!onBoundary) return null;
      const expectedAxis = horizontalSide ? 'h' : 'v';
      const firstAxis = displayAxisOf(terminal, adjacent);
      const outward = (point: DisplayPoint): boolean => (
        side === 'left'
          ? point.x < terminal.x - 1
          : side === 'right'
            ? point.x > terminal.x + 1
            : side === 'top'
              ? point.y < terminal.y - 1
              : point.y > terminal.y + 1
      );
      if (firstAxis === expectedAxis && outward(adjacent)) return { side, score: 0 };
      if (!next || !firstAxis || firstAxis === expectedAxis) return null;
      const adjacentStaysOnBoundary = side === 'top'
        ? Math.abs(adjacent.y - rect.y) <= 3
        : side === 'bottom'
          ? Math.abs(adjacent.y - (rect.y + rect.height)) <= 3
          : side === 'left'
            ? Math.abs(adjacent.x - rect.x) <= 3
            : Math.abs(adjacent.x - (rect.x + rect.width)) <= 3;
      if (!adjacentStaysOnBoundary || displayAxisOf(adjacent, next) !== expectedAxis) return null;
      return outward(next) ? { side, score: 1 } : null;
    })
    .filter((candidate): candidate is {
      side: 'top' | 'bottom' | 'left' | 'right';
      score: number;
    } => Boolean(candidate))
    .sort((first, second) => first.score - second.score);
  return candidates[0]?.side ?? null;
};
