import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import { getDisplayComputedPath, type DisplayPoint } from './baseReactFlowDisplayGeometry';

const MIN_DISPLAY_ENDPOINT_STUB = 48;

type TreeRoutingData = Record<string, unknown> & { points: unknown[] };

const isTreeRoutingData = (value: unknown): value is TreeRoutingData => (
  typeof value === 'object'
  && value !== null
  && 'points' in value
  && Array.isArray(value.points)
);

const repairStartHandleHemisphereHairpin = (
  path: DisplayPoint[],
  handle: string | null | undefined,
  fallbackSide?: 'l' | 'r' | 't' | 'b',
): DisplayPoint[] => {
  if (path.length < 4) return path;
  const side = normalizeHandle(handle) ?? fallbackSide;
  const [endpoint, firstLane, secondLane, continuation] = path;
  const firstVertical = Math.abs(endpoint.x - firstLane.x) <= 0.5;
  const bridgeHorizontal = Math.abs(firstLane.y - secondLane.y) <= 0.5;
  const continuationVertical = Math.abs(secondLane.x - continuation.x) <= 0.5;
  const firstHorizontal = Math.abs(endpoint.y - firstLane.y) <= 0.5;
  const bridgeVertical = Math.abs(firstLane.x - secondLane.x) <= 0.5;
  const continuationHorizontal = Math.abs(secondLane.y - continuation.y) <= 0.5;

  if ((side === 't' || side === 'b') && firstHorizontal && bridgeVertical && continuationHorizontal) {
    const expectedDirection = side === 'b' ? 1 : -1;
    const outwardSpan = secondLane.y - endpoint.y;
    const firstDirection = Math.sign(firstLane.x - endpoint.x);
    const continuationDirection = Math.sign(continuation.x - secondLane.x);
    if (
      Math.sign(outwardSpan) === expectedDirection
      && Math.abs(outwardSpan) >= MIN_DISPLAY_ENDPOINT_STUB
      && firstDirection !== 0
      && continuationDirection === -firstDirection
    ) {
      return compactOrthogonalPath([
        endpoint,
        { x: endpoint.x, y: secondLane.y },
        { x: continuation.x, y: secondLane.y },
        ...path.slice(3),
      ]);
    }
  }

  if ((side === 'l' || side === 'r') && firstVertical && bridgeHorizontal && continuationVertical) {
    const expectedDirection = side === 'r' ? 1 : -1;
    const outwardSpan = secondLane.x - endpoint.x;
    const firstDirection = Math.sign(firstLane.y - endpoint.y);
    const continuationDirection = Math.sign(continuation.y - secondLane.y);
    if (
      Math.sign(outwardSpan) === expectedDirection
      && Math.abs(outwardSpan) >= MIN_DISPLAY_ENDPOINT_STUB
      && firstDirection !== 0
      && continuationDirection === -firstDirection
    ) {
      return compactOrthogonalPath([
        endpoint,
        { x: secondLane.x, y: endpoint.y },
        { x: secondLane.x, y: continuation.y },
        ...path.slice(3),
      ]);
    }
  }

  if ((side === 't' || side === 'b') && firstVertical && bridgeHorizontal && continuationVertical) {
    const firstDirection = Math.sign(firstLane.y - endpoint.y);
    const expectedDirection = side === 'b' ? 1 : -1;
    const continuationDirection = Math.sign(continuation.y - secondLane.y);
    const span = continuation.y - endpoint.y;
    if (
      firstDirection === -expectedDirection
      && continuationDirection === expectedDirection
      && Math.sign(span) === expectedDirection
      && Math.abs(span) >= MIN_DISPLAY_ENDPOINT_STUB * 2
    ) {
      const laneY = endpoint.y + span / 2;
      return compactOrthogonalPath([
        endpoint,
        { x: endpoint.x, y: laneY },
        { x: secondLane.x, y: laneY },
        ...path.slice(3),
      ]);
    }
  }

  if ((side === 'l' || side === 'r') && firstHorizontal && bridgeVertical && continuationHorizontal) {
    const firstDirection = Math.sign(firstLane.x - endpoint.x);
    const expectedDirection = side === 'r' ? 1 : -1;
    const continuationDirection = Math.sign(continuation.x - secondLane.x);
    const span = continuation.x - endpoint.x;
    if (
      firstDirection === -expectedDirection
      && continuationDirection === expectedDirection
      && Math.sign(span) === expectedDirection
      && Math.abs(span) >= MIN_DISPLAY_ENDPOINT_STUB * 2
    ) {
      const laneX = endpoint.x + span / 2;
      return compactOrthogonalPath([
        endpoint,
        { x: laneX, y: endpoint.y },
        { x: laneX, y: secondLane.y },
        ...path.slice(3),
      ]);
    }
  }

  return path;
};

export const repairTerminalHandleHemisphereHairpins = <T extends Edge[]>(
  edges: T,
  _nodes: Node[],
): T => {
  let changed = false;
  const candidate = edges.map((edge) => {
    const path = getDisplayComputedPath(edge);
    if (path.length < 4) return edge;
    if (calculateEdgePathQualityScore([edge]).hairpins === 0) return edge;
    const first = path[0];
    const second = path[1];
    const last = path[path.length - 1];
    const beforeLast = path[path.length - 2];
    const sourceFallback = Math.abs(first.x - second.x) <= 0.5
      ? (last.y >= first.y ? 'b' : 't')
      : (last.x >= first.x ? 'r' : 'l');
    const targetFallback = Math.abs(last.x - beforeLast.x) <= 0.5
      ? (last.y >= first.y ? 't' : 'b')
      : (last.x >= first.x ? 'l' : 'r');
    const sourceRepaired = repairStartHandleHemisphereHairpin(path, edge.sourceHandle, sourceFallback);
    const targetRepaired = repairStartHandleHemisphereHairpin(
      [...sourceRepaired].reverse(),
      edge.targetHandle,
      targetFallback,
    ).reverse();
    const repaired = compactOrthogonalPath(targetRepaired);
    if (repaired.length === path.length && repaired.every((point, index) => (
      Math.abs(point.x - path[index].x) <= 0.5 && Math.abs(point.y - path[index].y) <= 0.5
    ))) {
      return edge;
    }

    const existingData = (edge.data ?? {}) as Record<string, unknown>;
    const treeRouting = existingData.treeRouting;
    const data: Record<string, unknown> = {
      ...existingData,
      computedPath: repaired,
      terminalHandleHemisphereRepaired: true,
      ...(isTreeRoutingData(treeRouting)
        ? { treeRouting: { ...treeRouting, points: repaired } }
        : {}),
    };
    changed = true;
    return { ...edge, data };
  }) as T;
  return changed ? candidate : edges;
};
