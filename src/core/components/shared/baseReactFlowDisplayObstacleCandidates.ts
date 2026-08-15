import type { Edge, Node } from '@xyflow/react';

import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  collectPathHitObstacleRects,
  displayAxisOf,
  displaySegmentIntersectsRect,
  displayStrictCrossesHorizontal,
  displayStrictCrossesVertical,
  extractDisplaySegments,
  NEAR_PARALLEL_LANE_TOLERANCE,
  OBSTACLE_REPAIR_NODE_PADDING,
  prioritizeLaneValues,
  RESIDUAL_PARALLEL_LANE_GAP,
  sortedUniqueNumbers,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const RESIDUAL_PARALLEL_OVERLAP = 16;
const OBSTACLE_REPAIR_TINY_SEGMENT = 24;

export const buildObstacleSkirtCandidates = (
  path: DisplayPoint[],
  nodes: Node[],
  edge: Edge,
  allEdges: Edge[],
  allSegments: DisplaySegment[] = extractDisplaySegments(allEdges),
): DisplayPoint[][] => {
  if (path.length < 2) return [];
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  if (obstacles.length === 0) return [];

  const otherSegments = allSegments
    .filter(segment => allEdges[segment.edgeIndex]?.id !== edge.id);
  const candidates: DisplayPoint[][] = [];
  const appendCandidate = (candidate: DisplayPoint[]) => {
    const compacted = compactOrthogonalPath(candidate);
    if (compacted.length >= 2 && compacted.every(isFinitePoint)) candidates.push(compacted);
  };

  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    const start = path[segmentIndex];
    const end = path[segmentIndex + 1];
    const axis = displayAxisOf(start, end);
    if (!axis) continue;
    const hitRects = obstacles.filter(rect => displaySegmentIntersectsRect(start, end, rect));
    if (hitRects.length === 0) continue;

    for (const rect of hitRects) {
      if (axis === 'h') {
        const horizontalDirection = Math.sign(end.x - start.x) || 1;
        const nextAfterSegment = path[segmentIndex + 2];
        const horizontalMin = Math.min(start.x, end.x);
        const horizontalMax = Math.max(start.x, end.x);
        const leftLane = Math.round(rect.x - OBSTACLE_REPAIR_NODE_PADDING - 1);
        const rightLane = Math.round(rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + 1);
        const nearX = horizontalDirection >= 0 ? leftLane : rightLane;
        const farX = horizontalDirection >= 0 ? rightLane : leftLane;
        const commercialTopY = rect.y
          - OBSTACLE_REPAIR_NODE_PADDING
          - RESIDUAL_PARALLEL_LANE_GAP * 2;
        const commercialBottomY = rect.y
          + rect.height
          + OBSTACLE_REPAIR_NODE_PADDING
          + RESIDUAL_PARALLEL_LANE_GAP * 2;
        const detourLanes = sortedUniqueNumbers([
          rect.y - OBSTACLE_REPAIR_NODE_PADDING - 1,
          rect.y - OBSTACLE_REPAIR_NODE_PADDING - 8,
          rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + 1,
          rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + 8,
          rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
          rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
          commercialTopY,
          commercialBottomY,
        ], start.y);
        const fullSpanDetourLanes = sortedUniqueNumbers([
          ...detourLanes.slice(0, 6),
          commercialTopY,
          commercialBottomY,
        ], start.y);
        const localBoxY = sortedUniqueNumbers([
          ...detourLanes,
          ...otherSegments
            .filter(segment => segment.axis === 'v')
            .filter(segment => segment.a.x > Math.min(nearX, farX) + 1 && segment.a.x < Math.max(nearX, farX) - 1)
            .flatMap(segment => [
              Math.min(segment.a.y, segment.b.y) - NEAR_PARALLEL_LANE_TOLERANCE - 1,
              Math.max(segment.a.y, segment.b.y) + NEAR_PARALLEL_LANE_TOLERANCE + 1,
            ]),
        ], start.y);

        if (nextAfterSegment) {
          appendCandidate([
            ...path.slice(0, segmentIndex + 1),
            { x: nearX, y: start.y },
            { x: nearX, y: nextAfterSegment.y },
            ...path.slice(segmentIndex + 2),
          ]);
          const outerTopY = Math.round(Math.min(...obstacles.map(obstacle => obstacle.y)) - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP);
          const outerBottomY = Math.round(Math.max(...obstacles.map(obstacle => obstacle.y + obstacle.height)) + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP);
          for (const outerY of sortedUniqueNumbers([outerTopY, outerBottomY], start.y)) {
            appendCandidate([
              ...path.slice(0, segmentIndex + 1),
              { x: nearX, y: start.y },
              { x: nearX, y: outerY },
              { x: nextAfterSegment.x, y: outerY },
              ...path.slice(segmentIndex + 2),
            ]);
          }
        }

        for (const detourY of localBoxY.slice(0, 8)) {
          appendCandidate([
            ...path.slice(0, segmentIndex + 1),
            { x: nearX, y: start.y },
            { x: nearX, y: detourY },
            { x: farX, y: detourY },
            { x: farX, y: start.y },
            ...path.slice(segmentIndex + 1),
          ]);
          if (Math.abs(farX - end.x) < OBSTACLE_REPAIR_TINY_SEGMENT) {
            const extendedFarX = farX + horizontalDirection * OBSTACLE_REPAIR_TINY_SEGMENT;
            const suffix = path.slice(segmentIndex + 2);
            const firstSuffix = suffix[0];
            const secondSuffix = suffix[1];
            const skipTinySuffix = firstSuffix && secondSuffix
              && Math.abs(firstSuffix.x - extendedFarX) < OBSTACLE_REPAIR_TINY_SEGMENT
              && Math.abs(firstSuffix.y - secondSuffix.y) <= 1;
            appendCandidate([
              ...path.slice(0, segmentIndex + 1),
              { x: nearX, y: start.y },
              { x: nearX, y: detourY },
              { x: farX, y: detourY },
              { x: farX, y: start.y },
              { x: extendedFarX, y: start.y },
              ...(firstSuffix ? [{ x: extendedFarX, y: firstSuffix.y }] : []),
              ...(skipTinySuffix ? suffix.slice(1) : suffix),
            ]);
          }
        }

        for (const detourY of fullSpanDetourLanes) {
          appendCandidate([
            ...path.slice(0, segmentIndex + 1),
            { x: start.x, y: detourY },
            { x: end.x, y: detourY },
            ...path.slice(segmentIndex + 1),
          ]);

          const blockers = otherSegments
            .filter(segment => displayStrictCrossesHorizontal(
              { x: start.x, y: detourY },
              { x: end.x, y: detourY },
              segment,
            ))
            .filter(segment => segment.a.x > horizontalMin + 1 && segment.a.x < horizontalMax - 1)
            .sort((first, second) => Math.abs(first.a.x - start.x) - Math.abs(second.a.x - start.x))
            .slice(0, 4);

          for (const blocker of blockers) {
            const blockerMinY = Math.min(blocker.a.y, blocker.b.y);
            const blockerMaxY = Math.max(blocker.a.y, blocker.b.y);
            const sourceSideY = path[segmentIndex - 1]?.y ?? start.y;
            const bypassLanes = sortedUniqueNumbers([
              blockerMaxY + 1,
              blockerMinY - 1,
              blockerMaxY + 8,
              blockerMinY - 8,
              blockerMaxY + RESIDUAL_PARALLEL_LANE_GAP,
              blockerMinY - RESIDUAL_PARALLEL_LANE_GAP,
            ], sourceSideY);
            const splitLanes = sortedUniqueNumbers([
              blocker.a.x + horizontalDirection * RESIDUAL_PARALLEL_LANE_GAP,
              blocker.a.x + horizontalDirection * (RESIDUAL_PARALLEL_LANE_GAP + NEAR_PARALLEL_LANE_TOLERANCE),
              blocker.a.x - horizontalDirection * RESIDUAL_PARALLEL_LANE_GAP,
              blocker.a.x - horizontalDirection * (RESIDUAL_PARALLEL_LANE_GAP + NEAR_PARALLEL_LANE_TOLERANCE),
            ], blocker.a.x + horizontalDirection * RESIDUAL_PARALLEL_LANE_GAP)
              .filter(splitX => splitX > horizontalMin + 1 && splitX < horizontalMax - 1);

            for (const bypassY of bypassLanes.slice(0, 4)) {
              for (const splitX of splitLanes.slice(0, 4)) {
                appendCandidate([
                  ...path.slice(0, segmentIndex + 1),
                  { x: start.x, y: bypassY },
                  { x: splitX, y: bypassY },
                  { x: splitX, y: detourY },
                  { x: end.x, y: detourY },
                  ...path.slice(segmentIndex + 1),
                ]);
              }
            }
          }
        }
      } else {
        const verticalDirection = Math.sign(end.y - start.y) || 1;
        const nextAfterSegment = path[segmentIndex + 2];
        const verticalMin = Math.min(start.y, end.y);
        const verticalMax = Math.max(start.y, end.y);
        const topLane = Math.round(rect.y - OBSTACLE_REPAIR_NODE_PADDING - 1);
        const bottomLane = Math.round(rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + 1);
        const nearY = verticalDirection >= 0 ? topLane : bottomLane;
        const farY = verticalDirection >= 0 ? bottomLane : topLane;
        const commercialLeftX = rect.x
          - OBSTACLE_REPAIR_NODE_PADDING
          - RESIDUAL_PARALLEL_LANE_GAP * 2;
        const commercialRightX = rect.x
          + rect.width
          + OBSTACLE_REPAIR_NODE_PADDING
          + RESIDUAL_PARALLEL_LANE_GAP * 2;
        const detourLanes = sortedUniqueNumbers([
          rect.x - OBSTACLE_REPAIR_NODE_PADDING - 1,
          rect.x - OBSTACLE_REPAIR_NODE_PADDING - 8,
          rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + 1,
          rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + 8,
          rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
          rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
          commercialLeftX,
          commercialRightX,
        ], start.x);
        const fullSpanDetourLanes = sortedUniqueNumbers([
          ...detourLanes.slice(0, 6),
          commercialLeftX,
          commercialRightX,
        ], start.x);
        const localBoxX = sortedUniqueNumbers([
          ...detourLanes,
          ...otherSegments
            .filter(segment => segment.axis === 'h')
            .filter(segment => segment.a.y > Math.min(nearY, farY) + 1 && segment.a.y < Math.max(nearY, farY) - 1)
            .flatMap(segment => [
              Math.min(segment.a.x, segment.b.x) - NEAR_PARALLEL_LANE_TOLERANCE - 1,
              Math.max(segment.a.x, segment.b.x) + NEAR_PARALLEL_LANE_TOLERANCE + 1,
            ]),
        ], start.x);

        if (nextAfterSegment) {
          appendCandidate([
            ...path.slice(0, segmentIndex + 1),
            { x: start.x, y: nearY },
            { x: nextAfterSegment.x, y: nearY },
            ...path.slice(segmentIndex + 2),
          ]);
          const outerLeftX = Math.round(Math.min(...obstacles.map(obstacle => obstacle.x)) - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP);
          const outerRightX = Math.round(Math.max(...obstacles.map(obstacle => obstacle.x + obstacle.width)) + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP);
          for (const outerX of sortedUniqueNumbers([outerLeftX, outerRightX], start.x)) {
            appendCandidate([
              ...path.slice(0, segmentIndex + 1),
              { x: outerX, y: start.y },
              { x: outerX, y: nextAfterSegment.y },
              ...path.slice(segmentIndex + 2),
            ]);
          }
        }

        for (const detourX of localBoxX.slice(0, 8)) {
          appendCandidate([
            ...path.slice(0, segmentIndex + 1),
            { x: start.x, y: nearY },
            { x: detourX, y: nearY },
            { x: detourX, y: farY },
            { x: start.x, y: farY },
            ...path.slice(segmentIndex + 1),
          ]);
          if (Math.abs(farY - end.y) < OBSTACLE_REPAIR_TINY_SEGMENT) {
            const extendedFarY = farY + verticalDirection * OBSTACLE_REPAIR_TINY_SEGMENT;
            const suffix = path.slice(segmentIndex + 2);
            const firstSuffix = suffix[0];
            const secondSuffix = suffix[1];
            const skipTinySuffix = firstSuffix && secondSuffix
              && Math.abs(firstSuffix.y - extendedFarY) < OBSTACLE_REPAIR_TINY_SEGMENT
              && Math.abs(firstSuffix.x - secondSuffix.x) <= 1;
            appendCandidate([
              ...path.slice(0, segmentIndex + 1),
              { x: start.x, y: nearY },
              { x: detourX, y: nearY },
              { x: detourX, y: farY },
              { x: start.x, y: farY },
              { x: start.x, y: extendedFarY },
              ...(firstSuffix ? [{ x: firstSuffix.x, y: extendedFarY }] : []),
              ...(skipTinySuffix ? suffix.slice(1) : suffix),
            ]);
          }
        }

        for (const detourX of fullSpanDetourLanes) {
          appendCandidate([
            ...path.slice(0, segmentIndex + 1),
            { x: detourX, y: start.y },
            { x: detourX, y: end.y },
            ...path.slice(segmentIndex + 1),
          ]);

          const blockers = otherSegments
            .filter(segment => displayStrictCrossesVertical(
              { x: detourX, y: start.y },
              { x: detourX, y: end.y },
              segment,
            ))
            .filter(segment => segment.a.y > verticalMin + 1 && segment.a.y < verticalMax - 1)
            .sort((first, second) => Math.abs(first.a.y - start.y) - Math.abs(second.a.y - start.y))
            .slice(0, 4);

          for (const blocker of blockers) {
            const blockerMinX = Math.min(blocker.a.x, blocker.b.x);
            const blockerMaxX = Math.max(blocker.a.x, blocker.b.x);
            const sourceSideX = path[segmentIndex - 1]?.x ?? start.x;
            const bypassLanes = sortedUniqueNumbers([
              blockerMaxX + 1,
              blockerMinX - 1,
              blockerMaxX + 8,
              blockerMinX - 8,
              blockerMaxX + RESIDUAL_PARALLEL_LANE_GAP,
              blockerMinX - RESIDUAL_PARALLEL_LANE_GAP,
            ], sourceSideX);
            const splitLanes = sortedUniqueNumbers([
              blocker.a.y + verticalDirection * RESIDUAL_PARALLEL_LANE_GAP,
              blocker.a.y + verticalDirection * (RESIDUAL_PARALLEL_LANE_GAP + NEAR_PARALLEL_LANE_TOLERANCE),
              blocker.a.y - verticalDirection * RESIDUAL_PARALLEL_LANE_GAP,
              blocker.a.y - verticalDirection * (RESIDUAL_PARALLEL_LANE_GAP + NEAR_PARALLEL_LANE_TOLERANCE),
            ], blocker.a.y + verticalDirection * RESIDUAL_PARALLEL_LANE_GAP)
              .filter(splitY => splitY > verticalMin + 1 && splitY < verticalMax - 1);

            for (const bypassX of bypassLanes.slice(0, 4)) {
              for (const splitY of splitLanes.slice(0, 4)) {
                appendCandidate([
                  ...path.slice(0, segmentIndex + 1),
                  { x: bypassX, y: start.y },
                  { x: bypassX, y: splitY },
                  { x: detourX, y: splitY },
                  { x: detourX, y: end.y },
                  ...path.slice(segmentIndex + 1),
                ]);
              }
            }
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildObstacleOuterEscapeCandidates = (
  path: DisplayPoint[],
  nodes: Node[],
  edge: Edge,
): DisplayPoint[][] => {
  if (path.length < 2) return [];
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  if (obstacles.length === 0) return [];

  const start = path[0];
  const end = path[path.length - 1];
  const minX = Math.min(...obstacles.map(rect => rect.x));
  const maxX = Math.max(...obstacles.map(rect => rect.x + rect.width));
  const minY = Math.min(...obstacles.map(rect => rect.y));
  const maxY = Math.max(...obstacles.map(rect => rect.y + rect.height));
  const sourceXLanes = new Set<number>();
  const targetXLanes = new Set<number>();
  const outerYLanes = new Set<number>();
  const bridgeYLanes = new Set<number>();
  const add = (set: Set<number>, value: number) => {
    if (Number.isFinite(value)) set.add(Math.round(value));
  };

  for (const offset of [64, 96, 128, 180]) {
    add(sourceXLanes, start.x - offset);
    add(sourceXLanes, start.x + offset);
    add(targetXLanes, end.x - offset);
    add(targetXLanes, end.x + offset);
    add(outerYLanes, minY - offset);
    add(outerYLanes, maxY + offset);
  }
  for (const rect of obstacles) {
    for (const clearance of [
      RESIDUAL_PARALLEL_LANE_GAP,
      RESIDUAL_PARALLEL_LANE_GAP + RESIDUAL_PARALLEL_OVERLAP,
      RESIDUAL_PARALLEL_LANE_GAP * 2 + NEAR_PARALLEL_LANE_TOLERANCE * 2,
      RESIDUAL_PARALLEL_LANE_GAP * 3,
      RESIDUAL_PARALLEL_LANE_GAP * 4,
    ]) {
      const beforeNode = Math.round(rect.y - OBSTACLE_REPAIR_NODE_PADDING - clearance);
      const afterNode = Math.round(rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + clearance);
      add(bridgeYLanes, beforeNode);
      add(bridgeYLanes, beforeNode + 1);
      add(bridgeYLanes, afterNode);
      add(bridgeYLanes, afterNode - 1);
    }
  }
  for (const point of path.slice(1, -1)) {
    add(targetXLanes, point.x);
    add(bridgeYLanes, point.y - RESIDUAL_PARALLEL_LANE_GAP);
    add(bridgeYLanes, point.y + RESIDUAL_PARALLEL_LANE_GAP);
  }
  add(targetXLanes, minX - 96);
  add(targetXLanes, maxX + 96);

  const sourceX = [...sourceXLanes]
    .filter(x => Math.abs(x - start.x) >= 8 && Math.abs(x - end.x) >= 8)
    .sort((first, second) => Math.abs(first - start.x) - Math.abs(second - start.x))
    .slice(0, 6);
  const targetX = [...targetXLanes]
    .filter(x => Math.abs(x - start.x) >= 8 && Math.abs(x - end.x) >= 8)
    .sort((first, second) => Math.abs(first - end.x) - Math.abs(second - end.x))
    .slice(0, 6);
  const outerY = [...outerYLanes]
    .filter(y => Math.abs(y - start.y) >= 8 && Math.abs(y - end.y) >= 8)
    .sort((first, second) => Math.min(Math.abs(first - start.y), Math.abs(first - end.y))
      - Math.min(Math.abs(second - start.y), Math.abs(second - end.y)))
    .slice(0, 6);
  const bridgeY = [...bridgeYLanes]
    .filter(y => Math.abs(y - start.y) >= 8 && Math.abs(y - end.y) >= 8)
    .sort((first, second) => Math.min(Math.abs(first - start.y), Math.abs(first - end.y))
      - Math.min(Math.abs(second - start.y), Math.abs(second - end.y)))
    .slice(0, 24);
  const bridgeX = [...new Set([...sourceX, ...targetX])]
    .sort((first, second) => Math.min(Math.abs(first - start.x), Math.abs(first - end.x))
      - Math.min(Math.abs(second - start.x), Math.abs(second - end.x)))
    .slice(0, 10);

  const candidates: DisplayPoint[][] = [];
  for (const sx of sourceX) {
    for (const tx of targetX) {
      for (const y of outerY) {
        candidates.push(compactOrthogonalPath([
          start,
          { x: sx, y: start.y },
          { x: sx, y },
          { x: tx, y },
          { x: tx, y: end.y },
          end,
        ]));
      }
    }
  }
  for (const x of bridgeX) {
    for (const y of bridgeY) {
      candidates.push(compactOrthogonalPath([
        start,
        { x, y: start.y },
        { x, y },
        { x: end.x, y },
        end,
      ]));
    }
  }
  for (const y of bridgeY) {
    candidates.push(compactOrthogonalPath([
      start,
      { x: start.x, y },
      { x: end.x, y },
      end,
    ]));
  }
  return candidates.filter(candidate => candidate.length >= 2);
};

export const buildWholePathOuterLaneCandidates = (
  path: DisplayPoint[],
  nodes: Node[],
  edge: Edge,
  includeOuterRing = true,
): DisplayPoint[][] => {
  if (path.length < 2) return [];
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  if (obstacles.length === 0) return [];

  const start = path[0];
  const end = path[path.length - 1];
  const minX = Math.min(...obstacles.map(rect => rect.x));
  const maxX = Math.max(...obstacles.map(rect => rect.x + rect.width));
  const minY = Math.min(...obstacles.map(rect => rect.y));
  const maxY = Math.max(...obstacles.map(rect => rect.y + rect.height));
  const laneGap = OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP;
  const hitRects = collectPathHitObstacleRects(path, obstacles).slice(0, 10);
  const globalXLanes = [
    minX - laneGap,
    minX - laneGap - 32,
    minX - laneGap - 64,
    minX - laneGap - 160,
    minX - laneGap - 288,
    maxX + laneGap,
    maxX + laneGap + 32,
    maxX + laneGap + 64,
    maxX + laneGap + 160,
    maxX + laneGap + 288,
  ];
  const globalYLanes = [
    minY - laneGap,
    minY - laneGap - 32,
    minY - laneGap - 64,
    minY - laneGap - 160,
    minY - laneGap - 288,
    maxY + laneGap,
    maxY + laneGap + 32,
    maxY + laneGap + 64,
    maxY + laneGap + 160,
    maxY + laneGap + 288,
  ];
  const hitXLanes = hitRects.flatMap(rect => [
    rect.x - laneGap,
    rect.x - laneGap - 32,
    rect.x + rect.width + laneGap,
    rect.x + rect.width + laneGap + 32,
  ]);
  const hitYLanes = hitRects.flatMap(rect => [
    rect.y - laneGap,
    rect.y - laneGap - 32,
    rect.y + rect.height + laneGap,
    rect.y + rect.height + laneGap + 32,
  ]);
  const nearbyXLanes = [
    start.x - 120,
    start.x + 120,
    end.x - 120,
    end.x + 120,
    start.x - 64,
    start.x + 64,
    end.x - 64,
    end.x + 64,
    start.x - 224,
    start.x + 224,
    end.x - 224,
    end.x + 224,
    start.x - 320,
    start.x + 320,
    end.x - 320,
    end.x + 320,
  ];
  const nearbyYLanes = [
    start.y - 120,
    start.y + 120,
    end.y - 120,
    end.y + 120,
    start.y - 224,
    start.y + 224,
    end.y - 224,
    end.y + 224,
    start.y - 320,
    start.y + 320,
    end.y - 320,
    end.y + 320,
  ];
  const xLanes = prioritizeLaneValues(
    start.x,
    [...hitXLanes, ...globalXLanes],
    nearbyXLanes,
    32,
  );
  const yLanes = prioritizeLaneValues(
    start.y,
    [...hitYLanes, ...globalYLanes],
    nearbyYLanes,
    32,
  );

  const candidates = [
    ...xLanes.map(x => compactOrthogonalPath([
      start,
      { x, y: start.y },
      { x, y: end.y },
      end,
    ])),
    ...yLanes.map(y => compactOrthogonalPath([
      start,
      { x: start.x, y },
      { x: end.x, y },
      end,
    ])),
  ];
  if (includeOuterRing) {
    const outerXLanes = [
      minX - laneGap - 288,
      maxX + laneGap + 288,
    ].map(value => Math.round(value));
    const outerYLanes = [
      minY - laneGap - 288,
      maxY + laneGap + 288,
    ].map(value => Math.round(value));
    const bridgeXLanes = prioritizeLaneValues(
      end.x,
      [...hitXLanes, ...nearbyXLanes, ...xLanes],
      [start.x, end.x],
      20,
    );

    for (const outerX of outerXLanes) {
      for (const outerY of outerYLanes) {
        for (const bridgeX of bridgeXLanes) {
          candidates.push(compactOrthogonalPath([
            start,
            { x: outerX, y: start.y },
            { x: outerX, y: outerY },
            { x: bridgeX, y: outerY },
            { x: bridgeX, y: end.y },
            end,
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
