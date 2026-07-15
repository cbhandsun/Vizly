import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Side = 'top' | 'bottom' | 'left' | 'right';

export const EPS = 0.5;
export const MIN_BRANCH_SPAN = 24;
export const MIN_ENDPOINT_TAIL = 48;

export function compactPath(path: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ x: Math.round(point.x), y: Math.round(point.y) });
    }
  }
  if (deduped.length <= 2) return deduped;
  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - current.x) <= EPS && Math.abs(current.x - next.x) <= EPS;
    const sameY = Math.abs(previous.y - current.y) <= EPS && Math.abs(current.y - next.y) <= EPS;
    if (!sameX && !sameY) result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

export function signDelta(delta: number): number {
  if (delta > EPS) return 1;
  if (delta < -EPS) return -1;
  return 0;
}

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function absoluteNodePosition(
  node: ReactFlowNode | undefined,
  nodeById?: Map<string, ReactFlowNode>,
): Point {
  if (!node) return { x: 0, y: 0 };
  const explicit = (node as any).positionAbsolute ?? (node as any).computed?.positionAbsolute;
  if (explicit) {
    return {
      x: num((explicit as any).x, 0),
      y: num((explicit as any).y, 0),
    };
  }

  let x = num((node.position as any)?.x, 0);
  let y = num((node.position as any)?.y, 0);
  let current = node;
  const seen = new Set<string>();
  while (nodeById && current.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = nodeById.get(current.parentId);
    if (!parent) break;
    const parentPosition = (parent as any).positionAbsolute ?? (parent as any).computed?.positionAbsolute ?? parent.position;
    x += num((parentPosition as any)?.x, 0);
    y += num((parentPosition as any)?.y, 0);
    current = parent;
  }
  return { x, y };
}

export function nodeRect(
  node: ReactFlowNode | undefined,
  nodeById?: Map<string, ReactFlowNode>,
): Rect | null {
  if (!node) return null;
  const position = absoluteNodePosition(node, nodeById);
  const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 0);
  const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: position.x,
    y: position.y,
    width,
    height,
  };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function sideAnchor(rect: Rect, side: Side, preferredMain?: number): Point {
  if (side === 'top' || side === 'bottom') {
    return {
      x: clamp(num(preferredMain, rect.x + rect.width / 2), rect.x, rect.x + rect.width),
      y: side === 'top' ? rect.y : rect.y + rect.height,
    };
  }
  return {
    x: side === 'left' ? rect.x : rect.x + rect.width,
    y: clamp(num(preferredMain, rect.y + rect.height / 2), rect.y, rect.y + rect.height),
  };
}

function sideOffset(point: Point, side: Side, distance: number): Point {
  if (side === 'top') return { x: point.x, y: point.y - distance };
  if (side === 'bottom') return { x: point.x, y: point.y + distance };
  if (side === 'left') return { x: point.x - distance, y: point.y };
  return { x: point.x + distance, y: point.y };
}

export function oppositeSide(side: Side): Side {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  return 'left';
}

export function expectedTargetSideFromGeometry(sourceRect: Rect, targetRect: Rect): Side {
  const sourceCenter = rectCenter(sourceRect);
  const targetCenter = rectCenter(targetRect);
  const dx = sourceCenter.x - targetCenter.x;
  const dy = sourceCenter.y - targetCenter.y;
  if (Math.abs(dx) > Math.abs(dy) * 1.35) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

export function firstStepBacktracksFromTarget(path: Point[], sourceRect: Rect, targetRect: Rect): boolean {
  if (path.length < 2) return false;
  const sourceCenter = rectCenter(sourceRect);
  const targetCenter = rectCenter(targetRect);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const first = path[0];
  const second = path[1];
  if (Math.abs(dx) > Math.abs(dy) * 1.35) {
    const step = signDelta(second.x - first.x);
    const expected = signDelta(dx);
    return step !== 0 && expected !== 0 && step !== expected;
  }
  const step = signDelta(second.y - first.y);
  const expected = signDelta(dy);
  return step !== 0 && expected !== 0 && step !== expected;
}

function rectForPathHit(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  if (Math.abs(a.x - b.x) <= EPS) {
    const x = a.x;
    if (x <= rect.x || x >= rect.x + rect.width) return false;
    return Math.max(Math.min(a.y, b.y), rect.y) < Math.min(Math.max(a.y, b.y), rect.y + rect.height);
  }
  if (Math.abs(a.y - b.y) <= EPS) {
    const y = a.y;
    if (y <= rect.y || y >= rect.y + rect.height) return false;
    return Math.max(Math.min(a.x, b.x), rect.x) < Math.min(Math.max(a.x, b.x), rect.x + rect.width);
  }
  return false;
}

export function pathHitsUnrelatedNode(
  path: Point[],
  edge: Edge,
  nodeById: Map<string, ReactFlowNode>,
): boolean {
  const obstacles = [...nodeById.values()]
    .filter((node) => {
      if (node.id === edge.source || node.id === edge.target) return false;
      const type = String(node.type || '').toLowerCase();
      return !type.includes('group') && type !== 'titlegroup' && type !== 'subgroup';
    })
    .map(node => nodeRect(node, nodeById))
    .filter((rect): rect is Rect => !!rect)
    .map(rect => rectForPathHit(rect, 8));

  for (let index = 0; index < path.length - 1; index += 1) {
    for (const obstacle of obstacles) {
      if (segmentIntersectsRect(path[index], path[index + 1], obstacle)) return true;
    }
  }
  return false;
}

export function buildHemisphereTargetCandidatePaths(
  path: Point[],
  sourceRect: Rect,
  targetRect: Rect,
  sourceSide: Side,
  targetSide: Side,
): Point[][] {
  const start = path[0];
  const end = path[path.length - 1];
  if (!start || !end) return [];
  const verticalFlow = targetSide === 'top' || targetSide === 'bottom';
  const sourceAnchor = sideAnchor(
    sourceRect,
    sourceSide,
    verticalFlow ? start.x : start.y,
  );
  const targetAnchor = sideAnchor(
    targetRect,
    targetSide,
    verticalFlow ? end.x : end.y,
  );
  const sourceStub = sideOffset(sourceAnchor, sourceSide, MIN_ENDPOINT_TAIL);
  const targetStub = sideOffset(targetAnchor, targetSide, MIN_ENDPOINT_TAIL);
  const candidates: Point[][] = [];

  if (verticalFlow) {
    const leftLane = Math.min(sourceRect.x, targetRect.x) - MIN_ENDPOINT_TAIL;
    const rightLane = Math.max(sourceRect.x + sourceRect.width, targetRect.x + targetRect.width) + MIN_ENDPOINT_TAIL;
    const currentLane = Math.abs(start.x - end.x) <= MIN_BRANCH_SPAN
      ? start.x
      : (start.x + end.x) / 2;
    for (const laneX of [currentLane, leftLane, rightLane]) {
      candidates.push(compactPath([
        sourceAnchor,
        sourceStub,
        { x: laneX, y: sourceStub.y },
        { x: laneX, y: targetStub.y },
        targetStub,
        targetAnchor,
      ]));
    }
  } else {
    const topLane = Math.min(sourceRect.y, targetRect.y) - MIN_ENDPOINT_TAIL;
    const bottomLane = Math.max(sourceRect.y + sourceRect.height, targetRect.y + targetRect.height) + MIN_ENDPOINT_TAIL;
    const currentLane = Math.abs(start.y - end.y) <= MIN_BRANCH_SPAN
      ? start.y
      : (start.y + end.y) / 2;
    for (const laneY of [currentLane, topLane, bottomLane]) {
      candidates.push(compactPath([
        sourceAnchor,
        sourceStub,
        { x: sourceStub.x, y: laneY },
        { x: targetStub.x, y: laneY },
        targetStub,
        targetAnchor,
      ]));
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return candidate.length >= 2 && candidate.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  });
}
