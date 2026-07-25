import type { Node as ReactFlowNode } from '@xyflow/react';

export type LayoutNode = ReactFlowNode<Record<string, unknown>>;

export const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

export const asDomainRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const finiteDomainNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const nodeDomain = (node: LayoutNode | undefined): string =>
  String(node?.data.domain ?? '');

export const nodeChildren = (node: LayoutNode): string[] =>
  Array.isArray(node.data.children)
    ? node.data.children.filter((child): child is string => typeof child === 'string')
    : [];

export const nodeWidth = (node: LayoutNode, fallback: number): number =>
  finiteDomainNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback);

export const nodeHeight = (node: LayoutNode, fallback: number): number =>
  finiteDomainNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback);

export const nodeX = (node: LayoutNode, fallback = 0): number =>
  finiteDomainNumber(node.position.x, fallback);

export const nodeY = (node: LayoutNode, fallback = 0): number =>
  finiteDomainNumber(node.position.y, fallback);

export const isHiddenNode = (node: LayoutNode): boolean => node.data.hidden === true;

export const setNodePosition = (node: LayoutNode | undefined, x: number, y: number): void => {
  if (node) node.position = { x, y };
};

export const setNodeDimensions = (
  node: LayoutNode,
  width: number,
  height: number,
): void => {
  node.style = { ...node.style, width, height };
  node.measured = { ...node.measured, width, height };
  node.width = width;
  node.height = height;
};
