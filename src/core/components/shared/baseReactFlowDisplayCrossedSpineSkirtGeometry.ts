import type { DisplayTerminalSide } from './baseReactFlowDisplayTerminalPolicy';
import {
  RESIDUAL_PARALLEL_LANE_GAP,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

export const OUTER_SKIRT_TERMINAL_STUB = 56;

export const crossedSpinePathLength = (
  path: readonly DisplayPoint[],
): number => path.reduce((total, point, index) => {
  const previous = path[index - 1];
  return previous
    ? total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    : total;
}, 0);

export const crossedSpineTerminalStubPoint = (
  anchor: DisplayPoint,
  side: DisplayTerminalSide,
): DisplayPoint => {
  if (side === 'left') return { x: anchor.x - OUTER_SKIRT_TERMINAL_STUB, y: anchor.y };
  if (side === 'right') return { x: anchor.x + OUTER_SKIRT_TERMINAL_STUB, y: anchor.y };
  if (side === 'top') return { x: anchor.x, y: anchor.y - OUTER_SKIRT_TERMINAL_STUB };
  return { x: anchor.x, y: anchor.y + OUTER_SKIRT_TERMINAL_STUB };
};

export const blockerEscapeLanesForCrossedSpine = (
  spine: DisplaySegment,
  otherSegments: DisplaySegment[],
): number[] => {
  const crossingSegments = crossedSpinePerpendicularBlockers(spine, otherSegments);
  if (crossingSegments.length === 0) return [];

  // Treat a crossed fan-in/fan-out bundle as one wall. Per-segment skirts can
  // land between adjacent members (or jump a full terminal-stub distance past
  // the wall), which creates the reverse-flow lane-order defect this repair is
  // meant to remove. The aggregate boundary yields two deterministic nearest
  // legal lanes and reduces both candidate count and avoidable detour length.
  const coordinates = crossingSegments.flatMap(segment => (
    spine.axis === 'v'
      ? [segment.a.x, segment.b.x]
      : [segment.a.y, segment.b.y]
  ));
  return [
    Math.min(...coordinates) - RESIDUAL_PARALLEL_LANE_GAP,
    Math.max(...coordinates) + RESIDUAL_PARALLEL_LANE_GAP,
    Math.min(...coordinates) - OUTER_SKIRT_TERMINAL_STUB,
    Math.max(...coordinates) + OUTER_SKIRT_TERMINAL_STUB,
  ];
};

export const crossedSpinePerpendicularBlockers = (
  spine: DisplaySegment,
  otherSegments: DisplaySegment[],
): DisplaySegment[] => spine.axis === 'v'
    ? otherSegments
      .filter(segment => segment.axis === 'h')
      .filter(segment => {
        const spineMin = Math.min(spine.a.y, spine.b.y);
        const spineMax = Math.max(spine.a.y, spine.b.y);
        const segmentMin = Math.min(segment.a.x, segment.b.x);
        const segmentMax = Math.max(segment.a.x, segment.b.x);
        return segment.a.y > spineMin && segment.a.y < spineMax
          && spine.a.x > segmentMin && spine.a.x < segmentMax;
      })
    : otherSegments
      .filter(segment => segment.axis === 'v')
      .filter(segment => {
        const spineMin = Math.min(spine.a.x, spine.b.x);
        const spineMax = Math.max(spine.a.x, spine.b.x);
        const segmentMin = Math.min(segment.a.y, segment.b.y);
        const segmentMax = Math.max(segment.a.y, segment.b.y);
        return segment.a.x > spineMin && segment.a.x < spineMax
          && spine.a.y > segmentMin && spine.a.y < segmentMax;
      });
