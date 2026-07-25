import type { Node as ReactFlowNode } from '@xyflow/react';

const MAX_LAYOUT_DIMENSION = 1_000_000;

const boundedDimension = (value: unknown, fallback: number): number => {
  const safeFallback = typeof fallback === 'number' && Number.isFinite(fallback)
    ? Math.min(MAX_LAYOUT_DIMENSION, Math.max(0, fallback))
    : 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) return safeFallback;
  return Math.min(MAX_LAYOUT_DIMENSION, Math.max(0, value));
};

const cloneNodes = (nodes: readonly ReactFlowNode[]): ReactFlowNode[] =>
  nodes.map(node => ({
    ...node,
    position: { ...node.position },
    measured: node.measured ? { ...node.measured } : undefined,
    style: node.style ? { ...node.style } : undefined,
    data: { ...((node.data as Record<string, unknown> | undefined) ?? {}) },
  }));

const isVisibleContainer = (
  node: ReactFlowNode,
  containerTypes: ReadonlySet<string>,
): boolean => (
  containerTypes.has(String(node.type ?? ''))
  && (node.data as Record<string, unknown> | undefined)?.hidden !== true
);

const readWidth = (node: ReactFlowNode, fallback = 0): number =>
  boundedDimension(
    node.measured?.width ?? node.style?.width ?? node.width,
    fallback,
  );

const readHeight = (node: ReactFlowNode, fallback = 0): number =>
  boundedDimension(
    node.measured?.height ?? node.style?.height ?? node.height,
    fallback,
  );

const writeSize = (
  node: ReactFlowNode,
  width: number,
  height: number,
): void => {
  const safeWidth = boundedDimension(width, 0);
  const safeHeight = boundedDimension(height, 0);
  node.style = { ...(node.style ?? {}), width: safeWidth, height: safeHeight };
  node.measured = { width: safeWidth, height: safeHeight };
  node.width = safeWidth;
  node.height = safeHeight;
};

/**
 * Equalizes visible domain-container widths to the largest current width.
 * Hidden containers are left unchanged and all React Flow dimension channels
 * are synchronized so a later render cannot restore a stale measured size.
 */
export const unifyContainerWidthsByMaximum = (
  nodes: readonly ReactFlowNode[],
  containerTypes: ReadonlySet<string>,
  fallbackHeight: number,
): ReactFlowNode[] => {
  const updated = cloneNodes(Array.isArray(nodes) ? nodes : []);
  const containers = updated.filter(node =>
    isVisibleContainer(node, containerTypes));
  const maximumWidth = containers.length
    ? Math.max(...containers.map(node => readWidth(node)))
    : 0;
  if (!(maximumWidth > 0)) return updated;

  for (const container of containers) {
    writeSize(
      container,
      maximumWidth,
      readHeight(container, fallbackHeight),
    );
  }
  return updated;
};

/**
 * Equalizes visible domain-container heights to the largest current height.
 * Widths and positions are preserved while all React Flow dimension channels
 * are synchronized.
 */
export const unifyContainerHeightsByMaximum = (
  nodes: readonly ReactFlowNode[],
  containerTypes: ReadonlySet<string>,
  fallbackWidth: number,
): ReactFlowNode[] => {
  const updated = cloneNodes(Array.isArray(nodes) ? nodes : []);
  const containers = updated.filter(node =>
    isVisibleContainer(node, containerTypes));
  const maximumHeight = containers.length
    ? Math.max(...containers.map(node => readHeight(node)))
    : 0;
  if (!(maximumHeight > 0)) return updated;

  for (const container of containers) {
    writeSize(
      container,
      readWidth(container, fallbackWidth),
      maximumHeight,
    );
  }
  return updated;
};
