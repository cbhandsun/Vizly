import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

export interface SubGroupContainerLogger {
  debug?: (...args: unknown[]) => void;
}

export interface SubGroupContainerRecomputeOptions {
  logger?: SubGroupContainerLogger;
}

interface Metrics {
  horizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
  horizontalGap: number;
  verticalGap: number;
  minimumHeight: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

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

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const coordinate = (value: unknown): number => (
  boundedNumber(value, 0, -100_000, 100_000)
);

const dimension = (value: unknown, fallback = 0): number => (
  boundedNumber(value, fallback, 0, 100_000)
);

const cloneNode = (node: ReactFlowNode): ReactFlowNode => ({
  ...node,
  position: {
    x: coordinate(node.position?.x),
    y: coordinate(node.position?.y),
  },
  data: node.data ? { ...node.data } : {},
  style: node.style ? { ...node.style } : {},
  measured: node.measured
    ? {
      width: dimension(node.measured.width),
      height: dimension(node.measured.height),
    }
    : node.measured,
});

const nodeRect = (node: ReactFlowNode): Rect => ({
  x: coordinate(node.position?.x),
  y: coordinate(node.position?.y),
  width: dimension(node.measured?.width ?? node.style?.width ?? node.width),
  height: dimension(node.measured?.height ?? node.style?.height ?? node.height),
});

const intersects = (a: Rect, b: Rect): boolean => (
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y
);

const resolveMetrics = (layoutConfig: unknown, config: unknown): Metrics => {
  const titleHeight = dimension(
    nestedValue(config, 'subDomain', 'title', 'height'),
    28,
  );
  const titlePadding = dimension(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    8,
  );
  const titleClearance = dimension(
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_CLEARANCE'),
    titleHeight + titlePadding,
  );
  const contentTopPadding = dimension(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subGroup', 'padding', 'top'),
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_TOP'),
  ), 28);
  const ensureClearance = Boolean(
    nestedValue(layoutConfig, 'ENSURE_SUB_GROUP_TITLE_CLEARANCE'),
  );

  return {
    horizontalPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(config, 'subGroup', 'padding', 'horizontal'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
    ), 30),
    topPadding: (
      (ensureClearance
        ? Math.max(titleHeight + titlePadding, titleClearance)
        : titleHeight + titlePadding)
      + contentTopPadding
    ),
    bottomPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'bottom'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
    ), 28),
    horizontalGap: dimension(nestedValue(layoutConfig, 'NODE_H_GAP'), 120),
    verticalGap: dimension(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
    minimumHeight: dimension(
      nestedValue(layoutConfig, 'SUB_GROUP_MIN_HEIGHT'),
      200,
    ),
  };
};

const explicitChildren = (
  subGroup: ReactFlowNode,
  nodesById: Map<string, ReactFlowNode>,
): ReactFlowNode[] => {
  const children = asRecord(subGroup.data).children;
  if (!Array.isArray(children)) return [];
  const seen = new Set<string>();
  const result: ReactFlowNode[] = [];
  for (const childId of children) {
    if (typeof childId !== 'string' || seen.has(childId)) continue;
    seen.add(childId);
    const child = nodesById.get(childId);
    if (
      child
      && !CONTAINER_TYPES.has(String(child.type || ''))
      && !asRecord(child.data).hidden
    ) {
      result.push(child);
    }
  }
  return result;
};

const geometricChildren = (
  subGroup: ReactFlowNode,
  nodes: ReactFlowNode[],
  metrics: Metrics,
): ReactFlowNode[] => {
  const groupRect = nodeRect(subGroup);
  const innerRect = {
    x: groupRect.x + metrics.horizontalPadding,
    y: groupRect.y + metrics.topPadding,
    width: Math.max(1, groupRect.width - metrics.horizontalPadding * 2),
    height: Math.max(
      1,
      groupRect.height - metrics.topPadding - metrics.bottomPadding,
    ),
  };
  const groupDomain = String(asRecord(subGroup.data).domain || '').trim();
  return nodes.filter(node => {
    if (CONTAINER_TYPES.has(String(node.type || '')) || asRecord(node.data).hidden) {
      return false;
    }
    const nodeDomain = String(asRecord(node.data).domain || '').trim();
    if (groupDomain && nodeDomain !== groupDomain) return false;
    return intersects(nodeRect(node), innerRect);
  });
};

const applyDagreSize = (
  subGroup: ReactFlowNode,
  logger: SubGroupContainerLogger | undefined,
): boolean => {
  const marker = asRecord(asRecord(subGroup.data).__dagreSized);
  const markerWidth = dimension(marker.w);
  const markerHeight = dimension(marker.h);
  const safeId = String(subGroup.id).substring(0, 24);
  logger?.debug?.(
    `[DAGRE-MARKER] id="${safeId}" dagreSized=${markerHeight > 0 ? 'valid' : 'absent'}`,
  );
  if (markerHeight <= 0) return false;
  const width = markerWidth || nodeRect(subGroup).width;
  if (width <= 0) return false;
  logger?.debug?.(
    `[RECOMPUTE-SKIP] id="${safeId}" using dagreSized w=${width}, h=${markerHeight}`,
  );
  subGroup.style = { ...subGroup.style, width, height: markerHeight };
  subGroup.measured = { width, height: markerHeight };
  subGroup.width = width;
  subGroup.height = markerHeight;
  return true;
};

const shrinkEmptySubGroup = (
  subGroup: ReactFlowNode,
  metrics: Metrics,
): void => {
  const bottomSafety = Math.max(
    Math.floor(metrics.verticalGap * 0.2),
    Math.max(6, Math.floor(metrics.bottomPadding * 0.8)),
  );
  const height = Math.round(
    metrics.topPadding + metrics.bottomPadding + bottomSafety,
  );
  const width = Math.round(nodeRect(subGroup).width);
  subGroup.style = { ...subGroup.style, width, height };
  subGroup.measured = { width, height };
};

const fitSubGroupToChildren = (
  subGroup: ReactFlowNode,
  children: ReactFlowNode[],
  metrics: Metrics,
): void => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const child of children) {
    const rect = nodeRect(child);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  const horizontalSafety = Math.max(
    0,
    Math.min(
      Math.floor(metrics.horizontalPadding * 0.25),
      Math.floor(metrics.horizontalGap * 0.1),
      10,
    ),
  );
  const leftSafety = Math.floor(horizontalSafety / 2);
  const rightSafety = horizontalSafety - leftSafety;
  const width = Math.round(
    Math.max(
      0,
      maxX - minX
      + metrics.horizontalPadding * 2
      + leftSafety
      + rightSafety,
    ),
  );
  const height = Math.round(Math.max(
    metrics.minimumHeight,
    maxY - minY + metrics.topPadding + metrics.bottomPadding,
  ));
  subGroup.position = {
    x: Math.round(minX - metrics.horizontalPadding - leftSafety),
    y: Math.round(minY - metrics.topPadding),
  };
  subGroup.style = { ...subGroup.style, width, height };
  subGroup.measured = { width, height };
  subGroup.zIndex = typeof subGroup.zIndex === 'number' ? subGroup.zIndex : -5;
};

export const recomputeSubGroupContainersWithConfig = (
  nodeInputs: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
  options: SubGroupContainerRecomputeOptions = {},
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const nodesById = new Map(updated.map(node => [node.id, node]));
  const metrics = resolveMetrics(layoutConfig, config);

  for (const subGroup of updated.filter(
    node => String(node.type || '') === 'subGroup',
  )) {
    if (applyDagreSize(subGroup, options.logger)) continue;
    const semanticChildren = explicitChildren(subGroup, nodesById);
    const children = semanticChildren.length
      ? semanticChildren
      : geometricChildren(subGroup, updated, metrics);
    if (!children.length) {
      shrinkEmptySubGroup(subGroup, metrics);
      continue;
    }
    fitSubGroupToChildren(subGroup, children, metrics);
  }

  return updated;
};
