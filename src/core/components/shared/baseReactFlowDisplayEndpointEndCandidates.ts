import {
  displayAxisOf,
  extractDisplaySegments,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  segmentDisplayLength,
  sortedUniqueNumbers,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';

export const MIN_DISPLAY_ENDPOINT_STUB = 48;

type DisplaySegment = ReturnType<typeof extractDisplaySegments>[number];
type CandidateAppender = (candidate: DisplayPoint[], priority?: boolean) => void;

const appendHorizontalEndCandidates = (
  path: DisplayPoint[],
  otherSegments: DisplaySegment[],
  append: CandidateAppender,
  previous: DisplayPoint,
  bridgeStart: DisplayPoint,
  stubStart: DisplayPoint,
  end: DisplayPoint,
): void => {
  const direction = Math.sign(stubStart.x - end.x) || Math.sign(previous.x - end.x) || 1;
  const minX = Math.min(previous.x, end.x);
  const maxX = Math.max(previous.x, end.x);
  const bridgeXValues = sortedUniqueNumbers(
    [
      end.x + direction * MIN_DISPLAY_ENDPOINT_STUB,
      end.x + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP),
      end.x + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP * 2),
      stubStart.x + direction * RESIDUAL_PARALLEL_LANE_GAP,
      stubStart.x + direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
      previous.x - direction * MIN_DISPLAY_ENDPOINT_STUB,
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
    stubStart.x,
  );
  for (const bridgeX of bridgeXValues.slice(0, 14)) {
    if (bridgeX <= minX + 1 || bridgeX >= maxX - 1) continue;
    if (Math.abs(bridgeX - end.x) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      ...path.slice(0, -4),
      previous,
      { x: bridgeX, y: previous.y },
      { x: bridgeX, y: end.y },
      end,
    ]);
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
    bridgeStart.y,
  );
  for (const laneY of laneValues.slice(0, 12)) {
    if (Math.abs(laneY - end.y) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      ...path.slice(0, -3),
      { x: previous.x, y: laneY },
      { x: end.x, y: laneY },
      end,
    ]);
  }
};

const appendVerticalEndCandidates = (
  path: DisplayPoint[],
  otherSegments: DisplaySegment[],
  append: CandidateAppender,
  previous: DisplayPoint,
  bridgeStart: DisplayPoint,
  stubStart: DisplayPoint,
  end: DisplayPoint,
): void => {
  const direction = Math.sign(stubStart.y - end.y) || Math.sign(previous.y - end.y) || 1;
  const minY = Math.min(previous.y, end.y);
  const maxY = Math.max(previous.y, end.y);
  const bridgeYValues = sortedUniqueNumbers(
    [
      end.y + direction * MIN_DISPLAY_ENDPOINT_STUB,
      end.y + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP),
      end.y + direction * (MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP * 2),
      stubStart.y + direction * RESIDUAL_PARALLEL_LANE_GAP,
      stubStart.y + direction * RESIDUAL_PARALLEL_LANE_GAP * 2,
      previous.y - direction * MIN_DISPLAY_ENDPOINT_STUB,
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
    stubStart.y,
  );
  for (const bridgeY of bridgeYValues.slice(0, 14)) {
    if (bridgeY <= minY + 1 || bridgeY >= maxY - 1) continue;
    if (Math.abs(bridgeY - end.y) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      ...path.slice(0, -4),
      previous,
      { x: previous.x, y: bridgeY },
      { x: end.x, y: bridgeY },
      end,
    ]);
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
    bridgeStart.x,
  );
  for (const laneX of laneValues.slice(0, 12)) {
    if (Math.abs(laneX - end.x) < MIN_DISPLAY_ENDPOINT_STUB) continue;
    append([
      ...path.slice(0, -3),
      { x: laneX, y: previous.y },
      { x: laneX, y: end.y },
      end,
    ]);
  }
};

export const appendEndSideStepCandidates = (
  path: DisplayPoint[],
  otherSegments: DisplaySegment[],
  append: CandidateAppender,
): void => {
  const previous = path[path.length - 4];
  const bridgeStart = path[path.length - 3];
  const stubStart = path[path.length - 2];
  const end = path[path.length - 1];
  const previousAxis = displayAxisOf(previous, bridgeStart);
  const bridgeAxis = displayAxisOf(bridgeStart, stubStart);
  const stubAxis = displayAxisOf(stubStart, end);
  if (!previousAxis || !bridgeAxis || !stubAxis || previousAxis !== stubAxis || previousAxis === bridgeAxis) return;
  if (segmentDisplayLength(stubStart, end) >= MIN_DISPLAY_ENDPOINT_STUB) return;

  if (stubAxis === 'h') {
    appendHorizontalEndCandidates(path, otherSegments, append, previous, bridgeStart, stubStart, end);
  } else {
    appendVerticalEndCandidates(path, otherSegments, append, previous, bridgeStart, stubStart, end);
  }
};
