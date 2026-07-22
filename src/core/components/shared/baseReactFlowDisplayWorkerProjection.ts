import type { Edge, Node } from '@xyflow/react';
import { DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE } from './baseReactFlowDisplayWorkerProtocol';

const DISPLAY_WORKER_VALUE_DEPTH = 8;
const DISPLAY_WORKER_MAX_ARRAY_ITEMS = 2_000;
const DISPLAY_WORKER_MAX_OBJECT_KEYS = 120;

const finiteNumberOrUndefined = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const projectDisplayWorkerValue = (value: unknown, depth = 0): unknown => {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.length <= 20_000 ? value : value.slice(0, 20_000);
  if (Array.isArray(value)) {
    if (depth >= DISPLAY_WORKER_VALUE_DEPTH || value.length > DISPLAY_WORKER_MAX_ARRAY_ITEMS) return undefined;
    return value
      .map(item => projectDisplayWorkerValue(item, depth + 1))
      .filter(item => typeof item !== 'undefined');
  }
  if (typeof value !== 'object' || depth >= DISPLAY_WORKER_VALUE_DEPTH) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > DISPLAY_WORKER_MAX_OBJECT_KEYS) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    const projected = projectDisplayWorkerValue(item, depth + 1);
    if (typeof projected !== 'undefined') next[key] = projected;
  }
  return next;
};

const projectDisplayWorkerStyleDimension = (value: unknown): number | string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE) {
    return value;
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) return undefined;
  const match = value.trim().match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)?$/i);
  if (!match || Number.parseFloat(value) > DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE) return undefined;
  return value;
};

const projectDisplayWorkerPosition = (value: unknown, fallback = { x: 0, y: 0 }) => {
  const point = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    x: finiteNumberOrUndefined(point.x) ?? fallback.x,
    y: finiteNumberOrUndefined(point.y) ?? fallback.y,
  };
};

const projectDisplayWorkerNodes = (nodes: Node[]): Node[] => nodes.map((node) => {
  const extendedNode = node as Node & { positionAbsolute?: unknown };
  const style = node.style && typeof node.style === 'object' ? node.style as Record<string, unknown> : {};
  const data = node.data && typeof node.data === 'object' ? node.data as Record<string, unknown> : {};
  const projectedStyle = {
    width: projectDisplayWorkerStyleDimension(style.width),
    height: projectDisplayWorkerStyleDimension(style.height),
  };
  const projectedLayoutDirection = projectDisplayWorkerValue(data.layoutDirection);
  return {
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    position: projectDisplayWorkerPosition(node.position),
    positionAbsolute: extendedNode.positionAbsolute
      ? projectDisplayWorkerPosition(extendedNode.positionAbsolute)
      : undefined,
    width: finiteNumberOrUndefined(node.width),
    height: finiteNumberOrUndefined(node.height),
    measured: node.measured && typeof node.measured === 'object'
      ? {
        width: finiteNumberOrUndefined(node.measured.width),
        height: finiteNumberOrUndefined(node.measured.height),
      }
      : undefined,
    style: Object.values(projectedStyle).some(value => typeof value !== 'undefined') ? projectedStyle : undefined,
    data: typeof projectedLayoutDirection === 'undefined' ? {} : { layoutDirection: projectedLayoutDirection },
  } as Node;
});

const projectDisplayWorkerEdges = (edges: Edge[]): Edge[] => edges.map((edge) => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle,
  targetHandle: edge.targetHandle,
  type: edge.type,
  label: projectDisplayWorkerValue(edge.label),
  animated: edge.animated,
  style: projectDisplayWorkerValue(edge.style),
  markerStart: projectDisplayWorkerValue(edge.markerStart),
  markerEnd: projectDisplayWorkerValue(edge.markerEnd),
  data: projectDisplayWorkerValue(edge.data) ?? {},
} as Edge));

export const projectBaseReactFlowDisplayWorkerInput = ({
  edges,
  nodes,
}: { edges: Edge[]; nodes: Node[] }): { edges: Edge[]; nodes: Node[] } => ({
  edges: projectDisplayWorkerEdges(edges),
  nodes: projectDisplayWorkerNodes(nodes),
});
