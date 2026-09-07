import type { Node as ReactFlowNode } from '@xyflow/react';

import type { Rect } from './edgeDetachedOverlapCandidates';

type Point = { x: number; y: number };
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

const CONTAINER_TYPES = new Set([
  'titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane',
]);

const finiteNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const nodeRect = (node: ReactFlowNode): Rect | null => {
  const position = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = finiteNumber(node.measured?.width ?? node.width ?? node.style?.width);
  const height = finiteNumber(node.measured?.height ?? node.height ?? node.style?.height);
  if (width <= 1 || height <= 1) return null;
  return { x: finiteNumber(position.x), y: finiteNumber(position.y), width, height };
};

export type BusinessNodeClearanceRectContext = Readonly<{
  containerRects: Rect[];
  obstacles: Map<string, Rect>;
  rectsForTerminals: (sourceId: string, targetId: string) => Rect[];
}>;

export const createBusinessNodeClearanceRectContext = (
  nodes: readonly ReactFlowNode[],
): BusinessNodeClearanceRectContext => {
  const businessEntries: Array<readonly [string, Rect]> = [];
  const containerRects: Rect[] = [];
  for (const node of nodes) {
    const rect = nodeRect(node);
    if (!rect) continue;
    if (CONTAINER_TYPES.has(String(node.type ?? ''))) containerRects.push(rect);
    else businessEntries.push([node.id, rect]);
  }
  const obstacles = new Map(businessEntries);
  const terminalRectCache = new Map<string, Rect[]>();
  const rectsForTerminals = (sourceId: string, targetId: string): Rect[] => {
    const key = JSON.stringify([sourceId, targetId]);
    const cached = terminalRectCache.get(key);
    if (cached) return cached;
    const rects = businessEntries.flatMap(([nodeId, rect]) => (
      nodeId === sourceId || nodeId === targetId ? [] : [rect]
    ));
    terminalRectCache.set(key, rects);
    return rects;
  };
  const contains = (outer: Rect, inner: Rect): boolean => (
    outer.x <= inner.x && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height
  );
  // A visual wrapper around exactly the same business nodes adds no domain
  // partition. Do not turn its smaller padding into another hard routing wall.
  const membership = containerRects.map(rect => businessEntries
    .flatMap(([id, businessRect]) => contains(rect, businessRect) ? [id] : [])
    .sort()).map(ids => JSON.stringify(ids));
  const effectiveContainerRects = containerRects.filter((rect, index) => !containerRects.some(
    (other, otherIndex) => otherIndex !== index && contains(other, rect)
      && membership[index] !== '[]' && membership[index] === membership[otherIndex]
      && (other.x < rect.x || other.y < rect.y
        || other.width > rect.width || other.height > rect.height || otherIndex < index),
  ));
  return { containerRects: effectiveContainerRects, obstacles, rectsForTerminals };
};
