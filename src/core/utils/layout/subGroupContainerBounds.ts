import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

interface BoundsMetrics {
  horizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
  titleHeight: number;
  titlePadding: number;
  titleSafeGap: number;
  horizontalGap: number;
  verticalGap: number;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
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
  minimum = -100_000,
  maximum = 100_000,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const dimension = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 0, 100_000)
);

const cloneNode = (node: ReactFlowNode): ReactFlowNode => ({
  ...node,
  position: {
    x: boundedNumber(node.position?.x, 0),
    y: boundedNumber(node.position?.y, 0),
  },
  data: node.data ? { ...node.data } : {},
  style: node.style ? { ...node.style } : {},
  measured: node.measured
    ? {
      width: dimension(node.measured.width, 0),
      height: dimension(node.measured.height, 0),
    }
    : node.measured,
});

const resolveMetrics = (layoutConfig: unknown, config: unknown): BoundsMetrics => {
  const titleHeight = dimension(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'height'),
    nestedValue(config, 'subGroup', 'title', 'height'),
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_HEIGHT'),
  ), 28);
  const titlePadding = dimension(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    nestedValue(config, 'subGroup', 'title', 'padding', 'vertical'),
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_SAFE_GAP'),
  ), 8);
  const configuredTopPadding = dimension(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subGroup', 'padding', 'top'),
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_TOP'),
  ), 35);
  const titleClearance = dimension(
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_CLEARANCE'),
    titleHeight + titlePadding,
  );
  const ensureTitleClearance = Boolean(
    nestedValue(layoutConfig, 'ENSURE_SUB_GROUP_TITLE_CLEARANCE'),
  );

  return {
    horizontalPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(config, 'subGroup', 'padding', 'horizontal'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
    ), 30),
    topPadding: ensureTitleClearance
      ? Math.max(configuredTopPadding, titleClearance)
      : configuredTopPadding,
    bottomPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'bottom'),
      nestedValue(config, 'subGroup', 'padding', 'bottom'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
    ), 20),
    titleHeight,
    titlePadding,
    titleSafeGap: dimension(
      nestedValue(config, 'subDomain', 'title', 'safeGap'),
      0,
    ),
    horizontalGap: dimension(
      nestedValue(layoutConfig, 'NODE_H_GAP'),
      120,
    ),
    verticalGap: dimension(
      nestedValue(layoutConfig, 'NODE_V_GAP'),
      80,
    ),
    defaultNodeWidth: dimension(
      nestedValue(layoutConfig, 'NODE_MIN_WIDTH'),
      120,
    ),
    defaultNodeHeight: dimension(
      nestedValue(config, 'node', 'height'),
      80,
    ),
  };
};

const nodeRect = (node: ReactFlowNode, metrics: BoundsMetrics): Rect => ({
  x: boundedNumber(node.position?.x, 0),
  y: boundedNumber(node.position?.y, 0),
  width: dimension(
    node.measured?.width ?? node.style?.width ?? node.width,
    metrics.defaultNodeWidth,
  ),
  height: dimension(
    node.measured?.height ?? node.style?.height ?? node.height,
    metrics.defaultNodeHeight,
  ),
});

const semanticOrder = (node: ReactFlowNode): number | null => {
  const data = asRecord(node.data);
  const value = data.sequence ?? data.order;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sortRow = (
  row: ReactFlowNode[],
  metrics: BoundsMetrics,
): ReactFlowNode[] => row.sort((left, right) => {
  const leftOrder = semanticOrder(left);
  const rightOrder = semanticOrder(right);
  if (leftOrder !== null && rightOrder !== null) return leftOrder - rightOrder;
  if (leftOrder !== null) return -1;
  if (rightOrder !== null) return 1;
  return nodeRect(left, metrics).x - nodeRect(right, metrics).x;
});

const semanticMembers = (
  subGroup: ReactFlowNode,
  nodesById: Map<string, ReactFlowNode>,
): ReactFlowNode[] => {
  const children = asRecord(subGroup.data).children;
  if (!Array.isArray(children)) return [];
  const seen = new Set<string>();
  const members: ReactFlowNode[] = [];
  for (const childId of children) {
    if (typeof childId !== 'string' || seen.has(childId)) continue;
    seen.add(childId);
    const child = nodesById.get(childId);
    if (
      child
      && !CONTAINER_TYPES.has(String(child.type || ''))
      && !asRecord(child.data).hidden
    ) {
      members.push(child);
    }
  }
  return members;
};

const contentBounds = (
  members: ReactFlowNode[],
  metrics: BoundsMetrics,
): Rect => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const member of members) {
    const rect = nodeRect(member, metrics);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
};

const rowMetrics = (
  members: ReactFlowNode[],
  metrics: BoundsMetrics,
): { maximumWidth: number; totalHeight: number } => {
  const averageHeight = (
    members.reduce((sum, member) => sum + nodeRect(member, metrics).height, 0)
    / members.length
  );
  const rowTolerance = Math.max(
    6,
    Math.floor(Math.min(metrics.verticalGap * 0.35, averageHeight * 0.5)),
  );
  const rows: ReactFlowNode[][] = [];
  const sorted = members.slice().sort((left, right) => {
    const a = nodeRect(left, metrics);
    const b = nodeRect(right, metrics);
    return (a.y + a.height / 2) - (b.y + b.height / 2);
  });
  for (const member of sorted) {
    const rect = nodeRect(member, metrics);
    const center = rect.y + rect.height / 2;
    const matchingRow = rows.find(row => {
      const averageCenter = row.reduce((sum, item) => {
        const itemRect = nodeRect(item, metrics);
        return sum + itemRect.y + itemRect.height / 2;
      }, 0) / row.length;
      return Math.abs(center - averageCenter) <= rowTolerance;
    });
    if (matchingRow) matchingRow.push(member);
    else rows.push([member]);
  }

  let maximumWidth = 0;
  const heights: number[] = [];
  for (const row of rows) {
    const ordered = sortRow(row.slice(), metrics);
    const width = ordered.reduce((sum, member, index) => (
      sum
      + nodeRect(member, metrics).width
      + (index ? metrics.horizontalGap : 0)
    ), 0);
    maximumWidth = Math.max(maximumWidth, width);
    heights.push(Math.max(
      ...ordered.map(member => nodeRect(member, metrics).height),
    ));
  }
  const averageRowHeight = heights.reduce((sum, height) => sum + height, 0)
    / Math.max(1, heights.length);
  const interRowGap = Math.max(
    8,
    Math.min(metrics.verticalGap, Math.floor(averageRowHeight * 0.6)),
  );
  return {
    maximumWidth,
    totalHeight: (
      heights.reduce((sum, height) => sum + height, 0)
      + Math.max(0, heights.length - 1) * interRowGap
    ),
  };
};

export const expandSubGroupContainersBySemanticWithConfig = (
  nodeInputs: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const nodesById = new Map(updated.map(node => [node.id, node]));
  const metrics = resolveMetrics(layoutConfig, config);
  const rightSafety = Math.max(6, Math.floor(metrics.horizontalGap * 0.25));

  for (const subGroup of updated.filter(
    node => String(node.type || '') === 'subGroup',
  )) {
    const members = semanticMembers(subGroup, nodesById);
    if (!members.length) continue;
    const bounds = contentBounds(members, metrics);
    const rows = rowMetrics(members, metrics);
    const width = Math.round(Math.max(
      nodeRect(subGroup, metrics).width,
      Math.max(rows.maximumWidth, bounds.width)
        + metrics.horizontalPadding * 2
        + rightSafety,
    ));
    const height = Math.round(Math.max(
      nodeRect(subGroup, metrics).height,
      rows.totalHeight + metrics.topPadding + metrics.bottomPadding,
    ));
    subGroup.position = {
      x: Math.round(bounds.x - metrics.horizontalPadding),
      y: Math.round(bounds.y - metrics.topPadding),
    };
    subGroup.style = { ...subGroup.style, width, height };
    subGroup.measured = { width, height };
  }

  return updated;
};

export const enforceSubGroupStrictContainmentWithConfig = (
  nodeInputs: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const nodesById = new Map(updated.map(node => [node.id, node]));
  const metrics = resolveMetrics(layoutConfig, config);
  const contentAreaTop = (
    metrics.titleHeight
    + metrics.titlePadding
    + metrics.topPadding
    + metrics.titleSafeGap
  );

  for (const subGroup of updated.filter(
    node => String(node.type || '') === 'subGroup',
  )) {
    const members = semanticMembers(subGroup, nodesById);
    if (!members.length) continue;
    const bounds = contentBounds(members, metrics);
    const width = Math.max(
      Math.round(bounds.width + metrics.horizontalPadding * 2),
      100,
    );
    const height = Math.max(
      Math.round(bounds.height + contentAreaTop + metrics.bottomPadding),
      60,
    );
    subGroup.style = { ...subGroup.style, width, height };
    subGroup.measured = { width, height };
  }

  return updated;
};
