import type { Edge, Node } from '@xyflow/react';

type Point = { x: number; y: number };

export interface ForceLayoutOptions {
  /** 迭代次数（默认 50） */
  iterations?: number;
  /** 理想节点间距（默认 150） */
  idealDistance?: number;
  /** 步长衰减（默认 0.3） */
  stepSize?: number;
  /** 显式自动布局可使用稳定圆形种子，避免结果依赖上一次布局。 */
  initialization?: 'current' | 'deterministic';
}

const DEFAULT_ITERATIONS = 50;
const MAX_ITERATIONS = 500;
const DEFAULT_IDEAL_DISTANCE = 150;
const MAX_IDEAL_DISTANCE = 10_000;
const DEFAULT_STEP_SIZE = 0.3;
const MAX_STEP_SIZE = 1;

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => Math.min(maximum, Math.max(minimum, finiteOr(value, fallback)));

const readNodeDimension = (node: Node, dimension: 'width' | 'height', fallback: number): number => {
  const measured = node.measured?.[dimension];
  if (typeof measured === 'number' && Number.isFinite(measured) && measured >= 0) return measured;

  const candidate = (node as unknown as Record<string, unknown>)[dimension];
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : fallback;
};

const isFinitePoint = (point: Point | undefined): point is Point =>
  point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y);

/**
 * 力导向布局 (Spring-Force 模型)。
 * 所有数值选项在进入 O(n²) 迭代前都会被限制，避免异常输入拖垮主线程。
 */
export function forceDirectedLayout(
  nodes: Node[],
  edges: Edge[],
  options: ForceLayoutOptions = {},
): Map<string, Point> {
  const iterations = Math.trunc(boundedNumber(
    options?.iterations,
    DEFAULT_ITERATIONS,
    0,
    MAX_ITERATIONS,
  ));
  const idealDistance = boundedNumber(
    options?.idealDistance,
    DEFAULT_IDEAL_DISTANCE,
    1,
    MAX_IDEAL_DISTANCE,
  );
  const stepSize = boundedNumber(options?.stepSize, DEFAULT_STEP_SIZE, 0, MAX_STEP_SIZE);
  const deterministicInitialization = options?.initialization === 'deterministic';

  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;

  const workingPositions: Record<string, Point> = Object.create(null) as Record<string, Point>;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    workingPositions[node.id] = {
      x: deterministicInitialization
        ? 400 + Math.cos(index * 2.4) * 200
        : finiteOr(node.position?.x, 400 + Math.cos(index * 2.4) * 200),
      y: deterministicInitialization
        ? 300 + Math.sin(index * 2.4) * 200
        : finiteOr(node.position?.y, 300 + Math.sin(index * 2.4) * 200),
    };
  }

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex++) {
        const left = workingPositions[nodes[leftIndex].id];
        const right = workingPositions[nodes[rightIndex].id];
        const deltaX = right.x - left.x;
        const deltaY = right.y - left.y;
        const distance = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 1);
        const force = (idealDistance * idealDistance) / distance;
        const forceX = (deltaX / distance) * force * stepSize;
        const forceY = (deltaY / distance) * force * stepSize;
        left.x -= forceX;
        left.y -= forceY;
        right.x += forceX;
        right.y += forceY;
      }
    }

    for (const edge of edges) {
      const source = workingPositions[edge.source];
      const target = workingPositions[edge.target];
      if (!source || !target) continue;

      const deltaX = target.x - source.x;
      const deltaY = target.y - source.y;
      const distance = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 1);
      const force = (distance - idealDistance) / idealDistance;
      const forceX = (deltaX / distance) * force * stepSize * 0.5;
      const forceY = (deltaY / distance) * force * stepSize * 0.5;
      source.x += forceX;
      source.y += forceY;
      target.x -= forceX;
      target.y -= forceY;
    }
  }

  let minimumX = Infinity;
  let minimumY = Infinity;
  for (const point of Object.values(workingPositions)) {
    minimumX = Math.min(minimumX, point.x);
    minimumY = Math.min(minimumY, point.y);
  }

  for (const node of nodes) {
    const point = workingPositions[node.id];
    positions.set(node.id, {
      x: point.x - minimumX + 100,
      y: point.y - minimumY + 100,
    });
  }

  return positions;
}

/** 将有效布局结果应用到 React Flow 节点数组。 */
export function applyLayout(nodes: Node[], positions: Map<string, Point>): Node[] {
  return nodes.map(node => {
    const position = positions.get(node.id);
    if (!isFinitePoint(position)) return node;
    return { ...node, position: { x: position.x, y: position.y } };
  });
}

/** 计算概要大括号 (Summary Bracket) 的几何范围。 */
export function calculateSummaryGeometry(
  targetIds: string[],
  nodePositions: Map<string, Point>,
  nodeMap: Map<string, Node>,
  direction: string = 'LR',
) {
  let minimumY = Infinity;
  let maximumY = -Infinity;
  let maximumX = -Infinity;
  let minimumX = Infinity;

  for (const targetId of targetIds) {
    const node = nodeMap.get(targetId);
    const position = nodePositions.get(targetId);
    if (!node || !isFinitePoint(position)) continue;

    const height = readNodeDimension(node, 'height', 40);
    const width = readNodeDimension(node, 'width', 120);
    minimumY = Math.min(minimumY, position.y);
    maximumY = Math.max(maximumY, position.y + height);
    maximumX = Math.max(maximumX, position.x + width);
    minimumX = Math.min(minimumX, position.x);
  }

  if (minimumY === Infinity) return null;

  const isLeft = direction === 'L';
  return {
    minY: minimumY,
    maxY: maximumY,
    x: isLeft ? minimumX - 15 : maximumX + 15,
    dir: isLeft ? 'L' : 'R',
  };
}

/** 计算包裹指定节点及其子孙节点的外框范围。 */
export function calculateSubtreeBounds(
  rootId: string,
  nodePositions: Map<string, Point>,
  nodeMap: Map<string, Node>,
  childrenMap: Map<string, string[]>,
) {
  const descendants = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || descendants.has(id)) continue;
    descendants.add(id);
    for (const childId of childrenMap.get(id) ?? []) stack.push(childId);
  }

  let minimumX = Infinity;
  let minimumY = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;

  for (const id of descendants) {
    const position = nodePositions.get(id);
    const node = nodeMap.get(id);
    if (!node || !isFinitePoint(position)) continue;

    const width = readNodeDimension(node, 'width', 140);
    const height = readNodeDimension(node, 'height', 44);
    minimumX = Math.min(minimumX, position.x);
    minimumY = Math.min(minimumY, position.y);
    maximumX = Math.max(maximumX, position.x + width);
    maximumY = Math.max(maximumY, position.y + height);
  }

  if (minimumX === Infinity) return null;

  const padding = 24;
  return {
    x: minimumX - padding,
    y: minimumY - padding,
    width: maximumX - minimumX + padding * 2,
    height: maximumY - minimumY + padding * 2,
  };
}
