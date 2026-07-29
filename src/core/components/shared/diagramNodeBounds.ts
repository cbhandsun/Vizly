import type { Node, XYPosition } from '@xyflow/react';

export interface DiagramNodeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;
const MAX_NODE_DIMENSION = 100_000;

const readPositiveDimension = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, MAX_NODE_DIMENSION)
    : fallback;

const getAbsoluteNodePosition = (node: Node): XYPosition | undefined => {
  const positionedNode = node as Node & {
    positionAbsolute?: XYPosition;
    computed?: { positionAbsolute?: XYPosition };
  };
  return positionedNode.positionAbsolute ?? positionedNode.computed?.positionAbsolute;
};

const isFinitePosition = (
  position: XYPosition | undefined,
): position is XYPosition =>
  !!position && Number.isFinite(position.x) && Number.isFinite(position.y);

const resolveNestedPosition = (
  node: Node,
  nodeById: ReadonlyMap<string, Node>,
): XYPosition => {
  let x = Number.isFinite(node.position?.x) ? node.position.x : 0;
  let y = Number.isFinite(node.position?.y) ? node.position.y : 0;
  let current: Node | undefined = node;
  const visited = new Set<string>([node.id]);

  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = nodeById.get(current.parentId);
    if (!parent) break;
    if (Number.isFinite(parent.position?.x)) x += parent.position.x;
    if (Number.isFinite(parent.position?.y)) y += parent.position.y;
    current = parent;
  }

  return { x, y };
};

export const computeDiagramNodeBounds = (
  nodes: readonly Node[],
): DiagramNodeBounds | null => {
  const visibleNodes = nodes.filter(node => !node.hidden);
  if (visibleNodes.length === 0) return null;

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of visibleNodes) {
    const absolutePosition = getAbsoluteNodePosition(node);
    const position = isFinitePosition(absolutePosition)
      ? absolutePosition
      : resolveNestedPosition(node, nodeById);
    const width = readPositiveDimension(
      node.width ?? node.measured?.width ?? node.style?.width,
      DEFAULT_NODE_WIDTH,
    );
    const height = readPositiveDimension(
      node.height ?? node.measured?.height ?? node.style?.height,
      DEFAULT_NODE_HEIGHT,
    );

    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + width);
    maxY = Math.max(maxY, position.y + height);
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};
