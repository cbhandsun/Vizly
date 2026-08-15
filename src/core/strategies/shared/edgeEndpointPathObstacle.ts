import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  endpointNodeRect as nodeRect,
  type EndpointPoint as Point,
  type EndpointRect as Rect,
} from './edgeEndpointGeometry';

const EPS = 0.5;

const isContainerNode = (node: ReactFlowNode | undefined): boolean => (
  new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])
    .has(String(node?.type ?? ''))
);

const segmentIntersectsRect = (a: Point, b: Point, rect: Rect, padding = 12): boolean => {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(a.y - b.y) <= EPS) {
    if (a.y < y1 || a.y > y2) return false;
    return Math.max(Math.min(a.x, b.x), x1) < Math.min(Math.max(a.x, b.x), x2);
  }
  if (Math.abs(a.x - b.x) <= EPS) {
    if (a.x < x1 || a.x > x2) return false;
    return Math.max(Math.min(a.y, b.y), y1) < Math.min(Math.max(a.y, b.y), y2);
  }
  return false;
};

export const endpointSegmentHitsUnrelatedNode = (
  edge: Edge,
  a: Point,
  b: Point,
  nodeById: ReadonlyMap<string, ReactFlowNode>,
): boolean => {
  for (const node of nodeById.values()) {
    if (node.id === edge.source || node.id === edge.target || isContainerNode(node)) continue;
    const rect = nodeRect(node);
    if (rect && segmentIntersectsRect(a, b, rect, 2)) return true;
  }
  return false;
};

export const pathHitsUnrelatedNode = (
  edge: Edge,
  path: readonly Point[],
  nodeById: ReadonlyMap<string, ReactFlowNode>,
): boolean => {
  for (let index = 0; index < path.length - 1; index += 1) {
    if (endpointSegmentHitsUnrelatedNode(edge, path[index], path[index + 1], nodeById)) return true;
  }
  return false;
};
