import type { Edge, Node } from '@xyflow/react';
import { createSingleMoverStrictCrossingCounter } from '../../strategies/shared/edgeSingleMoverStrictCrossingCounter';

import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  extractDisplaySegments,
  getDisplayComputedPath,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  segmentDisplayLength,
  sortedUniqueNumbers,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  appendEndSideStepCandidates,
  MIN_DISPLAY_ENDPOINT_STUB,
} from './baseReactFlowDisplayEndpointEndCandidates';

export { MIN_DISPLAY_ENDPOINT_STUB } from './baseReactFlowDisplayEndpointEndCandidates';

type DisplayAxis = NonNullable<ReturnType<typeof displayAxisOf>>;
type DisplaySegment = ReturnType<typeof extractDisplaySegments>[number];
type DisplayObstacleRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type CandidateAppender = (candidate: DisplayPoint[], priority?: boolean) => void;

const appendHorizontalStartCandidates = (
  path: DisplayPoint[],
  otherSegments: DisplaySegment[],
  obstacleRects: DisplayObstacleRect[],
  append: CandidateAppender,
  start: DisplayPoint,
  stubEnd: DisplayPoint,
  bridgeEnd: DisplayPoint,
  next: DisplayPoint,
  stubAxis: DisplayAxis,
  bridgeAxis: DisplayAxis,
): void => {
  const direction = Math.sign(stubEnd.x - start.x) || Math.sign(next.x - start.x) || 1;
  for (const sideDirection of [-direction, direction]) {
    for (const distance of [MIN_DISPLAY_ENDPOINT_STUB, MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP, 96]) {
      const sideX = start.x + sideDirection * distance;
      append([
        start,
        { x: sideX, y: start.y },
        { x: sideX, y: bridgeEnd.y },
        next,
        ...path.slice(4),
      ]);
    }
  }
  const bridgeDirection = Math.sign(bridgeEnd.y - start.y);
  const bridgeDistance = Math.abs(bridgeEnd.y - start.y);
  if (bridgeDirection !== 0 && bridgeDistance > MIN_DISPLAY_ENDPOINT_STUB + OBSTACLE_REPAIR_NODE_PADDING) {
    const bypassYValues = [
      start.y + bridgeDirection * MIN_DISPLAY_ENDPOINT_STUB,
      start.y + bridgeDirection * Math.max(MIN_DISPLAY_ENDPOINT_STUB, bridgeDistance - RESIDUAL_PARALLEL_LANE_GAP),
    ];
    for (const sideDirection of [-direction, direction]) {
      for (const distance of [MIN_DISPLAY_ENDPOINT_STUB, MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP]) {
        const sideX = start.x + sideDirection * distance;
        for (const bypassY of sortedUniqueNumbers(bypassYValues, start.y + bridgeDirection * MIN_DISPLAY_ENDPOINT_STUB).slice(0, 2)) {
          append([
            start,
            { x: sideX, y: start.y },
            { x: sideX, y: bypassY },
            { x: stubEnd.x, y: bypassY },
            bridgeEnd,
            next,
            ...path.slice(4),
          ]);
        }
      }
    }
  }
  const minX = Math.min(start.x, next.x);
  const maxX = Math.max(start.x, next.x);
  const bridgeXValues = sortedUniqueNumbers(
    [
      start.x + direction * MIN_DISPLAY_ENDPOINT_STUB,
      start.x + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP),
      start.x + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP * 2),
      stubEnd.x + direction * RESIDUAL_PARALLEL_LANE_GAP,
      stubEnd.x + direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
      next.x - direction * MIN_DISPLAY_ENDPOINT_STUB,
      ...otherSegments
        .filter(segment => segment.axis === 'v')
        .filter(segment => segment.a.x > minX + 1 && segment.a.x < maxX - 1)
        .flatMap(segment => [
          segment.a.x - direction * RESIDUAL_PARALLEL_LANE_GAP,
          segment.a.x + direction * RESIDUAL_PARALLEL_LANE_GAP,
          segment.a.x - direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
          segment.a.x + direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
        ]),
    ],
    stubEnd.x,
  );
  for (const bridgeX of bridgeXValues.slice(0, 14)) {
    if (bridgeX <= minX + 1 || bridgeX >= maxX - 1) continue;
    if (Math.abs(bridgeX - start.x) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      start,
      { x: bridgeX, y: start.y },
      { x: bridgeX, y: bridgeEnd.y },
      next,
      ...path.slice(4),
    ]);
  }
  const continuation = path[4];
  const continuationAxis = continuation ? displayAxisOf(next, continuation) : null;
  if (continuation && continuationAxis === bridgeAxis) {
    const join = path[5] && displayAxisOf(continuation, path[5]) === stubAxis ? path[5] : continuation;
    const suffixStart = join === path[5] ? 6 : 5;
    const endpointYDirection = Math.sign(path[path.length - 1].y - start.y);
    const topObstacleLanes = obstacleRects.flatMap(rect => [
      rect.y - OBSTACLE_REPAIR_NODE_PADDING - 1,
      rect.y - RESIDUAL_PARALLEL_LANE_GAP,
    ]);
    const bottomObstacleLanes = obstacleRects.flatMap(rect => [
      rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + 1,
      rect.y + rect.height + RESIDUAL_PARALLEL_LANE_GAP,
    ]);
    const bypassLaneValues = [
      ...(endpointYDirection < 0 ? topObstacleLanes : bottomObstacleLanes),
      join.y,
      continuation.y,
      ...(endpointYDirection < 0 ? bottomObstacleLanes : topObstacleLanes),
    ];
    for (const sideDirection of [-direction, direction]) {
      for (const distance of [
        MIN_DISPLAY_ENDPOINT_STUB,
        MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP,
        MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP * 2,
        128,
        160,
        192,
        224,
        256,
        320,
      ]) {
        const sideX = start.x + sideDirection * distance;
        const canBuildOuterEscape = distance === MIN_DISPLAY_ENDPOINT_STUB
          && sideDirection === direction;
        const minLaneX = Math.min(sideX, join.x);
        const maxLaneX = Math.max(sideX, join.x);
        const verticalBlockerLanes = otherSegments
          .filter(segment => segment.axis === 'v')
          .filter(segment => segment.a.x > minLaneX + 1 && segment.a.x < maxLaneX - 1)
          .flatMap((segment) => {
            const minBlockY = Math.min(segment.a.y, segment.b.y);
            const maxBlockY = Math.max(segment.a.y, segment.b.y);
            return endpointYDirection < 0
              ? [
                minBlockY - OBSTACLE_REPAIR_NODE_PADDING - 1,
                minBlockY - RESIDUAL_PARALLEL_LANE_GAP,
                minBlockY - MIN_DISPLAY_ENDPOINT_STUB,
              ]
              : [
                maxBlockY + OBSTACLE_REPAIR_NODE_PADDING + 1,
                maxBlockY + RESIDUAL_PARALLEL_LANE_GAP,
                maxBlockY + MIN_DISPLAY_ENDPOINT_STUB,
              ];
          });
        const escapeMinY = Math.min(start.y, join.y, continuation.y);
        const escapeMaxY = Math.max(start.y, join.y, continuation.y);
        const horizontalEscapeLaneValues = canBuildOuterEscape
          ? otherSegments
            .filter(segment => segment.axis === 'h')
            .filter(segment => segment.a.y > escapeMinY + 1 && segment.a.y < escapeMaxY - 1)
            .filter((segment) => {
              const minBlockX = Math.min(segment.a.x, segment.b.x);
              const maxBlockX = Math.max(segment.a.x, segment.b.x);
              return sideX > minBlockX + 1 && sideX < maxBlockX - 1;
            })
            .flatMap(segment => (
              endpointYDirection < 0
                ? [
                  segment.a.y - OBSTACLE_REPAIR_NODE_PADDING - 1,
                  segment.a.y - RESIDUAL_PARALLEL_LANE_GAP,
                ]
                : [
                  segment.a.y + OBSTACLE_REPAIR_NODE_PADDING + 1,
                  segment.a.y + RESIDUAL_PARALLEL_LANE_GAP,
                ]
            ))
          : [];
        const orderedLaneYValues = [...new Set(
          [
            ...horizontalEscapeLaneValues,
            ...verticalBlockerLanes,
            ...bypassLaneValues,
          ]
            .filter(Number.isFinite)
            .map(value => Math.round(value)),
        )].slice(0, 8);
        for (const laneY of orderedLaneYValues) {
          append([
            start,
            { x: sideX, y: start.y },
            { x: sideX, y: laneY },
            { x: join.x, y: laneY },
            ...path.slice(suffixStart),
          ]);

          if (canBuildOuterEscape) {
            const directMinY = Math.min(start.y, laneY);
            const directMaxY = Math.max(start.y, laneY);
            const horizontalBlockers = otherSegments
              .filter(segment => segment.axis === 'h')
              .filter(segment => segment.a.y > directMinY + 1 && segment.a.y < directMaxY - 1)
              .filter((segment) => {
                const minBlockX = Math.min(segment.a.x, segment.b.x);
                const maxBlockX = Math.max(segment.a.x, segment.b.x);
                return sideX > minBlockX + 1 && sideX < maxBlockX - 1;
              });
            if (horizontalBlockers.length === 0) continue;
            const blockerEdges = horizontalBlockers.flatMap(segment => [segment.a.x, segment.b.x]);
            let outerX = sideDirection > 0
              ? Math.max(...blockerEdges) + RESIDUAL_PARALLEL_LANE_GAP
              : Math.min(...blockerEdges) - RESIDUAL_PARALLEL_LANE_GAP;
            const minCandidateY = Math.min(start.y, laneY);
            const maxCandidateY = Math.max(start.y, laneY);
            const nodeBlockers = obstacleRects
              .filter((rect) => {
                const top = rect.y - OBSTACLE_REPAIR_NODE_PADDING;
                const bottom = rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING;
                return bottom > minCandidateY + 1 && top < maxCandidateY - 1;
              })
              .filter((rect) => (
                sideDirection > 0
                  ? rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING > sideX
                    && rect.x - OBSTACLE_REPAIR_NODE_PADDING < outerX
                  : rect.x - OBSTACLE_REPAIR_NODE_PADDING < sideX
                    && rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING > outerX
              ));
            if (nodeBlockers.length > 0) {
              outerX = sideDirection > 0
                ? Math.max(
                  outerX,
                  ...nodeBlockers.map(rect => rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP),
                )
                : Math.min(
                  outerX,
                  ...nodeBlockers.map(rect => rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP),
                );
            }
            let escapeY = start.y - endpointYDirection * RESIDUAL_PARALLEL_LANE_GAP;
            const minEscapeX = Math.min(sideX, outerX);
            const maxEscapeX = Math.max(sideX, outerX);
            const escapeNodeBlockers = obstacleRects
              .filter((rect) => {
                const left = rect.x - OBSTACLE_REPAIR_NODE_PADDING;
                const right = rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING;
                return right > minEscapeX + 1 && left < maxEscapeX - 1;
              })
              .filter((rect) => {
                const top = rect.y - OBSTACLE_REPAIR_NODE_PADDING;
                const bottom = rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING;
                return escapeY > top + 1 && escapeY < bottom - 1;
              });
            if (escapeNodeBlockers.length > 0) {
              outerX = sideDirection > 0
                ? Math.max(
                  outerX,
                  ...escapeNodeBlockers.map(rect => rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP),
                )
                : Math.min(
                  outerX,
                  ...escapeNodeBlockers.map(rect => rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP),
                );
              escapeY = endpointYDirection < 0
                ? Math.max(
                  escapeY,
                  ...escapeNodeBlockers.map(rect => rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP),
                )
                : Math.min(
                  escapeY,
                  ...escapeNodeBlockers.map(rect => rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP),
                );
            }
            append([
              start,
              { x: sideX, y: start.y },
              { x: sideX, y: escapeY },
              { x: outerX, y: escapeY },
              { x: outerX, y: laneY },
              { x: join.x, y: laneY },
              ...path.slice(suffixStart),
            ], true);
          }
        }
      }
    }
  }
  const laneValues = sortedUniqueNumbers(
    otherSegments
      .filter(segment => segment.axis === 'v')
      .filter(segment => segment.a.x > minX + 1 && segment.a.x < maxX - 1)
      .flatMap(segment => [
        Math.min(segment.a.y, segment.b.y) - OBSTACLE_REPAIR_NODE_PADDING,
        Math.max(segment.a.y, segment.b.y) + OBSTACLE_REPAIR_NODE_PADDING,
        Math.min(segment.a.y, segment.b.y) - RESIDUAL_PARALLEL_LANE_GAP,
        Math.max(segment.a.y, segment.b.y) + RESIDUAL_PARALLEL_LANE_GAP,
      ]),
    bridgeEnd.y,
  );
  for (const laneY of laneValues.slice(0, 12)) {
    if (Math.abs(laneY - start.y) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      start,
      { x: start.x, y: laneY },
      { x: next.x, y: laneY },
      ...path.slice(3),
    ]);
    const suffix = path[4];
    if (!suffix) continue;
    const exitXValues = sortedUniqueNumbers(
      otherSegments
        .filter(segment => segment.axis === 'h')
        .filter(segment => next.x > Math.min(segment.a.x, segment.b.x) + 1)
        .filter(segment => next.x < Math.max(segment.a.x, segment.b.x) - 1)
        .filter(segment => segment.a.y > Math.min(laneY, suffix.y) + 1)
        .filter(segment => segment.a.y < Math.max(laneY, suffix.y) - 1)
        .flatMap(segment => [
          Math.min(segment.a.x, segment.b.x) - RESIDUAL_PARALLEL_LANE_GAP,
          Math.max(segment.a.x, segment.b.x) + RESIDUAL_PARALLEL_LANE_GAP,
          Math.min(segment.a.x, segment.b.x) - RESIDUAL_PARALLEL_LANE_GAP * 2,
          Math.max(segment.a.x, segment.b.x) + RESIDUAL_PARALLEL_LANE_GAP * 2,
        ]),
      next.x,
    );
    for (const exitX of exitXValues.slice(0, 8)) {
      if (Math.abs(exitX - next.x) < MIN_DISPLAY_ENDPOINT_STUB) continue;
      append([
        start,
        { x: start.x, y: laneY },
        { x: exitX, y: laneY },
        { x: exitX, y: suffix.y },
        ...path.slice(4),
      ]);
    }
  }
};

const appendVerticalStartCandidates = (
  path: DisplayPoint[],
  otherSegments: DisplaySegment[],
  obstacleRects: DisplayObstacleRect[],
  append: CandidateAppender,
  start: DisplayPoint,
  stubEnd: DisplayPoint,
  bridgeEnd: DisplayPoint,
  next: DisplayPoint,
  stubAxis: DisplayAxis,
  bridgeAxis: DisplayAxis,
): void => {
  const direction = Math.sign(stubEnd.y - start.y) || Math.sign(next.y - start.y) || 1;
  for (const sideDirection of [-direction, direction]) {
    for (const distance of [MIN_DISPLAY_ENDPOINT_STUB, MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP, 96]) {
      const sideY = start.y + sideDirection * distance;
      append([
        start,
        { x: start.x, y: sideY },
        { x: bridgeEnd.x, y: sideY },
        next,
        ...path.slice(4),
      ]);
    }
  }
  const bridgeDirection = Math.sign(bridgeEnd.x - start.x);
  const bridgeDistance = Math.abs(bridgeEnd.x - start.x);
  if (bridgeDirection !== 0 && bridgeDistance > MIN_DISPLAY_ENDPOINT_STUB + OBSTACLE_REPAIR_NODE_PADDING) {
    const bypassXValues = [
      start.x + bridgeDirection * MIN_DISPLAY_ENDPOINT_STUB,
      start.x + bridgeDirection * Math.max(MIN_DISPLAY_ENDPOINT_STUB, bridgeDistance - RESIDUAL_PARALLEL_LANE_GAP),
    ];
    for (const sideDirection of [-direction, direction]) {
      for (const distance of [MIN_DISPLAY_ENDPOINT_STUB, MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP]) {
        const sideY = start.y + sideDirection * distance;
        for (const bypassX of sortedUniqueNumbers(bypassXValues, start.x + bridgeDirection * MIN_DISPLAY_ENDPOINT_STUB).slice(0, 2)) {
          append([
            start,
            { x: start.x, y: sideY },
            { x: bypassX, y: sideY },
            { x: bypassX, y: stubEnd.y },
            bridgeEnd,
            next,
            ...path.slice(4),
          ]);
        }
      }
    }
  }
  const minY = Math.min(start.y, next.y);
  const maxY = Math.max(start.y, next.y);
  const bridgeYValues = sortedUniqueNumbers(
    [
      start.y + direction * MIN_DISPLAY_ENDPOINT_STUB,
      start.y + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP),
      start.y + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP * 2),
      stubEnd.y + direction * RESIDUAL_PARALLEL_LANE_GAP,
      stubEnd.y + direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
      next.y - direction * MIN_DISPLAY_ENDPOINT_STUB,
      ...otherSegments
        .filter(segment => segment.axis === 'h')
        .filter(segment => segment.a.y > minY + 1 && segment.a.y < maxY - 1)
        .flatMap(segment => [
          segment.a.y - direction * RESIDUAL_PARALLEL_LANE_GAP,
          segment.a.y + direction * RESIDUAL_PARALLEL_LANE_GAP,
          segment.a.y - direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
          segment.a.y + direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
        ]),
    ],
    stubEnd.y,
  );
  for (const bridgeY of bridgeYValues.slice(0, 14)) {
    if (bridgeY <= minY + 1 || bridgeY >= maxY - 1) continue;
    if (Math.abs(bridgeY - start.y) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      start,
      { x: start.x, y: bridgeY },
      { x: bridgeEnd.x, y: bridgeY },
      next,
      ...path.slice(4),
    ]);
  }
  const continuation = path[4];
  const continuationAxis = continuation ? displayAxisOf(next, continuation) : null;
  if (continuation && continuationAxis === bridgeAxis) {
    const join = path[5] && displayAxisOf(continuation, path[5]) === stubAxis ? path[5] : continuation;
    const suffixStart = join === path[5] ? 6 : 5;
    const endpointXDirection = Math.sign(path[path.length - 1].x - start.x);
    const leftObstacleLanes = obstacleRects.flatMap(rect => [
      rect.x - OBSTACLE_REPAIR_NODE_PADDING - 1,
      rect.x - RESIDUAL_PARALLEL_LANE_GAP,
    ]);
    const rightObstacleLanes = obstacleRects.flatMap(rect => [
      rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + 1,
      rect.x + rect.width + RESIDUAL_PARALLEL_LANE_GAP,
    ]);
    const bypassLaneValues = [
      ...(endpointXDirection < 0 ? leftObstacleLanes : rightObstacleLanes),
      join.x,
      continuation.x,
      ...(endpointXDirection < 0 ? rightObstacleLanes : leftObstacleLanes),
    ];
    for (const sideDirection of [-direction, direction]) {
      for (const distance of [
        MIN_DISPLAY_ENDPOINT_STUB,
        MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP,
        MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP * 2,
        128,
        160,
        192,
        224,
        256,
        320,
      ]) {
        const sideY = start.y + sideDirection * distance;
        const minLaneY = Math.min(sideY, join.y);
        const maxLaneY = Math.max(sideY, join.y);
        const horizontalBlockerLanes = otherSegments
          .filter(segment => segment.axis === 'h')
          .filter(segment => segment.a.y > minLaneY + 1 && segment.a.y < maxLaneY - 1)
          .flatMap((segment) => {
            const minBlockX = Math.min(segment.a.x, segment.b.x);
            const maxBlockX = Math.max(segment.a.x, segment.b.x);
            return endpointXDirection < 0
              ? [
                minBlockX - OBSTACLE_REPAIR_NODE_PADDING - 1,
                minBlockX - RESIDUAL_PARALLEL_LANE_GAP,
                minBlockX - MIN_DISPLAY_ENDPOINT_STUB,
              ]
              : [
                maxBlockX + OBSTACLE_REPAIR_NODE_PADDING + 1,
                maxBlockX + RESIDUAL_PARALLEL_LANE_GAP,
                maxBlockX + MIN_DISPLAY_ENDPOINT_STUB,
              ];
          });
        const orderedLaneXValues = [...new Set(
          [
            ...horizontalBlockerLanes,
            ...bypassLaneValues,
          ]
            .filter(Number.isFinite)
            .map(value => Math.round(value)),
        )].slice(0, 8);
        for (const laneX of orderedLaneXValues) {
          append([
            start,
            { x: start.x, y: sideY },
            { x: laneX, y: sideY },
            { x: laneX, y: join.y },
            ...path.slice(suffixStart),
          ]);
        }
      }
    }
  }
  const laneValues = sortedUniqueNumbers(
    otherSegments
      .filter(segment => segment.axis === 'h')
      .filter(segment => segment.a.y > minY + 1 && segment.a.y < maxY - 1)
      .flatMap(segment => [
        Math.min(segment.a.x, segment.b.x) - OBSTACLE_REPAIR_NODE_PADDING,
        Math.max(segment.a.x, segment.b.x) + OBSTACLE_REPAIR_NODE_PADDING,
        Math.min(segment.a.x, segment.b.x) - RESIDUAL_PARALLEL_LANE_GAP,
        Math.max(segment.a.x, segment.b.x) + RESIDUAL_PARALLEL_LANE_GAP,
      ]),
    bridgeEnd.x,
  );
  for (const laneX of laneValues.slice(0, 12)) {
    if (Math.abs(laneX - start.x) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      start,
      { x: laneX, y: start.y },
      { x: laneX, y: next.y },
      ...path.slice(3),
    ]);
    const suffix = path[4];
    if (!suffix) continue;
    const exitYValues = sortedUniqueNumbers(
      otherSegments
        .filter(segment => segment.axis === 'v')
        .filter(segment => next.y > Math.min(segment.a.y, segment.b.y) + 1)
        .filter(segment => next.y < Math.max(segment.a.y, segment.b.y) - 1)
        .filter(segment => segment.a.x > Math.min(laneX, suffix.x) + 1)
        .filter(segment => segment.a.x < Math.max(laneX, suffix.x) - 1)
        .flatMap(segment => [
          Math.min(segment.a.y, segment.b.y) - RESIDUAL_PARALLEL_LANE_GAP,
          Math.max(segment.a.y, segment.b.y) + RESIDUAL_PARALLEL_LANE_GAP,
          Math.min(segment.a.y, segment.b.y) - RESIDUAL_PARALLEL_LANE_GAP * 2,
          Math.max(segment.a.y, segment.b.y) + RESIDUAL_PARALLEL_LANE_GAP * 2,
        ]),
      next.y,
    );
    for (const exitY of exitYValues.slice(0, 8)) {
      if (Math.abs(exitY - next.y) < MIN_DISPLAY_ENDPOINT_STUB) continue;
      append([
        start,
        { x: laneX, y: start.y },
        { x: laneX, y: exitY },
        { x: suffix.x, y: exitY },
        ...path.slice(4),
      ]);
    }
  }
};

const appendStartSideStepCandidates = (
  path: DisplayPoint[],
  otherSegments: DisplaySegment[],
  obstacleRects: DisplayObstacleRect[],
  append: CandidateAppender,
): void => {
  const start = path[0];
  const stubEnd = path[1];
  const bridgeEnd = path[2];
  const next = path[3];
  const stubAxis = displayAxisOf(start, stubEnd);
  const bridgeAxis = displayAxisOf(stubEnd, bridgeEnd);
  const nextAxis = displayAxisOf(bridgeEnd, next);
  if (!stubAxis || !bridgeAxis || !nextAxis || stubAxis !== nextAxis || stubAxis === bridgeAxis) return;
  if (segmentDisplayLength(start, stubEnd) >= MIN_DISPLAY_ENDPOINT_STUB) return;

  if (stubAxis === 'h') {
    appendHorizontalStartCandidates(
      path,
      otherSegments,
      obstacleRects,
      append,
      start,
      stubEnd,
      bridgeEnd,
      next,
      stubAxis,
      bridgeAxis,
    );
  } else {
    appendVerticalStartCandidates(
      path,
      otherSegments,
      obstacleRects,
      append,
      start,
      stubEnd,
      bridgeEnd,
      next,
      stubAxis,
      bridgeAxis,
    );
  }
};

export const buildSafeEndpointSideStepCandidates = (
  path: DisplayPoint[],
  edgeIndex: number,
  edges: Edge[],
  nodes: Node[],
): DisplayPoint[][] => {
  if (path.length < 4) return [];
  const otherSegments = extractDisplaySegments(edges)
    .filter(segment => segment.edgeIndex !== edgeIndex);
  const edge = edges[edgeIndex];
  const obstacleRects: DisplayObstacleRect[] = edge
    ? [...buildDisplayRoutingObstacles(nodes)]
      .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
      .map(([, rect]) => rect)
    : [];
  const candidates: DisplayPoint[][] = [];
  const append: CandidateAppender = (candidate, priority = false) => {
    const compacted = compactOrthogonalPath(candidate);
    if (compacted.length >= 2 && compacted.every(isFinitePoint)) {
      if (priority) candidates.unshift(compacted);
      else candidates.push(compacted);
    }
  };

  appendStartSideStepCandidates(path, otherSegments, obstacleRects, append);
  appendEndSideStepCandidates(path, otherSegments, append);

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Keep generator order inside equal groups, but try candidates that do not
 * add strict crossings before spending the bounded full-quality budget. */
export const prioritizeNonCrossingEndpointStubCandidates = (
  candidates: DisplayPoint[][],
  edgeIndex: number,
  edges: Edge[],
): DisplayPoint[][] => {
  if (candidates.length < 2 || !edges[edgeIndex]) return candidates;
  const paths = edges.map(getDisplayComputedPath);
  const counter = createSingleMoverStrictCrossingCounter(paths, edges, edgeIndex);
  const preferred: DisplayPoint[][] = [];
  const fallback: DisplayPoint[][] = [];
  for (const candidate of candidates) {
    (counter.count(candidate) <= counter.baseline ? preferred : fallback).push(candidate);
  }
  return preferred.length === 0 || fallback.length === 0
    ? candidates
    : [...preferred, ...fallback];
};
