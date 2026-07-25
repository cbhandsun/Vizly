import { useMemo } from 'react';

export interface SmartPathSimpleNode {
  id: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string;
  parentNode?: string;
  position?: { x: number; y: number };
  positionAbsolute?: { x: number; y: number };
  measured?: { width: number; height: number };
  data?: {
    collapsed?: boolean;
    expanded?: boolean;
    hidden?: boolean;
    isObstacle?: boolean;
    [key: string]: unknown;
  };
  style?: { zIndex?: number; [key: string]: unknown };
  zIndex?: number;
  computed?: { positionAbsolute?: { x: number; y: number }; [key: string]: unknown };
}

export interface SmartPathObstacleItem {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  type?: string;
  [key: string]: unknown;
}

export interface SmartPathObstacleRect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  padding?: number;
  isSoftZone?: boolean;
}

const IGNORED_OBSTACLE_TYPES = new Set([
  'group', 'subGroup', 'titleGroup', 'domain', 'subDomain', 'swimlane',
  'annotation', 'background', 'sticky', 'comment',
]);
const CONTAINER_TYPES = new Set(['group', 'subGroup', 'titleGroup', 'swimlane', 'domain', 'subDomain']);
const MAX_PARENT_DEPTH = 100;
const MAX_ABSOLUTE_COORDINATE = 1_000_000_000;
const MAX_OBSTACLE_DIMENSION = 10_000_000;

const finiteCoordinate = (value: unknown, fallback = 0): number =>
  typeof value === 'number'
  && Number.isFinite(value)
  && Math.abs(value) <= MAX_ABSOLUTE_COORDINATE
    ? value
    : fallback;

const finiteDimension = (...values: unknown[]): number => {
  for (const value of values) {
    if (
      typeof value === 'number'
      && Number.isFinite(value)
      && value > 0
      && value <= MAX_OBSTACLE_DIMENSION
    ) return value;
  }
  return 0;
};

const nodeBasePosition = (node: SmartPathSimpleNode): { x: number; y: number } => ({
  x: finiteCoordinate(node.position?.x, finiteCoordinate(node.x)),
  y: finiteCoordinate(node.position?.y, finiteCoordinate(node.y)),
});

export const getSmartPathAbsolutePosition = (
  node: SmartPathSimpleNode,
  nodeMap: ReadonlyMap<string, SmartPathSimpleNode>,
  visited = new Set<string>(),
): { x: number; y: number } => {
  const absolute = node.computed?.positionAbsolute ?? node.positionAbsolute;
  if (absolute) {
    return {
      x: finiteCoordinate(absolute.x, nodeBasePosition(node).x),
      y: finiteCoordinate(absolute.y, nodeBasePosition(node).y),
    };
  }

  const base = nodeBasePosition(node);
  const parentId = node.parentId || node.parentNode;
  if (!parentId || visited.has(node.id) || visited.size >= MAX_PARENT_DEPTH) return base;
  visited.add(node.id);
  const parent = nodeMap.get(parentId);
  if (!parent) return base;
  const parentPosition = getSmartPathAbsolutePosition(parent, nodeMap, visited);
  return {
    x: finiteCoordinate(parentPosition.x + base.x, base.x),
    y: finiteCoordinate(parentPosition.y + base.y, base.y),
  };
};

export const buildSmartPathObstacles = (
  simpleNodeMap: ReadonlyMap<string, SmartPathSimpleNode>,
  obstacles: readonly SmartPathObstacleItem[],
  source: string,
  target: string,
): { obstacleRects: SmartPathObstacleRect[]; containerBounds: SmartPathObstacleRect[] } => {
  const obstacleRects: SmartPathObstacleRect[] = [];
  const containerBounds: SmartPathObstacleRect[] = [];
  const addObstacle = (input: SmartPathObstacleRect, isContainer = false): void => {
    const rect = {
      ...input,
      x: finiteCoordinate(input.x),
      y: finiteCoordinate(input.y),
      width: finiteDimension(input.width),
      height: finiteDimension(input.height),
    };
    if (rect.width <= 0 || rect.height <= 0) return;
    (isContainer ? containerBounds : obstacleRects).push(rect);
  };

  if (Array.isArray(obstacles) && obstacles.length > 0) {
    for (const obstacle of obstacles) {
      const node = obstacle?.id ? simpleNodeMap.get(obstacle.id) : undefined;
      const type = String(obstacle?.type || node?.type || '');
      if (IGNORED_OBSTACLE_TYPES.has(type)) {
        if (CONTAINER_TYPES.has(type)) {
          addObstacle({
            id: obstacle?.id,
            x: finiteCoordinate(obstacle?.x),
            y: finiteCoordinate(obstacle?.y),
            width: finiteDimension(obstacle?.width),
            height: finiteDimension(obstacle?.height),
          }, true);
        }
        continue;
      }
      addObstacle({
        id: obstacle?.id,
        x: finiteCoordinate(obstacle?.x),
        y: finiteCoordinate(obstacle?.y),
        width: finiteDimension(obstacle?.width),
        height: finiteDimension(obstacle?.height),
      });
    }
    return { obstacleRects, containerBounds };
  }

  simpleNodeMap.forEach(node => {
    if (node.id === source || node.id === target) return;
    const type = String(node.type || '');
    const position = getSmartPathAbsolutePosition(node, simpleNodeMap);
    const width = finiteDimension(node.measured?.width, node.width);
    const height = finiteDimension(node.measured?.height, node.height);
    if (IGNORED_OBSTACLE_TYPES.has(type)) {
      if (CONTAINER_TYPES.has(type)) {
        addObstacle({ id: node.id, ...position, width, height }, true);
      }
      return;
    }
    if (node.data?.hidden || node.data?.isObstacle === false) return;
    const zIndex = typeof node.zIndex === 'number'
      ? node.zIndex
      : typeof node.style?.zIndex === 'number' ? node.style.zIndex : 0;
    if (zIndex < 0) return;
    addObstacle({ id: node.id, ...position, width, height });
  });
  return { obstacleRects, containerBounds };
};

export const useSmartPathObstacles = (
  simpleNodeMap: ReadonlyMap<string, SmartPathSimpleNode>,
  obstacles: readonly SmartPathObstacleItem[],
  source: string,
  target: string,
  enabled = true,
): { obstacleRects: SmartPathObstacleRect[]; containerBounds: SmartPathObstacleRect[] } => useMemo(
  () => enabled
    ? buildSmartPathObstacles(simpleNodeMap, obstacles, source, target)
    : { obstacleRects: [], containerBounds: [] },
  [enabled, simpleNodeMap, obstacles, source, target],
);
