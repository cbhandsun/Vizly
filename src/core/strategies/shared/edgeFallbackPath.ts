import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { normalizeHandle } from '../../routing/utils/handleUtils';

export interface EdgeFallbackPoint {
  x: number;
  y: number;
}

type NodeLookup = Map<string, ReactFlowNode>;

const toNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getNodePosition(
  node: ReactFlowNode,
  nodeById?: NodeLookup,
): EdgeFallbackPoint {
  const explicitAbsolute = (node as any).positionAbsolute;
  if (explicitAbsolute) {
    return {
      x: toNumber(explicitAbsolute.x, 0),
      y: toNumber(explicitAbsolute.y, 0),
    };
  }

  let x = toNumber((node.position as any)?.x, 0);
  let y = toNumber((node.position as any)?.y, 0);
  let current = node;
  const visited = new Set<string>();
  while (nodeById && current.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = nodeById.get(current.parentId);
    if (!parent) break;
    const parentPosition = (parent as any).positionAbsolute ?? parent.position ?? { x: 0, y: 0 };
    x += toNumber((parentPosition as any).x, 0);
    y += toNumber((parentPosition as any).y, 0);
    if ((parent as any).positionAbsolute) break;
    current = parent;
  }
  return { x, y };
}

function getNodeSize(node: ReactFlowNode): { width: number; height: number } {
  return {
    width: toNumber((node.style as any)?.width, toNumber((node as any).measured?.width, toNumber(node.width, 120))),
    height: toNumber((node.style as any)?.height, toNumber((node as any).measured?.height, toNumber(node.height, 60))),
  };
}

function anchorForHandle(
  node: ReactFlowNode,
  handle: string | null | undefined,
  nodeById?: NodeLookup,
): EdgeFallbackPoint {
  const position = getNodePosition(node, nodeById);
  const size = getNodeSize(node);
  switch (normalizeHandle(String(handle || ''))) {
    case 'l':
      return { x: position.x, y: position.y + size.height / 2 };
    case 'r':
      return { x: position.x + size.width, y: position.y + size.height / 2 };
    case 't':
      return { x: position.x + size.width / 2, y: position.y };
    case 'b':
      return { x: position.x + size.width / 2, y: position.y + size.height };
    default:
      return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  }
}

function offsetOutward(point: EdgeFallbackPoint, handle: string | null | undefined, distance: number): EdgeFallbackPoint {
  switch (normalizeHandle(String(handle || ''))) {
    case 'l':
      return { x: point.x - distance, y: point.y };
    case 'r':
      return { x: point.x + distance, y: point.y };
    case 't':
      return { x: point.x, y: point.y - distance };
    case 'b':
      return { x: point.x, y: point.y + distance };
    default:
      return { x: point.x, y: point.y + distance };
  }
}

function preferredBend(
  sourceStub: EdgeFallbackPoint,
  targetStub: EdgeFallbackPoint,
  sourceHandle: string | null | undefined,
): EdgeFallbackPoint {
  const sourceAxis = ['l', 'r'].includes(normalizeHandle(String(sourceHandle || ''))) ? 'h' : 'v';
  return sourceAxis === 'h'
    ? { x: targetStub.x, y: sourceStub.y }
    : { x: sourceStub.x, y: targetStub.y };
}

function simplifyOrthogonalPath(points: EdgeFallbackPoint[]): EdgeFallbackPoint[] {
  const deduped: EdgeFallbackPoint[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > 0.5 || Math.abs(previous.y - point.y) > 0.5) {
      deduped.push({ x: Math.round(point.x), y: Math.round(point.y) });
    }
  }
  if (deduped.length <= 2) return deduped;

  const simplified: EdgeFallbackPoint[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[i];
    const next = deduped[i + 1];
    const sameX = Math.abs(previous.x - current.x) < 0.5 && Math.abs(current.x - next.x) < 0.5;
    const sameY = Math.abs(previous.y - current.y) < 0.5 && Math.abs(current.y - next.y) < 0.5;
    if (!sameX && !sameY) simplified.push(current);
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

export function buildEndpointOrthogonalFallbackPath({
  source,
  target,
  sourceHandle,
  targetHandle,
  nodeById,
  stubLength = 32,
}: {
  source: ReactFlowNode;
  target: ReactFlowNode;
  sourceHandle: string | null | undefined;
  targetHandle: string | null | undefined;
  nodeById?: NodeLookup;
  stubLength?: number;
}): EdgeFallbackPoint[] {
  const start = anchorForHandle(source, sourceHandle, nodeById);
  const end = anchorForHandle(target, targetHandle, nodeById);
  const sourceStub = offsetOutward(start, sourceHandle, stubLength);
  const targetStub = offsetOutward(end, targetHandle, stubLength);
  const bend = preferredBend(sourceStub, targetStub, sourceHandle);

  return simplifyOrthogonalPath([
    start,
    sourceStub,
    bend,
    targetStub,
    end,
  ]);
}

export function resolveRoutingResultPath({
  routingResult,
  source,
  target,
  nodeById,
}: {
  routingResult: { sourceHandle?: string | null; targetHandle?: string | null; computedPath?: EdgeFallbackPoint[] };
  source: ReactFlowNode;
  target: ReactFlowNode;
  nodeById?: NodeLookup;
}): EdgeFallbackPoint[] {
  if (Array.isArray(routingResult.computedPath) && routingResult.computedPath.length >= 2) {
    return routingResult.computedPath;
  }
  return buildEndpointOrthogonalFallbackPath({
    source,
    target,
    sourceHandle: routingResult.sourceHandle,
    targetHandle: routingResult.targetHandle,
    nodeById,
  });
}

export function lockComputedPathOnEdge(edge: Edge, computedPath: EdgeFallbackPoint[]): void {
  if (computedPath.length < 2) return;
  if (!edge.data) edge.data = {};
  (edge.data as any).computedPath = computedPath;
  (edge.data as any).layoutPathLocked = true;
  (edge.data as any).runtimeHandleLock = {
    ...(((edge.data as any).runtimeHandleLock && typeof (edge.data as any).runtimeHandleLock === 'object')
      ? (edge.data as any).runtimeHandleLock
      : {}),
    source: true,
    target: true,
  };
  edge.type = 'advanced-smart-step';
}
