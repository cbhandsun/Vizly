import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

const EXCLUDED_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

const nestedValue = (source: unknown, ...keys: string[]): unknown => {
  let current: unknown = source;
  for (const key of keys) current = asRecord(current)[key];
  return current;
};

const firstDefined = (...values: unknown[]): unknown => (
  values.find(value => value !== undefined && value !== null)
);

const finiteOr = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const positiveOr = (value: unknown, fallback: number, maximum = 100_000): number => {
  const numeric = finiteOr(value, fallback);
  return numeric > 0 ? Math.min(numeric, maximum) : fallback;
};

const nodeWidth = (node: ReactFlowNode, fallback: number): number => positiveOr(
  node.measured?.width ?? node.style?.width ?? node.width,
  fallback,
);

const nodeHeight = (node: ReactFlowNode, fallback: number): number => positiveOr(
  node.measured?.height ?? node.style?.height ?? node.height,
  fallback,
);

const childIds = (node: ReactFlowNode): string[] => (
  Array.isArray(node.data?.children)
    ? node.data.children.filter((id): id is string => typeof id === 'string')
    : []
);

const visibleChildren = (
  node: ReactFlowNode,
  nodeById: Map<string, ReactFlowNode>,
): ReactFlowNode[] => childIds(node)
  .map(id => nodeById.get(id))
  .filter((child): child is ReactFlowNode => Boolean(
    child
    && !EXCLUDED_TYPES.has(String(child.type || ''))
    && child.data?.hidden !== true,
  ));

interface ProjectionMetrics {
  nodeWidth: number;
  nodeHeight: number;
  paddingHorizontal: number;
  paddingTop: number;
  paddingBottom: number;
  titleHeight: number;
  titlePaddingVertical: number;
  domainPaddingHorizontal: number;
}

const projectionMetrics = (
  layoutConfig: unknown,
  config: unknown,
  preserveAnchor = false,
): ProjectionMetrics => ({
  nodeWidth: positiveOr(nestedValue(layoutConfig, 'NODE_MIN_WIDTH'), 120),
  nodeHeight: positiveOr(nestedValue(config, 'node', 'height'), 80),
  paddingHorizontal: positiveOr(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'horizontal'),
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
  ), 30),
  paddingTop: positiveOr(firstDefined(
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_TOP'),
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subDomain', 'padding', 'vertical'),
  ), 28),
  paddingBottom: positiveOr(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'bottom'),
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
  ), preserveAnchor ? 28 : 20),
  titleHeight: positiveOr(nestedValue(config, 'subDomain', 'title', 'height'), 28),
  titlePaddingVertical: positiveOr(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    8,
  ),
  domainPaddingHorizontal: positiveOr(
    nestedValue(config, 'domain', 'padding', 'horizontal'),
    24,
  ),
});

const applySize = (
  node: ReactFlowNode,
  width: number,
  height: number,
): void => {
  node.style = { ...(node.style || {}), width, height };
  node.measured = { width, height };
  node.width = width;
  node.height = height;
};

export const finalizeSubGroupHeightsByProjectionWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = projectionMetrics(layoutConfig, config);
  const updated = nodes.map(node => ({ ...node }));
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const position = subGroup.position || { x: 0, y: 0 };
    const groupX = finiteOr(position.x, 0);
    const groupY = finiteOr(position.y, 0);
    const innerLeft = groupX + metrics.paddingHorizontal;
    const innerTop = groupY
      + metrics.titleHeight
      + metrics.titlePaddingVertical
      + metrics.paddingTop;
    const children = visibleChildren(subGroup, nodeById);

    if (!children.length) {
      applySize(
        subGroup,
        nodeWidth(subGroup, metrics.nodeWidth),
        metrics.titleHeight
          + metrics.titlePaddingVertical
          + metrics.paddingTop
          + metrics.paddingBottom,
      );
      continue;
    }

    let maxBottom = innerTop;
    let maxRight = innerLeft;
    let minLeft = Number.POSITIVE_INFINITY;
    for (const child of children) {
      const x = finiteOr(child.position?.x, innerLeft);
      const y = finiteOr(child.position?.y, innerTop);
      maxBottom = Math.max(maxBottom, y + nodeHeight(child, metrics.nodeHeight));
      maxRight = Math.max(maxRight, x + nodeWidth(child, metrics.nodeWidth));
      minLeft = Math.min(minLeft, x);
    }

    const contentHeight = Math.max(0, maxBottom - innerTop);
    const contentWidth = Math.max(
      0,
      maxRight - (Number.isFinite(minLeft) ? minLeft : innerLeft),
    );
    const width = contentWidth + metrics.paddingHorizontal * 2;
    const height = metrics.titleHeight
      + metrics.titlePaddingVertical
      + metrics.paddingTop
      + contentHeight
      + metrics.paddingBottom;

    let nextX = Number.isFinite(minLeft)
      ? Math.round(minLeft - metrics.paddingHorizontal)
      : groupX;
    const domain = String(subGroup.data?.domain || '').trim();
    const domainGroup = updated.find(node => (
      String(node.type || '') === 'titleGroup'
      && String(node.data?.domain || '') === domain
    ));
    if (domainGroup) {
      const domainX = finiteOr(domainGroup.position?.x, 0);
      const domainWidth = nodeWidth(domainGroup, 1);
      const left = domainX + metrics.domainPaddingHorizontal - metrics.paddingHorizontal;
      const right = domainX
        + domainWidth
        - metrics.domainPaddingHorizontal
        - metrics.paddingHorizontal
        - width;
      nextX = Math.min(Math.max(nextX, left), right);
    }

    subGroup.position = { x: nextX, y: groupY };
    applySize(subGroup, width, height);
  }

  return updated;
};

export const finalizeSubGroupHeightsByProjectionPreserveAnchorWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = projectionMetrics(layoutConfig, config, true);
  const updated = nodes.map(node => ({ ...node }));
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const dagreSize = asRecord(subGroup.data?.__dagreSized);
    const dagreHeight = positiveOr(dagreSize.h, 0);
    if (dagreHeight > 0) {
      applySize(
        subGroup,
        positiveOr(dagreSize.w, nodeWidth(subGroup, metrics.nodeWidth)),
        dagreHeight,
      );
      continue;
    }

    const groupY = finiteOr(subGroup.position?.y, 0);
    const innerTop = groupY
      + metrics.titleHeight
      + metrics.titlePaddingVertical
      + metrics.paddingTop;
    const children = visibleChildren(subGroup, nodeById);
    const width = nodeWidth(subGroup, metrics.nodeWidth);
    if (!children.length) {
      applySize(
        subGroup,
        width,
        metrics.titleHeight
          + metrics.titlePaddingVertical
          + metrics.paddingTop
          + metrics.paddingBottom,
      );
      continue;
    }

    const maxBottom = children.reduce((maximum, child) => Math.max(
      maximum,
      finiteOr(child.position?.y, innerTop) + nodeHeight(child, metrics.nodeHeight),
    ), innerTop);
    const contentHeight = Math.max(0, maxBottom - innerTop);
    applySize(
      subGroup,
      width,
      metrics.titleHeight
        + metrics.titlePaddingVertical
        + metrics.paddingTop
        + contentHeight
        + metrics.paddingBottom,
    );
  }

  return updated;
};

export const finalizeSubGroupWidthsByProjectionPreserveAnchorWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = projectionMetrics(layoutConfig, config);
  const updated = nodes.map(node => ({ ...node }));
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const children = visibleChildren(subGroup, nodeById);
    if (!children.length) continue;
    const minLeft = Math.min(...children.map(child => finiteOr(child.position?.x, 0)));
    const maxRight = Math.max(...children.map(child => (
      finiteOr(child.position?.x, 0) + nodeWidth(child, metrics.nodeWidth)
    )));
    if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight) || maxRight <= minLeft) continue;

    applySize(
      subGroup,
      maxRight - minLeft + metrics.paddingHorizontal * 2,
      nodeHeight(subGroup, metrics.nodeHeight),
    );
    subGroup.position = {
      x: finiteOr(subGroup.position?.x, 0),
      y: finiteOr(subGroup.position?.y, 0),
    };
  }

  return updated;
};

export const writeSubGroupChildrenRelativeOffsetsWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = projectionMetrics(layoutConfig, config);
  const updated = nodes.map(node => ({ ...node, data: { ...(node.data || {}) } }));
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const innerLeft = finiteOr(subGroup.position?.x, 0) + metrics.paddingHorizontal;
    const innerTop = finiteOr(subGroup.position?.y, 0)
      + metrics.titleHeight
      + metrics.titlePaddingVertical
      + metrics.paddingTop;
    for (const id of childIds(subGroup)) {
      const child = nodeById.get(id);
      if (!child) continue;
      child.data = {
        ...(child.data || {}),
        __rel: {
          x: Math.round(finiteOr(child.position?.x, innerLeft) - innerLeft),
          y: Math.round(finiteOr(child.position?.y, innerTop) - innerTop),
        },
      };
    }
  }

  return updated;
};
