import type { Edge } from '@xyflow/react';

import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  getDisplayComputedPath,
  segmentDisplayLength,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';

const MIN_ENDPOINT_STUB = 48;
const MAX_SUBPIXEL_DEFICIT = 1;

const finitePoint = (point: DisplayPoint | undefined): point is DisplayPoint => Boolean(
  point && Number.isFinite(point.x) && Number.isFinite(point.y),
);

const extendSourceStub = (path: DisplayPoint[], minimumStub: number): boolean => {
  const endpoint = path[0];
  const stub = path[1];
  const corner = path[2];
  if (!finitePoint(endpoint) || !finitePoint(stub) || !finitePoint(corner)) return false;
  const length = segmentDisplayLength(endpoint, stub);
  if (length >= minimumStub || length < minimumStub - MAX_SUBPIXEL_DEFICIT) return false;
  const axis = displayAxisOf(endpoint, stub);
  if (axis === 'h') {
    const direction = Math.sign(stub.x - endpoint.x);
    if (direction === 0) return false;
    const lane = endpoint.x + direction * minimumStub;
    stub.x = lane;
    corner.x = lane;
    return true;
  }
  if (axis === 'v') {
    const direction = Math.sign(stub.y - endpoint.y);
    if (direction === 0) return false;
    const lane = endpoint.y + direction * minimumStub;
    stub.y = lane;
    corner.y = lane;
    return true;
  }
  return false;
};

const extendTargetStub = (path: DisplayPoint[], minimumStub: number): boolean => {
  const last = path.length - 1;
  const corner = path[last - 2];
  const stub = path[last - 1];
  const endpoint = path[last];
  if (!finitePoint(corner) || !finitePoint(stub) || !finitePoint(endpoint)) return false;
  const length = segmentDisplayLength(stub, endpoint);
  if (length >= minimumStub || length < minimumStub - MAX_SUBPIXEL_DEFICIT) return false;
  const axis = displayAxisOf(stub, endpoint);
  if (axis === 'h') {
    const direction = Math.sign(stub.x - endpoint.x);
    if (direction === 0) return false;
    const lane = endpoint.x + direction * minimumStub;
    stub.x = lane;
    corner.x = lane;
    return true;
  }
  if (axis === 'v') {
    const direction = Math.sign(stub.y - endpoint.y);
    if (direction === 0) return false;
    const lane = endpoint.y + direction * minimumStub;
    stub.y = lane;
    corner.y = lane;
    return true;
  }
  return false;
};

const pathIsOrthogonal = (path: DisplayPoint[]): boolean => path.every((point, index) => (
  finitePoint(point) && (index === 0 || displayAxisOf(path[index - 1], point) !== null)
));

/**
 * Removes only floating-point deficits below one pixel. Larger endpoint
 * changes remain the responsibility of the bounded obstacle-aware repair.
 * The caller still owns the whole-graph hard gate before committing results.
 */
export const repairSubpixelEndpointStubPrecision = <T extends Edge[]>(
  edges: T,
  requestedMinimumStub = MIN_ENDPOINT_STUB,
): T => {
  const minimumStub = Number.isFinite(requestedMinimumStub) && requestedMinimumStub > 0
    ? requestedMinimumStub
    : MIN_ENDPOINT_STUB;
  let changed = false;
  const repaired = edges.map((edge) => {
    const current = getDisplayComputedPath(edge);
    if (current.length < 4 || !current.every(finitePoint)) return edge;
    const candidate = current.map(point => ({ ...point }));
    const sourceChanged = extendSourceStub(candidate, minimumStub);
    const targetChanged = extendTargetStub(candidate, minimumStub);
    if (!sourceChanged && !targetChanged) return edge;
    const compacted = compactOrthogonalPath(candidate);
    if (!pathIsOrthogonal(compacted)) return edge;
    if (
      (sourceChanged && segmentDisplayLength(compacted[0], compacted[1]) < minimumStub)
      || (targetChanged && segmentDisplayLength(
        compacted[compacted.length - 2],
        compacted[compacted.length - 1],
      ) < minimumStub)
    ) return edge;
    changed = true;
    return withDisplayComputedPath(edge, compacted);
  }) as T;
  return changed ? repaired : edges;
};
