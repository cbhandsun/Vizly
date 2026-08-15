import type { EdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  displayAxisOf,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';

export const detachedTerminalQualityDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

export const buildApproachSideTerminalCandidate = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
): { path: DisplayPoint[]; side: 'top' | 'bottom' | 'left' | 'right' } | null => {
  if (path.length < 2) return null;
  const terminalIndex = role === 'source' ? 0 : path.length - 1;
  const adjacentIndex = role === 'source' ? 1 : path.length - 2;
  const terminal = path[terminalIndex];
  const adjacent = path[adjacentIndex];
  const axis = displayAxisOf(terminal, adjacent);
  if (!axis) return null;
  const side = axis === 'h'
    ? (adjacent.x < terminal.x ? 'left' : 'right')
    : (adjacent.y < terminal.y ? 'top' : 'bottom');
  const endpoint = side === 'left'
    ? { x: rect.x, y: Math.max(rect.y, Math.min(rect.y + rect.height, adjacent.y)) }
    : side === 'right'
      ? { x: rect.x + rect.width, y: Math.max(rect.y, Math.min(rect.y + rect.height, adjacent.y)) }
      : side === 'top'
        ? { x: Math.max(rect.x, Math.min(rect.x + rect.width, adjacent.x)), y: rect.y }
        : { x: Math.max(rect.x, Math.min(rect.x + rect.width, adjacent.x)), y: rect.y + rect.height };
  const candidatePath = path.map(point => ({ ...point }));
  candidatePath[terminalIndex] = endpoint;
  return { path: candidatePath, side };
};
