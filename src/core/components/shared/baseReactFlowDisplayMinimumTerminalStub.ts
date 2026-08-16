import type { XYPosition } from '@xyflow/react';

import { sideForHandle } from './baseReactFlowDisplayEdgeGeometry';
import type { AnchorSide, NodeRect } from './baseReactFlowDisplayEdgeGeometry';

const BOUNDARY_TOLERANCE = 2;
const MIN_OUTWARD_STUB = 32;
const OUTWARD_STUB = 48;
const TINY_CONNECTOR = 24;

/** Extends a short terminal lane as one orthogonal transaction. */
export const ensureMinimumOutwardTerminalStub = (
  path: XYPosition[],
  terminalIndex: number,
  rect: NodeRect,
  handle: string | null | undefined,
  fallbackSide: AnchorSide,
): boolean => {
  if (path.length < 3) return false;
  const terminal = path[terminalIndex];
  const step = terminalIndex === 0 ? 1 : -1;
  const adjacentIndex = terminalIndex + step;
  const adjacent = path[adjacentIndex];
  if (!terminal || !adjacent) return false;
  const side = sideForHandle(handle) ?? fallbackSide;
  const horizontalSide = side === 'left' || side === 'right';
  const boundary = side === 'left'
    ? rect.x
    : side === 'right'
      ? rect.x + rect.width
      : side === 'top'
        ? rect.y
        : rect.y + rect.height;
  const terminalNormal = horizontalSide ? terminal.x : terminal.y;
  const adjacentNormal = horizontalSide ? adjacent.x : adjacent.y;
  if (Math.abs(terminalNormal - boundary) > BOUNDARY_TOLERANCE) return false;
  const outward = side === 'left' || side === 'top' ? -1 : 1;
  const availableStub = (adjacentNormal - boundary) * outward;
  if (availableStub < MIN_OUTWARD_STUB || availableStub >= OUTWARD_STUB) return false;

  const desiredNormal = boundary + outward * OUTWARD_STUB;
  const original = path.map(point => ({ ...point }));
  let index = adjacentIndex;
  while (index >= 0 && index < path.length) {
    path[index] = horizontalSide
      ? { ...path[index], x: desiredNormal }
      : { ...path[index], y: desiredNormal };
    const nextIndex = index + step;
    const currentOriginal = original[index];
    const nextOriginal = original[nextIndex];
    if (!nextOriginal) break;
    const staysOnLane = horizontalSide
      ? Math.abs(currentOriginal.x - nextOriginal.x) <= 0.5
      : Math.abs(currentOriginal.y - nextOriginal.y) <= 0.5;
    const nextNormal = horizontalSide ? nextOriginal.x : nextOriginal.y;
    const sharesTangentCoordinate = horizontalSide
      ? Math.abs(currentOriginal.y - nextOriginal.y) <= 0.5
      : Math.abs(currentOriginal.x - nextOriginal.x) <= 0.5;
    const wouldLeaveTinyConnector = sharesTangentCoordinate
      && Math.abs(desiredNormal - nextNormal) < TINY_CONNECTOR;
    if (!staysOnLane && !wouldLeaveTinyConnector) break;
    index = nextIndex;
  }
  return true;
};
