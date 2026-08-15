import type { Edge, Node as ReactFlowNode, XYPosition } from '@xyflow/react';

export type RoutingNode = ReactFlowNode<Record<string, unknown>> & {
  positionAbsolute?: XYPosition;
};

export type RoutingEdgeData = Record<string, unknown>;

export const asRoutingRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const finiteRoutingNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value.trim().replace(/px$/i, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const routingNodeSize = (
  node: RoutingNode,
  fallbackWidth = 200,
  fallbackHeight = 80,
): { width: number; height: number } => ({
  width: finiteRoutingNumber(node.measured?.width ?? node.style?.width ?? node.width, fallbackWidth),
  height: finiteRoutingNumber(node.measured?.height ?? node.style?.height ?? node.height, fallbackHeight),
});

export const routingNodeAbsolutePosition = (node: RoutingNode): XYPosition =>
  node.positionAbsolute ?? node.position ?? { x: 0, y: 0 };

export const readDirectionalHandlePolicy = (
  value: unknown,
): 'prefer' | 'force' | 'off' =>
  value === 'force' || value === 'off' ? value : 'prefer';

export const readManualHandleSides = (data: RoutingEdgeData): string[] =>
  Array.isArray(data.manualHandleSides)
    ? data.manualHandleSides.map(side => String(side).toLowerCase())
    : [];

export const readManualHandleLocks = (
  data: RoutingEdgeData,
): { source: boolean; target: boolean } => {
  const sides = readManualHandleSides(data);
  const manualHandles = data.manualHandles ?? data._manualHandles;
  const manualHandleRecord = asRoutingRecord(manualHandles);
  return {
    source: sides.includes('source')
      || manualHandles === true
      || Boolean(manualHandleRecord.source),
    target: sides.includes('target')
      || manualHandles === true
      || Boolean(manualHandleRecord.target),
  };
};

export const applyAutoHandleData = (
  edge: Edge,
  autoSource: boolean | undefined,
  autoTarget: boolean | undefined,
): void => {
  const auto: string[] = [];
  if (autoSource) auto.push('source');
  if (autoTarget) auto.push('target');
  edge.data = {
    ...asRoutingRecord(edge.data),
    autoSource: Boolean(autoSource),
    autoTarget: Boolean(autoTarget),
    auto,
  };
};
