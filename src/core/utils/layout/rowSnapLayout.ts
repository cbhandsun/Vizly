import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

interface BaseMetrics {
  horizontalGap: number;
  verticalGap: number;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
}

interface SubGroupMetrics extends BaseMetrics {
  horizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
}

interface DomainMetrics extends BaseMetrics {
  horizontalPadding: number;
  titleHeight: number;
  titlePadding: number;
  titleSafeGap: number;
}

interface HorizontalBounds {
  left: number;
  right: number;
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

const baseMetrics = (layoutConfig: unknown, config: unknown): BaseMetrics => ({
  horizontalGap: dimension(nestedValue(layoutConfig, 'NODE_H_GAP'), 120),
  verticalGap: dimension(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
  defaultNodeWidth: dimension(
    nestedValue(layoutConfig, 'NODE_MIN_WIDTH'),
    120,
  ),
  defaultNodeHeight: dimension(nestedValue(config, 'node', 'height'), 80),
});

const subGroupMetrics = (
  layoutConfig: unknown,
  config: unknown,
): SubGroupMetrics => {
  const base = baseMetrics(layoutConfig, config);
  const titleHeight = dimension(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'height'),
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_HEIGHT'),
  ), 28);
  const titlePadding = dimension(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_SAFE_GAP'),
  ), 8);
  return {
    ...base,
    horizontalPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
    ), 30),
    topPadding: Math.max(
      titleHeight + titlePadding,
      dimension(firstDefined(
        nestedValue(config, 'subDomain', 'padding', 'top'),
        nestedValue(layoutConfig, 'SUB_GROUP_TITLE_CLEARANCE'),
      ), titleHeight + titlePadding),
    ),
    bottomPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'bottom'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
    ), 20),
  };
};

const domainMetrics = (
  layoutConfig: unknown,
  config: unknown,
): DomainMetrics => ({
  ...baseMetrics(layoutConfig, config),
  horizontalPadding: dimension(
    nestedValue(config, 'domain', 'padding', 'horizontal'),
    24,
  ),
  titleHeight: dimension(
    nestedValue(config, 'domain', 'title', 'height'),
    40,
  ),
  titlePadding: dimension(
    nestedValue(config, 'domain', 'title', 'padding', 'vertical'),
    12,
  ),
  titleSafeGap: dimension(
    nestedValue(config, 'domain', 'title', 'safeGap'),
    16,
  ),
});

const nodeWidth = (node: ReactFlowNode, metrics: BaseMetrics): number => (
  dimension(
    node.measured?.width ?? node.style?.width ?? node.width,
    metrics.defaultNodeWidth,
  )
);

const nodeHeight = (node: ReactFlowNode, metrics: BaseMetrics): number => (
  dimension(
    node.measured?.height ?? node.style?.height ?? node.height,
    metrics.defaultNodeHeight,
  )
);

const semanticOrder = (node: ReactFlowNode): number | null => {
  const data = asRecord(node.data);
  const raw = data.sequence ?? data.order;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sortRow = (row: ReactFlowNode[]): ReactFlowNode[] => row.sort(
  (left, right) => {
    const leftOrder = semanticOrder(left);
    const rightOrder = semanticOrder(right);
    if (leftOrder !== null && rightOrder !== null) return leftOrder - rightOrder;
    if (leftOrder !== null) return -1;
    if (rightOrder !== null) return 1;
    return left.position.x - right.position.x;
  },
);

const createRows = (
  nodes: ReactFlowNode[],
  metrics: BaseMetrics,
): ReactFlowNode[][] => {
  const tolerance = Math.max(8, Math.floor(metrics.verticalGap * 0.35));
  const rows: ReactFlowNode[][] = [];
  const sorted = nodes.slice().sort((left, right) => (
    left.position.y + nodeHeight(left, metrics) / 2
    - right.position.y - nodeHeight(right, metrics) / 2
  ));
  for (const node of sorted) {
    const center = node.position.y + nodeHeight(node, metrics) / 2;
    const matchingRow = rows.find(row => {
      const averageCenter = row.reduce((sum, item) => (
        sum + item.position.y + nodeHeight(item, metrics) / 2
      ), 0) / row.length;
      return Math.abs(center - averageCenter) <= tolerance;
    });
    if (matchingRow) matchingRow.push(node);
    else rows.push([node]);
  }
  return rows;
};

const packRowHorizontally = (
  rowInput: ReactFlowNode[],
  bounds: HorizontalBounds,
  y: number,
  metrics: BaseMetrics,
  noClamp: boolean,
  semanticSort: boolean,
): { width: number; maximumHeight: number } => {
  const row = semanticSort ? sortRow(rowInput.slice()) : rowInput.slice();
  const widths = row.map(node => nodeWidth(node, metrics));
  const width = widths.reduce((sum, itemWidth, index) => (
    sum + itemWidth + (index ? metrics.horizontalGap : 0)
  ), 0);
  const innerWidth = Math.max(1, bounds.right - bounds.left);
  let cursorX = bounds.left + Math.floor(Math.max(0, innerWidth - width) / 2);
  let maximumHeight = 0;
  for (let index = 0; index < row.length; index += 1) {
    const node = row[index];
    const itemWidth = widths[index];
    const rawX = Math.round(boundedNumber(cursorX, bounds.left));
    const x = noClamp
      ? rawX
      : Math.min(
        Math.max(rawX, bounds.left),
        Math.max(bounds.left, bounds.right - itemWidth),
      );
    node.position = {
      x: Math.round(x),
      y: Math.round(boundedNumber(y, 0)),
    };
    maximumHeight = Math.max(maximumHeight, nodeHeight(node, metrics));
    cursorX = x + itemWidth + metrics.horizontalGap;
  }
  return { width, maximumHeight };
};

const semanticChildren = (
  subGroup: ReactFlowNode,
  nodesById: Map<string, ReactFlowNode>,
): ReactFlowNode[] => {
  const childIds = asRecord(subGroup.data).children;
  if (!Array.isArray(childIds)) return [];
  const seen = new Set<string>();
  const children: ReactFlowNode[] = [];
  for (const childId of childIds) {
    if (typeof childId !== 'string' || seen.has(childId)) continue;
    seen.add(childId);
    const child = nodesById.get(childId);
    if (
      child
      && !CONTAINER_TYPES.has(String(child.type || ''))
      && !asRecord(child.data).hidden
    ) {
      children.push(child);
    }
  }
  return children;
};

export const snapSubGroupChildrenToRowsWithConfig = (
  nodeInputs: ReactFlowNode[],
  noClamp: boolean,
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const nodesById = new Map(updated.map(node => [node.id, node]));
  const metrics = subGroupMetrics(layoutConfig, config);
  const rowGap = Math.max(8, metrics.verticalGap);
  for (const subGroup of updated.filter(
    node => String(node.type || '') === 'subGroup',
  )) {
    const children = semanticChildren(subGroup, nodesById);
    if (children.length <= 1) continue;
    const width = dimension(
      subGroup.measured?.width ?? subGroup.style?.width ?? subGroup.width,
      0,
    );
    const innerLeft = subGroup.position.x + metrics.horizontalPadding;
    const innerRight = (
      subGroup.position.x + Math.max(1, width) - metrics.horizontalPadding
    );
    const rows = createRows(children, metrics);
    let cursorY = subGroup.position.y + metrics.topPadding;
    let maximumContentWidth = 0;
    let totalRowHeight = 0;
    for (const row of rows) {
      const packed = packRowHorizontally(
        row,
        { left: innerLeft, right: innerRight },
        cursorY,
        metrics,
        noClamp,
        true,
      );
      cursorY += packed.maximumHeight + rowGap;
      maximumContentWidth = Math.max(maximumContentWidth, packed.width);
      totalRowHeight += packed.maximumHeight;
    }
    const innerWidth = Math.max(1, innerRight - innerLeft);
    const nextWidth = Math.round(
      Math.min(innerWidth, maximumContentWidth)
      + metrics.horizontalPadding * 2,
    );
    const nextHeight = Math.round(
      totalRowHeight
      + Math.max(0, rows.length - 1) * rowGap
      + metrics.topPadding
      + Math.max(8, Math.floor(metrics.bottomPadding * 0.6)),
    );
    subGroup.style = { ...subGroup.style, width: nextWidth, height: nextHeight };
    subGroup.measured = { width: nextWidth, height: nextHeight };
    subGroup.width = nextWidth;
    subGroup.height = nextHeight;
  }
  return updated;
};

export const snapFreeNodesToRowsInDomainWithConfig = (
  nodeInputs: ReactFlowNode[],
  noClamp: boolean,
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const metrics = domainMetrics(layoutConfig, config);
  for (const domain of updated.filter(
    node => String(node.type || '') === 'titleGroup',
  )) {
    const key = String(asRecord(domain.data).domain || '').trim();
    if (!key) continue;
    const claimedChildren = new Set<string>();
    for (const subGroup of updated.filter(node => (
      String(node.type || '') === 'subGroup'
      && String(asRecord(node.data).domain || '').trim() === key
    ))) {
      const childIds = asRecord(subGroup.data).children;
      if (!Array.isArray(childIds)) continue;
      for (const childId of childIds) {
        if (typeof childId === 'string') claimedChildren.add(childId);
      }
    }
    const freeNodes = updated.filter(node => (
      String(asRecord(node.data).domain || '') === key
      && !CONTAINER_TYPES.has(String(node.type || ''))
      && !asRecord(node.data).hidden
      && !claimedChildren.has(node.id)
    ));
    if (freeNodes.length <= 1) continue;
    const domainWidth = dimension(
      domain.measured?.width ?? domain.style?.width ?? domain.width,
      0,
    );
    const domainHeight = dimension(
      domain.measured?.height ?? domain.style?.height ?? domain.height,
      0,
    );
    const innerLeft = domain.position.x + metrics.horizontalPadding;
    const innerRight = (
      domain.position.x + Math.max(1, domainWidth) - metrics.horizontalPadding
    );
    const innerTop = (
      domain.position.y
      + metrics.titleHeight
      + metrics.titlePadding
      + metrics.titleSafeGap
    );
    const innerBottom = (
      domain.position.y + Math.max(1, domainHeight) - metrics.horizontalPadding
    );
    for (const row of createRows(freeNodes, metrics)) {
      const rawY = Math.min(...row.map(node => node.position.y));
      const maximumHeight = Math.max(
        ...row.map(node => nodeHeight(node, metrics)),
      );
      const y = noClamp
        ? rawY
        : Math.min(
          Math.max(rawY, innerTop),
          Math.max(innerTop, innerBottom - maximumHeight),
        );
      packRowHorizontally(
        row,
        { left: innerLeft, right: innerRight },
        y,
        metrics,
        noClamp,
        false,
      );
    }
  }
  return updated;
};
