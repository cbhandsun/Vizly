import type { Edge, Node } from '@xyflow/react';

import { edgeRoutingQualityIntentToken } from '../../strategies/shared/edgeRoutingQualityIntent';
import { BASE_DISPLAY_ROUTING_VERSION } from './baseReactFlowDisplayCache';

const MAX_EDGES = 24;
const MAX_NODES = 500;
const MAX_POINTS_PER_EDGE = 2_000;
const MAX_TOTAL_POINTS = 20_000;
const MAX_TEXT_CHARS = 500;
const MAX_MANUAL_HANDLE_SIDES = 64;
const MAX_CANONICAL_KEY_CHARS = 2_000_000;
const MAX_ABS_GEOMETRY_VALUE = 1_000_000_000;
export const DISPLAY_CROSSING_CLUSTER_FIXED_POINT_CAPACITY = 16;

let fixedPointByEdges = new WeakMap<Edge[], string>();
const exactFixedPoints = new Map<string, true>();

class CanonicalKeyWriter {
  private readonly parts: string[] = [];
  private chars = 0;

  add(value: string): boolean {
    const part = `${value.length}:${value}`;
    this.chars += part.length;
    if (this.chars > MAX_CANONICAL_KEY_CHARS) return false;
    this.parts.push(part);
    return true;
  }

  finish(): string {
    return this.parts.join('');
  }
}

const boundedText = (value: unknown, required: boolean): string | null => (
  typeof value === 'string'
  && (!required || value.length > 0)
  && value.length <= MAX_TEXT_CHARS
    ? value
    : null
);

const optionalTextToken = (value: unknown): string | null => {
  if (typeof value === 'undefined') return 'undefined';
  if (value === null) return 'null';
  const text = boundedText(value, false);
  return text === null ? null : `string:${text}`;
};

const primitivePolicyToken = (value: unknown): string | null => {
  if (typeof value === 'undefined') return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length <= MAX_TEXT_CHARS ? `string:${value}` : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_GEOMETRY_VALUE) return null;
    return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
  }
  if (typeof value === 'boolean') return value ? 'boolean:true' : 'boolean:false';
  if (typeof value === 'bigint') {
    const text = String(value);
    return text.length <= MAX_TEXT_CHARS ? `bigint:${text}` : null;
  }
  return null;
};

const finiteNumberToken = (value: unknown): string | null => (
  typeof value === 'number'
  && Number.isFinite(value)
  && Math.abs(value) <= MAX_ABS_GEOMETRY_VALUE
    ? (Object.is(value, -0) ? '-0' : String(value))
    : null
);

const addTerminalPolicy = (
  writer: CanonicalKeyWriter,
  data: Record<string, unknown>,
): boolean => {
  const manualHandleSides = data.manualHandleSides;
  if (Array.isArray(manualHandleSides)) {
    if (
      manualHandleSides.length > MAX_MANUAL_HANDLE_SIDES
      || !writer.add('manual-array')
      || !writer.add(String(manualHandleSides.length))
    ) return false;
    for (const side of manualHandleSides) {
      const token = primitivePolicyToken(side);
      if (token === null || !writer.add(token)) return false;
    }
  } else {
    const token = primitivePolicyToken(manualHandleSides);
    if (token === null || !writer.add('manual-scalar') || !writer.add(token)) return false;
  }

  for (const field of [
    'sourceHandleLocked',
    'targetHandleLocked',
    'sourcePortPolicy',
    'targetPortPolicy',
    'sourcePortConstraint',
    'targetPortConstraint',
  ]) {
    const token = primitivePolicyToken(data[field]);
    if (token === null || !writer.add(field) || !writer.add(token)) return false;
  }
  return true;
};

const addComputedPath = (
  writer: CanonicalKeyWriter,
  value: unknown,
  pointBudget: { total: number },
): boolean => {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_POINTS_PER_EDGE) return false;
  pointBudget.total += value.length;
  if (pointBudget.total > MAX_TOTAL_POINTS || !writer.add(String(value.length))) return false;
  for (const point of value) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) return false;
    const x = finiteNumberToken((point as Record<string, unknown>).x);
    const y = finiteNumberToken((point as Record<string, unknown>).y);
    if (x === null || y === null || !writer.add(x) || !writer.add(y)) return false;
  }
  return true;
};

const selectedNodeSize = (
  node: Node,
  measured: Record<string, unknown> | undefined,
  style: Record<string, unknown> | undefined,
  axis: 'width' | 'height',
): unknown => measured?.[axis] ?? node[axis] ?? style?.[axis] ?? 0;

const addNodeGeometry = (writer: CanonicalKeyWriter, node: Node): boolean => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const id = boundedText(node.id, true);
  const type = optionalTextToken(node.type);
  const parentId = optionalTextToken((node as Node & { parentId?: unknown }).parentId);
  if (id === null || type === null || parentId === null) return false;

  const absolutePosition = (node as Node & { positionAbsolute?: unknown }).positionAbsolute;
  const rawPosition = absolutePosition ?? node.position ?? { x: 0, y: 0 };
  const measuredValue = (node as Node & { measured?: unknown }).measured;
  const styleValue = node.style;
  if (
    !rawPosition
    || typeof rawPosition !== 'object'
    || Array.isArray(rawPosition)
    || (measuredValue != null && (typeof measuredValue !== 'object' || Array.isArray(measuredValue)))
    || (styleValue != null && (typeof styleValue !== 'object' || Array.isArray(styleValue)))
  ) return false;

  const position = rawPosition as Record<string, unknown>;
  const measured = measuredValue as Record<string, unknown> | undefined;
  const style = styleValue as Record<string, unknown> | undefined;
  const x = finiteNumberToken(position.x ?? 0);
  const y = finiteNumberToken(position.y ?? 0);
  const width = finiteNumberToken(selectedNodeSize(node, measured, style, 'width'));
  const height = finiteNumberToken(selectedNodeSize(node, measured, style, 'height'));
  return x !== null
    && y !== null
    && width !== null
    && height !== null
    && writer.add(id)
    && writer.add(type)
    && writer.add(parentId)
    && writer.add(absolutePosition == null ? 'relative' : 'absolute')
    && writer.add(x)
    && writer.add(y)
    && writer.add(width)
    && writer.add(height);
};

/**
 * Builds the collision-independent identity used by the cross-reference negative cache.
 * Every component is length-framed; no hash is trusted for equality.
 */
export const createDisplayCrossingClusterFixedPointCanonicalKey = ({
  edges,
  nodes,
  routingVersion,
}: {
  edges: Edge[];
  nodes: Node[];
  routingVersion: string;
}): string | null => {
  if (
    !Array.isArray(edges)
    || edges.length === 0
    || edges.length > MAX_EDGES
    || !Array.isArray(nodes)
    || nodes.length > MAX_NODES
    || boundedText(routingVersion, true) === null
  ) return null;

  try {
    const writer = new CanonicalKeyWriter();
    const pointBudget = { total: 0 };
    if (
      !writer.add('crossing-cluster-fixed-point-v2')
      || !writer.add(routingVersion)
      || !writer.add(String(edges.length))
    ) return null;

    for (const edge of edges) {
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) return null;
      const id = boundedText(edge.id, true);
      const source = boundedText(edge.source, true);
      const target = boundedText(edge.target, true);
      const type = optionalTextToken(edge.type);
      const sourceHandle = optionalTextToken(edge.sourceHandle);
      const targetHandle = optionalTextToken(edge.targetHandle);
      if (
        id === null
        || source === null
        || target === null
        || type === null
        || sourceHandle === null
        || targetHandle === null
      ) return null;
      const rawData = edge.data;
      if (rawData != null && (typeof rawData !== 'object' || Array.isArray(rawData))) return null;
      const data = (rawData ?? {}) as Record<string, unknown>;
      if (
        !writer.add('edge')
        || !writer.add(id)
        || !writer.add(source)
        || !writer.add(target)
        || !writer.add(type)
        || !writer.add(sourceHandle)
        || !writer.add(targetHandle)
        || !writer.add(edgeRoutingQualityIntentToken(edge))
        || !addTerminalPolicy(writer, data)
        || !addComputedPath(writer, data.computedPath, pointBudget)
      ) return null;
    }

    if (!writer.add(String(nodes.length))) return null;
    for (const node of nodes) {
      if (!writer.add('node') || !addNodeGeometry(writer, node)) return null;
    }
    return writer.finish();
  } catch {
    return null;
  }
};

const createCurrentCanonicalKey = (edges: Edge[], nodes: Node[]): string | null => (
  createDisplayCrossingClusterFixedPointCanonicalKey({
    edges,
    nodes,
    routingVersion: BASE_DISPLAY_ROUTING_VERSION,
  })
);

const rememberExactKey = (key: string): void => {
  if (exactFixedPoints.has(key)) exactFixedPoints.delete(key);
  exactFixedPoints.set(key, true);
  while (exactFixedPoints.size > DISPLAY_CROSSING_CLUSTER_FIXED_POINT_CAPACITY) {
    const oldest = exactFixedPoints.keys().next().value;
    if (typeof oldest !== 'string') break;
    exactFixedPoints.delete(oldest);
  }
};

/** Returns true for an unchanged reference or an exactly identical canonical input. */
export const hasDisplayCrossingClusterFixedPoint = (
  edges: Edge[],
  nodes: Node[],
): boolean => {
  const current = createCurrentCanonicalKey(edges, nodes);
  if (current === null) return false;
  if (fixedPointByEdges.get(edges) === current) return true;
  if (!exactFixedPoints.has(current)) return false;
  rememberExactKey(current);
  fixedPointByEdges.set(edges, current);
  return true;
};

/** Remembers only that a complete bounded search returned this exact input unchanged. */
export const rememberDisplayCrossingClusterFixedPoint = (
  edges: Edge[],
  nodes: Node[],
): boolean => {
  const key = createCurrentCanonicalKey(edges, nodes);
  if (key === null) return false;
  fixedPointByEdges.set(edges, key);
  rememberExactKey(key);
  return true;
};

/** Test isolation only; production routing never clears realm-local exact fixed points. */
export const clearDisplayCrossingClusterFixedPointsForTests = (): void => {
  fixedPointByEdges = new WeakMap<Edge[], string>();
  exactFixedPoints.clear();
};
