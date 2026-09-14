import type { Edge, Node, XYPosition } from '@xyflow/react';
import { coerceDiagramSidebarOffset } from './diagramControlFit';

export type DiagramReadingDirection = 'TB' | 'BT' | 'LR' | 'RL';

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

const CONTAINER_NODE_TYPES = new Set([
  'group',
  'subGroup',
  'subGroupNode',
  'titleGroup',
  'titleGroupNode',
  'domain',
  'subDomain',
  'swimlane',
]);

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;
const MAX_DIMENSION = 1_000_000_000;
const READING_TOP = 84;
const READING_PADDING = 12;
const MIN_READING_ZOOM = 0.45;
const MAX_READING_ZOOM = 1.15;

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const readPositiveDimension = (value: unknown, fallback: number): number => (
  isFiniteNumber(value) && value > 0 ? Math.min(value, MAX_DIMENSION) : fallback
);

const absolutePosition = (
  node: Node,
  nodeById: ReadonlyMap<string, Node>,
): XYPosition => {
  const positioned = node as Node & {
    positionAbsolute?: XYPosition;
    computed?: { positionAbsolute?: XYPosition };
  };
  const absolute = positioned.positionAbsolute ?? positioned.computed?.positionAbsolute;
  if (absolute && isFiniteNumber(absolute.x) && isFiniteNumber(absolute.y)) return absolute;

  let x = isFiniteNumber(node.position?.x) ? node.position.x : 0;
  let y = isFiniteNumber(node.position?.y) ? node.position.y : 0;
  let current: Node | undefined = node;
  const visited = new Set<string>([node.id]);
  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = nodeById.get(current.parentId);
    if (!parent) break;
    if (isFiniteNumber(parent.position?.x)) x += parent.position.x;
    if (isFiniteNumber(parent.position?.y)) y += parent.position.y;
    current = parent;
  }
  return { x, y };
};

const isVisible = (node: Node): boolean => !node.hidden && node.data?.hidden !== true;

const isContainerNode = (node: Node): boolean => CONTAINER_NODE_TYPES.has(String(node.type || ''));

const nodeRect = (
  node: Node,
  nodeById: ReadonlyMap<string, Node>,
): Bounds => {
  const position = absolutePosition(node, nodeById);
  const width = readPositiveDimension(
    node.width ?? node.measured?.width ?? node.style?.width,
    DEFAULT_NODE_WIDTH,
  );
  const height = readPositiveDimension(
    node.height ?? node.measured?.height ?? node.style?.height,
    DEFAULT_NODE_HEIGHT,
  );
  return {
    minX: position.x,
    minY: position.y,
    maxX: position.x + width,
    maxY: position.y + height,
    width,
    height,
  };
};

const boundsOf = (
  nodes: readonly Node[],
  nodeById: ReadonlyMap<string, Node>,
): Bounds | null => {
  if (nodes.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const rect = nodeRect(node, nodeById);
    minX = Math.min(minX, rect.minX);
    minY = Math.min(minY, rect.minY);
    maxX = Math.max(maxX, rect.maxX);
    maxY = Math.max(maxY, rect.maxY);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const collectDescendantIds = (
  selectedIds: ReadonlySet<string>,
  nodes: readonly Node[],
): Set<string> => {
  const result = new Set<string>(selectedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
};

const readingNodes = (
  nodes: readonly Node[],
  selectedNodeIds: readonly string[] = [],
): Node[] => {
  const visible = nodes.filter(isVisible);
  const leaves = visible.filter(node => !isContainerNode(node));
  if (leaves.length === 0) return visible;
  const selected = new Set(selectedNodeIds.filter(id => typeof id === 'string' && id.length > 0));
  if (selected.size === 0) return leaves;
  const scopedIds = collectDescendantIds(selected, visible);
  const scopedLeaves = leaves.filter(node => scopedIds.has(node.id));
  return scopedLeaves.length > 0 ? scopedLeaves : leaves.filter(node => selected.has(node.id));
};

export const inferDiagramReadingDirection = (
  nodes: readonly Node[],
  edges: readonly Edge[],
): DiagramReadingDirection => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  let dx = 0;
  let dy = 0;
  let count = 0;
  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target || !isVisible(source) || !isVisible(target)) continue;
    const sourceRect = nodeRect(source, nodeById);
    const targetRect = nodeRect(target, nodeById);
    dx += (targetRect.minX + targetRect.width / 2) - (sourceRect.minX + sourceRect.width / 2);
    dy += (targetRect.minY + targetRect.height / 2) - (sourceRect.minY + sourceRect.height / 2);
    count += 1;
  }
  if (count === 0 || Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'RL' : 'LR';
  return dy < 0 ? 'BT' : 'TB';
};

export const computeDiagramReadingViewport = ({
  nodes,
  edges,
  selectedNodeIds,
  viewportSize,
  leftSidebarOffset,
  rightSidebarOffset,
}: {
  nodes: readonly Node[];
  edges: readonly Edge[];
  selectedNodeIds?: readonly string[];
  viewportSize: Readonly<{ width: number; height: number }>;
  leftSidebarOffset?: string | number;
  rightSidebarOffset?: string | number;
}): { x: number; y: number; zoom: number; direction: DiagramReadingDirection } | null => {
  if (!Number.isFinite(viewportSize.width) || !Number.isFinite(viewportSize.height)
    || viewportSize.width <= 0 || viewportSize.height <= 0) return null;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const targetBounds = boundsOf(readingNodes(nodes, selectedNodeIds), nodeById);
  if (!targetBounds) return null;
  const direction = inferDiagramReadingDirection(nodes, edges);
  const safeLeft = coerceDiagramSidebarOffset(leftSidebarOffset, 76);
  const safeRight = coerceDiagramSidebarOffset(rightSidebarOffset);
  const safeWidth = Math.max(1, viewportSize.width - safeLeft - safeRight - READING_PADDING * 2);
  const safeHeight = Math.max(1, viewportSize.height - READING_TOP - READING_PADDING * 2);
  const targetWidth = Math.max(1, targetBounds.width);
  const targetHeight = Math.max(1, targetBounds.height);
  const axisZoom = direction === 'LR' || direction === 'RL'
    ? safeWidth / targetWidth
    : safeHeight / targetHeight;
  const crossZoom = direction === 'LR' || direction === 'RL'
    ? safeHeight / targetHeight
    : safeWidth / targetWidth;
  const zoom = Math.max(
    MIN_READING_ZOOM,
    Math.min(MAX_READING_ZOOM, Math.min(axisZoom, crossZoom)),
  );
  const extraX = Math.max(0, (safeWidth - targetWidth * zoom) / 2);
  return {
    x: safeLeft + READING_PADDING + extraX - targetBounds.minX * zoom,
    y: READING_TOP + READING_PADDING - targetBounds.minY * zoom,
    zoom,
    direction,
  };
};
