import type { Node as ReactFlowNode } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';

export type EndpointPoint = { x: number; y: number };
export type EndpointRect = { x: number; y: number; width: number; height: number };
export type EndpointSide = 't' | 'b' | 'l' | 'r';

export const ENDPOINT_SIDE_MATCH_TOLERANCE = 8;

const finiteNumber = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const clampEndpointValue = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, value))
);

export function endpointNodeRect(node: ReactFlowNode | undefined): EndpointRect | null {
  if (!node) return null;
  const runtimeNode = node as ReactFlowNode & {
    positionAbsolute?: { x?: unknown; y?: unknown };
    measured?: { width?: unknown; height?: unknown };
  };
  const position = runtimeNode.positionAbsolute ?? node.position;
  const width = finiteNumber(runtimeNode.measured?.width ?? node.width ?? node.style?.width, 0);
  const height = finiteNumber(runtimeNode.measured?.height ?? node.height ?? node.style?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: finiteNumber(position?.x, 0),
    y: finiteNumber(position?.y, 0),
    width,
    height,
  };
}

export function fallbackEndpointSide(handle: unknown): EndpointSide | null {
  const normalized = normalizeHandle(String(handle || ''));
  return normalized === 't' || normalized === 'b' || normalized === 'l' || normalized === 'r'
    ? normalized
    : null;
}

export function inferEndpointSide(
  point: EndpointPoint,
  rect: EndpointRect,
  handle: unknown,
): EndpointSide | null {
  const handleSide = fallbackEndpointSide(handle);
  const distances: Array<{ side: EndpointSide; distance: number }> = [
    { side: 't', distance: Math.abs(point.y - rect.y) },
    { side: 'b', distance: Math.abs(point.y - (rect.y + rect.height)) },
    { side: 'l', distance: Math.abs(point.x - rect.x) },
    { side: 'r', distance: Math.abs(point.x - (rect.x + rect.width)) },
  ];
  distances.sort((first, second) => first.distance - second.distance);
  const nearest = distances[0];
  const handleDistance = handleSide
    ? distances.find(item => item.side === handleSide)?.distance
    : undefined;
  if (handleSide && typeof handleDistance === 'number' && handleDistance <= ENDPOINT_SIDE_MATCH_TOLERANCE) {
    return handleSide;
  }
  if (nearest && nearest.distance <= ENDPOINT_SIDE_MATCH_TOLERANCE) return nearest.side;
  return handleSide ?? nearest?.side ?? null;
}

export function endpointPointIsOnSide(
  point: EndpointPoint,
  rect: EndpointRect,
  side: EndpointSide,
  tolerance = ENDPOINT_SIDE_MATCH_TOLERANCE,
): boolean {
  switch (side) {
    case 't':
      return Math.abs(point.y - rect.y) <= tolerance
        && point.x >= rect.x - tolerance
        && point.x <= rect.x + rect.width + tolerance;
    case 'b':
      return Math.abs(point.y - (rect.y + rect.height)) <= tolerance
        && point.x >= rect.x - tolerance
        && point.x <= rect.x + rect.width + tolerance;
    case 'l':
      return Math.abs(point.x - rect.x) <= tolerance
        && point.y >= rect.y - tolerance
        && point.y <= rect.y + rect.height + tolerance;
    case 'r':
      return Math.abs(point.x - (rect.x + rect.width)) <= tolerance
        && point.y >= rect.y - tolerance
        && point.y <= rect.y + rect.height + tolerance;
  }
}

export function projectEndpointPointToSide(
  point: EndpointPoint,
  rect: EndpointRect,
  side: EndpointSide,
): EndpointPoint {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const farX = point.x < rect.x - rect.width * 0.25 || point.x > rect.x + rect.width * 1.25;
  const farY = point.y < rect.y - rect.height * 0.25 || point.y > rect.y + rect.height * 1.25;
  switch (side) {
    case 't':
      return { x: farX ? centerX : clampEndpointValue(point.x, rect.x, rect.x + rect.width), y: rect.y };
    case 'b':
      return { x: farX ? centerX : clampEndpointValue(point.x, rect.x, rect.x + rect.width), y: rect.y + rect.height };
    case 'l':
      return { x: rect.x, y: farY ? centerY : clampEndpointValue(point.y, rect.y, rect.y + rect.height) };
    case 'r':
      return { x: rect.x + rect.width, y: farY ? centerY : clampEndpointValue(point.y, rect.y, rect.y + rect.height) };
  }
}
