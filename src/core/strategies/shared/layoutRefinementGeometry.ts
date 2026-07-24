import type { Edge, Node } from '@xyflow/react';

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

export interface LayoutRefinementLayer {
  index: number;
  y: number;
  nodeIds: string[];
}

export interface LayoutRefinementNodeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const positiveDimension = (value: unknown, fallback: number): number => {
  const numeric = finiteNumber(value, fallback);
  return numeric > 0 ? numeric : fallback;
};

export const buildNodeRects = (nodes: Node[]): LayoutRefinementNodeRect[] => nodes.map(node => ({
  id: node.id,
  x: finiteNumber(node.position?.x, 0),
  y: finiteNumber(node.position?.y, 0),
  w: positiveDimension(node.measured?.width ?? node.width, DEFAULT_NODE_WIDTH),
  h: positiveDimension(node.measured?.height ?? node.height, DEFAULT_NODE_HEIGHT),
}));

const makeLayer = (
  index: number,
  rects: LayoutRefinementNodeRect[],
  isHorizontal: boolean,
): LayoutRefinementLayer => {
  const coordinates = rects.map(rect => (isHorizontal ? rect.x : rect.y));
  return {
    index,
    y: coordinates.reduce((sum, value) => sum + value, 0) / coordinates.length,
    nodeIds: rects.map(rect => rect.id),
  };
};

export const assignLayers = (
  rects: LayoutRefinementNodeRect[],
  tolerance: number,
  isHorizontal: boolean,
): LayoutRefinementLayer[] => {
  if (rects.length === 0) return [];
  const safeTolerance = Math.max(0, finiteNumber(tolerance, 0));
  const sorted = [...rects].sort((left, right) => (
    (isHorizontal ? left.x : left.y) - (isHorizontal ? right.x : right.y)
  ));
  const layers: LayoutRefinementLayer[] = [];
  let currentLayer = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = isHorizontal ? sorted[index - 1].x : sorted[index - 1].y;
    const current = isHorizontal ? sorted[index].x : sorted[index].y;
    if (current - previous <= safeTolerance) {
      currentLayer.push(sorted[index]);
    } else {
      layers.push(makeLayer(layers.length, currentLayer, isHorizontal));
      currentLayer = [sorted[index]];
    }
  }
  layers.push(makeLayer(layers.length, currentLayer, isHorizontal));
  return layers;
};

const direction = (
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): number => ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

const segmentsIntersect = (
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean => {
  const d1 = direction(x3, y3, x4, y4, x1, y1);
  const d2 = direction(x3, y3, x4, y4, x2, y2);
  const d3 = direction(x1, y1, x2, y2, x3, y3);
  const d4 = direction(x1, y1, x2, y2, x4, y4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

export const countCrossings = (
  edges: Edge[],
  rectMap: Map<string, LayoutRefinementNodeRect>,
): number => {
  let crossings = 0;
  const edgeList = edges.filter(edge => rectMap.has(edge.source) && rectMap.has(edge.target));
  for (let leftIndex = 0; leftIndex < edgeList.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < edgeList.length; rightIndex += 1) {
      const left = edgeList[leftIndex];
      const right = edgeList[rightIndex];
      if (left.source === right.source || left.source === right.target
        || left.target === right.source || left.target === right.target) continue;
      const leftSource = rectMap.get(left.source)!;
      const leftTarget = rectMap.get(left.target)!;
      const rightSource = rectMap.get(right.source)!;
      const rightTarget = rectMap.get(right.target)!;
      if (segmentsIntersect(
        leftSource.x + leftSource.w / 2, leftSource.y + leftSource.h / 2,
        leftTarget.x + leftTarget.w / 2, leftTarget.y + leftTarget.h / 2,
        rightSource.x + rightSource.w / 2, rightSource.y + rightSource.h / 2,
        rightTarget.x + rightTarget.w / 2, rightTarget.y + rightTarget.h / 2,
      )) crossings += 1;
    }
  }
  return crossings;
};

export const findBlockingNodes = (
  source: LayoutRefinementNodeRect,
  target: LayoutRefinementNodeRect,
  allRects: LayoutRefinementNodeRect[],
): LayoutRefinementNodeRect[] => {
  const sourceCenterX = source.x + source.w / 2;
  const sourceCenterY = source.y + source.h / 2;
  const targetCenterX = target.x + target.w / 2;
  const targetCenterY = target.y + target.h / 2;
  const minX = Math.min(sourceCenterX, targetCenterX);
  const maxX = Math.max(sourceCenterX, targetCenterX);
  const minY = Math.min(sourceCenterY, targetCenterY);
  const maxY = Math.max(sourceCenterY, targetCenterY);
  const halfWidth = Math.min(source.w, target.w, source.h, target.h) / 2;

  return allRects.filter(rect => {
    if (rect.id === source.id || rect.id === target.id) return false;
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;
    return centerX + rect.w / 2 > minX - halfWidth
      && centerX - rect.w / 2 < maxX + halfWidth
      && centerY + rect.h / 2 > minY - halfWidth
      && centerY - rect.h / 2 < maxY + halfWidth;
  });
};

export const estimateDetourRatio = (
  source: LayoutRefinementNodeRect,
  target: LayoutRefinementNodeRect,
  allRects: LayoutRefinementNodeRect[],
): number => {
  const manhattan = Math.abs(target.x - source.x) + Math.abs(target.y - source.y);
  if (manhattan < 1) return 1;
  const blockers = findBlockingNodes(source, target, allRects);
  if (blockers.length === 0) return 1;
  const extraDistance = blockers.reduce((sum, blocker) => sum + blocker.w + blocker.h, 0);
  return (manhattan + extraDistance) / manhattan;
};

export const rectsOverlap = (
  left: LayoutRefinementNodeRect,
  right: LayoutRefinementNodeRect,
  margin: number,
): boolean => {
  const safeMargin = Math.max(0, finiteNumber(margin, 0));
  return !(left.x + left.w + safeMargin <= right.x
    || right.x + right.w + safeMargin <= left.x
    || left.y + left.h + safeMargin <= right.y
    || right.y + right.h + safeMargin <= left.y);
};
