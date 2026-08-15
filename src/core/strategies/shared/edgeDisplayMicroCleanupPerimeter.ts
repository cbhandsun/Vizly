import type { Edge } from '@xyflow/react';

import {
  TINY_INTERIOR_SEGMENT,
  allSegmentsOrthogonal,
  axisOf,
  compactPath,
  getEdgePath,
  hasSameEndpoints,
  pathMicroMetrics,
  samePoint,
  segmentDirection,
  segmentLength,
  type Point,
} from './edgeDisplayMicroCleanupGeometry';

/**
 * Builds bounded routes around the current route envelope when a local dogleg
 * cannot be removed safely in place. Both perimeter sides are retained because
 * sibling routes or node obstacles can make either side the only valid lane.
 */
export const buildOuterPerimeterMicroCandidates = (
  edges: Edge[],
  points: Point[],
): Point[][] => {
  let anchorIndex = -1;
  for (let index = 1; index + 4 < points.length; index += 1) {
    if (
      segmentLength(points[index + 1], points[index + 2]) < TINY_INTERIOR_SEGMENT
      && segmentLength(points[index + 2], points[index + 3]) < TINY_INTERIOR_SEGMENT
    ) {
      anchorIndex = index - 1;
      break;
    }
  }
  const anchor = points[anchorIndex];
  const endpoint = points[points.length - 1];
  const terminalPivot = points[points.length - 2];
  const terminalAxis = axisOf(terminalPivot, endpoint);
  if (!anchor || !terminalAxis) return [];
  const terminalDirection = segmentDirection(terminalPivot, endpoint, terminalAxis);
  if (terminalDirection === 0) return [];
  const originalMetrics = pathMicroMetrics(points);
  let routeMinimum = Number.POSITIVE_INFINITY;
  let routeMaximum = Number.NEGATIVE_INFINITY;
  for (const candidateEdge of edges) {
    for (const point of compactPath(getEdgePath(candidateEdge))) {
      const coordinate = terminalAxis === 'v' ? point.x : point.y;
      routeMinimum = Math.min(routeMinimum, coordinate);
      routeMaximum = Math.max(routeMaximum, coordinate);
    }
  }
  if (!Number.isFinite(routeMinimum) || !Number.isFinite(routeMaximum)) return [];
  const sharedTerminalStub = edges.reduce((shortest, candidateEdge) => {
    const candidatePath = compactPath(getEdgePath(candidateEdge));
    const candidateEndpoint = candidatePath[candidatePath.length - 1];
    const candidatePivot = candidatePath[candidatePath.length - 2];
    if (
      !samePoint(candidateEndpoint, endpoint, 2)
      || axisOf(candidatePivot, candidateEndpoint) !== terminalAxis
      || segmentDirection(candidatePivot, candidateEndpoint, terminalAxis) !== terminalDirection
    ) return shortest;
    return Math.min(shortest, segmentLength(candidatePivot, candidateEndpoint));
  }, segmentLength(terminalPivot, endpoint));
  const terminalStub = Math.max(48, sharedTerminalStub);
  const approach = terminalAxis === 'v'
    ? { x: endpoint.x, y: endpoint.y - terminalDirection * terminalStub }
    : { x: endpoint.x - terminalDirection * terminalStub, y: endpoint.y };
  const candidates: Point[][] = [];
  for (const outer of [routeMinimum - 192, routeMaximum + 64]) {
    const candidate = compactPath(terminalAxis === 'v' ? [
      ...points.slice(0, anchorIndex + 1),
      { x: outer, y: anchor.y }, { x: outer, y: approach.y }, approach, endpoint,
    ] : [
      ...points.slice(0, anchorIndex + 1),
      { x: anchor.x, y: outer }, { x: approach.x, y: outer }, approach, endpoint,
    ]);
    const metrics = pathMicroMetrics(candidate);
    if (
      hasSameEndpoints(points, candidate)
      && allSegmentsOrthogonal(candidate)
      && metrics.tinyInteriorDoglegs < originalMetrics.tinyInteriorDoglegs
      && metrics.hairpins <= originalMetrics.hairpins
    ) candidates.push(candidate);
  }
  return candidates;
};
