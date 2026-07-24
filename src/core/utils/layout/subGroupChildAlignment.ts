import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

const finiteOrZero = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const boundedPositive = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum = 10_000,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const nestedValue = (source: unknown, ...keys: string[]): unknown => {
  let current: unknown = source;
  for (const key of keys) {
    current = asRecord(current)[key];
  }
  return current;
};

const firstDefined = (...values: unknown[]): unknown => (
  values.find(value => value !== undefined && value !== null)
);

const nodeWidth = (node: ReactFlowNode, minimum: number): number => boundedPositive(
  node.measured?.width ?? node.style?.width ?? node.width,
  minimum,
  minimum,
);

const nodeHeight = (node: ReactFlowNode, fallback: number, minimum: number): number => boundedPositive(
  node.measured?.height ?? node.style?.height ?? node.height,
  fallback,
  minimum,
);

const nonContainerTypes = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

interface HorizontalAlignmentMetrics {
  horizontalGap: number;
  verticalGap: number;
  horizontalPadding: number;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
  fallbackContainerWidth: number;
}

const resolveHorizontalAlignmentMetrics = (
  layoutConfig: unknown,
  config: unknown,
): HorizontalAlignmentMetrics => {
  const layout = asRecord(layoutConfig);
  return {
    horizontalGap: boundedPositive(layout.NODE_H_GAP, 120, 0, 10_000),
    verticalGap: boundedPositive(layout.NODE_V_GAP, 80, 0, 10_000),
    horizontalPadding: boundedPositive(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(config, 'subGroup', 'padding', 'horizontal'),
      nestedValue(layout, 'SUB_GROUP_PADDING', 'H'),
    ), 30, 0, 10_000),
    defaultNodeWidth: boundedPositive(layout.NODE_MIN_WIDTH, 120, 1, 100_000),
    defaultNodeHeight: boundedPositive(nestedValue(config, 'node', 'height'), 80, 1, 100_000),
    fallbackContainerWidth: boundedPositive(
      nestedValue(config, 'layout', 'mainColumnWidth'),
      400,
      1,
      100_000,
    ),
  };
};

const visibleSubGroupChildren = (
  subGroup: ReactFlowNode,
  nodeById: Map<string, ReactFlowNode>,
): ReactFlowNode[] => {
  const childIds = Array.isArray(subGroup.data?.children)
    ? subGroup.data.children.filter((id): id is string => typeof id === 'string')
    : [];

  return childIds
    .map(id => nodeById.get(id))
    .filter((node): node is ReactFlowNode => (
      Boolean(node)
      && !nonContainerTypes.has(String(node?.type || ''))
      && asRecord(node?.data).hidden !== true
    ));
};

const groupChildrenByVisualRow = (
  children: ReactFlowNode[],
  verticalGap: number,
  defaultNodeHeight: number,
): ReactFlowNode[][] => {
  const centerY = (node: ReactFlowNode) => (
    finiteOrZero(node.position?.y) + nodeHeight(node, defaultNodeHeight, 1) / 2
  );
  const tolerance = Math.max(6, Math.floor(verticalGap * 0.35));
  const rows: ReactFlowNode[][] = [];

  for (const node of children.slice().sort((a, b) => centerY(a) - centerY(b))) {
    const nodeCenterY = centerY(node);
    const row = rows.find(candidate => {
      const averageCenterY = candidate.reduce((sum, item) => sum + centerY(item), 0)
        / candidate.length;
      return Math.abs(nodeCenterY - averageCenterY) <= tolerance;
    });
    if (row) row.push(node);
    else rows.push([node]);
  }

  return rows;
};

export const centerSubGroupChildrenHorizontallyWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = resolveHorizontalAlignmentMetrics(layoutConfig, config);
  const updated = nodes.map(node => ({ ...node }));
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated) {
    if (String(subGroup.type || '') !== 'subGroup') continue;

    const subGroupX = finiteOrZero(subGroup.position?.x);
    const measuredWidth = subGroup.measured?.width ?? subGroup.style?.width ?? subGroup.width;
    const containerWidth = (
      typeof measuredWidth === 'number' && Number.isFinite(measuredWidth) && measuredWidth > 0
    )
      ? Math.min(measuredWidth, 100_000)
      : metrics.fallbackContainerWidth;
    const innerLeft = subGroupX + metrics.horizontalPadding;
    const innerRight = subGroupX + containerWidth - metrics.horizontalPadding;
    const availableWidth = Math.max(1, innerRight - innerLeft);
    const children = visibleSubGroupChildren(subGroup, nodeById);
    if (!children.length) continue;

    for (const row of groupChildrenByVisualRow(
      children,
      metrics.verticalGap,
      metrics.defaultNodeHeight,
    )) {
      const sortedRow = row.slice().sort(
        (a, b) => finiteOrZero(a.position?.x) - finiteOrZero(b.position?.x),
      );
      const widths = sortedRow.map(node => nodeWidth(node, metrics.defaultNodeWidth));
      const contentWidth = widths.reduce((sum, width) => sum + width, 0);
      const gap = sortedRow.length <= 1
        ? 0
        : Math.max(
          8,
          Math.min(
            metrics.horizontalGap,
            Math.floor(Math.max(0, availableWidth - contentWidth) / (sortedRow.length - 1)),
          ),
        );
      const rowWidth = contentWidth + Math.max(0, sortedRow.length - 1) * gap;
      let cursorX = Math.min(
        Math.max(
          innerLeft + Math.floor(Math.max(0, availableWidth - rowWidth) / 2),
          innerLeft,
        ),
        Math.max(innerLeft, innerRight - rowWidth),
      );

      sortedRow.forEach((node, index) => {
        const width = widths[index];
        const x = Math.min(
          Math.max(cursorX, innerLeft),
          Math.max(innerLeft, innerRight - width),
        );
        node.position = { x, y: finiteOrZero(node.position?.y) };
        cursorX = x + width + (index < sortedRow.length - 1 ? gap : 0);
      });
    }
  }

  return updated;
};

export const leftAlignSubGroupChildrenHorizontallyWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = resolveHorizontalAlignmentMetrics(layoutConfig, config);
  const updated = nodes.map(node => ({ ...node }));
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated) {
    if (String(subGroup.type || '') !== 'subGroup') continue;

    const measuredWidth = subGroup.measured?.width ?? subGroup.style?.width ?? subGroup.width;
    if (
      typeof measuredWidth !== 'number'
      || !Number.isFinite(measuredWidth)
      || measuredWidth <= 0
    ) continue;

    const subGroupX = finiteOrZero(subGroup.position?.x);
    const containerWidth = Math.min(measuredWidth, 100_000);
    const innerLeft = subGroupX + metrics.horizontalPadding;
    const innerRight = subGroupX + containerWidth - metrics.horizontalPadding;
    const children = visibleSubGroupChildren(subGroup, nodeById);
    if (!children.length) continue;

    for (const row of groupChildrenByVisualRow(
      children,
      metrics.verticalGap,
      metrics.defaultNodeHeight,
    )) {
      let cursorX = innerLeft;
      for (const node of row.slice().sort(
        (a, b) => finiteOrZero(a.position?.x) - finiteOrZero(b.position?.x),
      )) {
        const width = nodeWidth(node, 1);
        const x = Math.min(
          Math.max(cursorX, innerLeft),
          Math.max(innerLeft, innerRight - width),
        );
        node.position = { x, y: finiteOrZero(node.position?.y) };
        cursorX = x + width + metrics.horizontalGap;
      }
    }
  }

  return updated;
};

interface SubGroupChildLayoutMetrics {
  horizontalGap: number;
  verticalGap: number;
  safeWidth: number;
  safeHeight: number;
  maxRowWidth: number;
  startX: number;
  startY: number;
}

const resolveSubGroupChildLayoutMetrics = (
  subGroup: ReactFlowNode,
  layoutConfig: unknown,
  config: unknown,
): SubGroupChildLayoutMetrics => {
  const layout = asRecord(layoutConfig);
  const horizontalGap = Math.floor(boundedPositive(layout.NODE_H_GAP, 120, 12));
  const verticalGap = Math.floor(boundedPositive(layout.NODE_V_GAP, 80, 12));
  const safeWidth = boundedPositive(layout.NODE_MIN_WIDTH, 120, 120);
  const safeHeight = boundedPositive(nestedValue(config, 'node', 'height'), 80, 80);
  const maxRowWidth = boundedPositive(
    firstDefined(nestedValue(config, 'subGroup', 'maxWidth'), layout.SUB_GROUP_MAX_WIDTH),
    1000,
    safeWidth,
    100_000,
  );
  const padLeft = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'horizontal'),
    nestedValue(config, 'subGroup', 'padding', 'horizontal'),
    nestedValue(layout, 'SUB_GROUP_PADDING', 'H'),
  ), 24, 24);
  const headerHeight = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'height'),
    nestedValue(config, 'subGroup', 'title', 'height'),
    layout.SUB_GROUP_TITLE_HEIGHT,
  ), 30, 30);
  const headerSafeGap = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    nestedValue(config, 'subGroup', 'title', 'padding', 'vertical'),
    layout.SUB_GROUP_TITLE_SAFE_GAP,
  ), 16, 16);
  const padTop = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subGroup', 'padding', 'top'),
    nestedValue(layout, 'SUB_GROUP_PADDING', 'V_TOP'),
  ), 28, 28);

  return {
    horizontalGap,
    verticalGap,
    safeWidth,
    safeHeight,
    maxRowWidth,
    startX: finiteOrZero(subGroup.position?.x) + padLeft,
    startY: finiteOrZero(subGroup.position?.y) + headerHeight + headerSafeGap + padTop,
  };
};

export const centerSubGroupChildrenVerticallyWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const layout = asRecord(layoutConfig);
  const titleHeight = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'height'),
    nestedValue(config, 'subGroup', 'title', 'height'),
    layout.SUB_GROUP_TITLE_HEIGHT,
  ), 30, 0);
  const titleSafeGap = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    nestedValue(config, 'subGroup', 'title', 'padding', 'vertical'),
    layout.SUB_GROUP_TITLE_SAFE_GAP,
  ), 16, 0);
  const paddingTop = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subGroup', 'padding', 'top'),
    nestedValue(layout, 'SUB_GROUP_PADDING', 'V_TOP'),
  ), 28, 0);
  const paddingBottom = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'bottom'),
    nestedValue(config, 'subGroup', 'padding', 'bottom'),
    nestedValue(layout, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
  ), 16, 0);
  const updated = nodes.map(node => ({ ...node }));
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated) {
    if (String(subGroup.type || '') !== 'subGroup') continue;
    const childIds = Array.isArray(subGroup.data?.children)
      ? subGroup.data.children.filter((id): id is string => typeof id === 'string')
      : [];
    const children = childIds
      .map(id => nodeById.get(id))
      .filter((node): node is ReactFlowNode => Boolean(node));
    if (!children.length) continue;

    const subGroupY = finiteOrZero(subGroup.position?.y);
    const subGroupHeight = boundedPositive(
      subGroup.measured?.height ?? subGroup.style?.height ?? subGroup.height,
      240,
      1,
      100_000,
    );
    const headerAndPadding = titleHeight + titleSafeGap + paddingTop;
    const innerTop = subGroupY + headerAndPadding;
    const availableHeight = subGroupHeight - headerAndPadding - paddingBottom;
    if (availableHeight <= 1) continue;

    const childBounds = children.map(child => {
      const y = typeof child.position?.y === 'number' && Number.isFinite(child.position.y)
        ? child.position.y
        : innerTop;
      return {
        node: child,
        y,
        bottom: y + nodeHeight(child, 80, 1),
      };
    });
    const minChildY = Math.min(...childBounds.map(bound => bound.y));
    const maxChildY = Math.max(...childBounds.map(bound => bound.bottom));
    const contentHeight = maxChildY - minChildY;
    if (contentHeight >= availableHeight) continue;

    const targetMinY = innerTop + (availableHeight - contentHeight) / 2;
    const shiftY = Math.round(targetMinY - minChildY);
    if (Math.abs(shiftY) < 1) continue;

    for (const bound of childBounds) {
      bound.node.position = {
        x: finiteOrZero(bound.node.position?.x),
        y: finiteOrZero(bound.node.position?.y) + shiftY,
      };
    }
  }

  return updated;
};

export const layoutSubGroupChildrenInRow = (
  children: ReactFlowNode[],
  subGroup: ReactFlowNode,
  layoutConfig: unknown,
  config: unknown,
): void => {
  if (!children.length) return;
  const metrics = resolveSubGroupChildLayoutMetrics(subGroup, layoutConfig, config);
  const rowHeight = children.reduce(
    (maximum, node) => Math.max(
      maximum,
      nodeHeight(node, metrics.safeHeight, metrics.safeHeight),
    ),
    metrics.safeHeight,
  );

  let cursorX = metrics.startX;
  for (const node of children) {
    const width = nodeWidth(node, metrics.safeWidth);
    const height = nodeHeight(node, metrics.safeHeight, metrics.safeHeight);
    node.position = {
      x: cursorX,
      y: metrics.startY + Math.round((rowHeight - height) / 2),
    };
    cursorX += width + metrics.horizontalGap;
  }
};

export const alignSubGroupGridRows = (children: ReactFlowNode[]): void => {
  if (children.length <= 1) return;

  const sorted = children.slice().sort((a, b) => (
    finiteOrZero(a.position?.y) - finiteOrZero(b.position?.y)
  ));
  const rows: ReactFlowNode[][] = [];
  let currentRow: ReactFlowNode[] = [];
  let currentRowY = finiteOrZero(sorted[0].position?.y);

  for (const node of sorted) {
    const nodeY = finiteOrZero(node.position?.y);
    if (Math.abs(nodeY - currentRowY) < 30) {
      currentRow.push(node);
    } else {
      rows.push(currentRow);
      currentRow = [node];
      currentRowY = nodeY;
    }
  }
  if (currentRow.length) rows.push(currentRow);

  for (const row of rows) {
    const getHeight = (node: ReactFlowNode) => finiteOrZero(
      node.measured?.height ?? node.style?.height
    );
    const maxHeight = row.reduce((max, node) => Math.max(max, getHeight(node)), 0);
    if (maxHeight <= 0) continue;
    const rowTop = Math.min(...row.map(node => finiteOrZero(node.position?.y)));

    for (const node of row) {
      const height = getHeight(node) || 80;
      node.position = {
        x: finiteOrZero(node.position?.x),
        y: rowTop + Math.round((maxHeight - height) / 2),
      };
    }
  }
};

export const alignSubGroupStack = (children: ReactFlowNode[]): void => {
  if (children.length === 0) return;
  const getWidth = (node: ReactFlowNode) => finiteOrZero(
    node.measured?.width ?? node.style?.width
  );
  const maxWidth = children.reduce((max, node) => Math.max(max, getWidth(node)), 0);
  const minX = Math.min(...children.map(node => finiteOrZero(node.position?.x)));

  for (const node of children) {
    const width = getWidth(node) || 120;
    node.position = {
      x: minX + Math.round((maxWidth - width) / 2),
      y: finiteOrZero(node.position?.y),
    };
  }
};

export const layoutSubGroupChildrenFlow = (
  children: ReactFlowNode[],
  subGroup: ReactFlowNode,
  layoutConfig: unknown,
  config: unknown,
): void => {
  if (!children.length) return;
  const metrics = resolveSubGroupChildLayoutMetrics(subGroup, layoutConfig, config);

  let cursorX = 0;
  let cursorY = 0;
  let rowMaxHeight = 0;
  let rowNodes: ReactFlowNode[] = [];
  const flushRow = () => {
    for (const node of rowNodes) {
      node.position = { x: finiteOrZero(node.position?.x), y: metrics.startY + cursorY };
    }
    cursorY += rowMaxHeight + metrics.verticalGap;
    cursorX = 0;
    rowMaxHeight = 0;
    rowNodes = [];
  };
  for (const node of children) {
    const width = nodeWidth(node, metrics.safeWidth);
    const height = nodeHeight(node, metrics.safeHeight, 1);
    if (cursorX + width > metrics.maxRowWidth && cursorX > 0) flushRow();
    node.position = { x: metrics.startX + cursorX, y: metrics.startY + cursorY };
    rowNodes.push(node);
    rowMaxHeight = Math.max(rowMaxHeight, height);
    cursorX += width + metrics.horizontalGap;
  }
  flushRow();
};

export type StrictSubGroupChildLayout = 'horizontal' | 'vertical' | 'grid' | 'centered';

const strictLayoutValues = new Set<StrictSubGroupChildLayout>([
  'horizontal',
  'vertical',
  'grid',
  'centered',
]);

const coerceStrictLayout = (value: unknown): StrictSubGroupChildLayout => (
  typeof value === 'string' && strictLayoutValues.has(value as StrictSubGroupChildLayout)
    ? value as StrictSubGroupChildLayout
    : 'horizontal'
);

interface StrictLayoutMetrics {
  horizontalGap: number;
  verticalGap: number;
  horizontalPadding: number;
  topPadding: number;
  titleHeight: number;
  titlePadding: number;
  bottomPadding: number;
  minimumNodeWidth: number;
  defaultNodeHeight: number;
  fallbackContainerWidth: number;
}

const resolveStrictLayoutMetrics = (
  layoutConfig: unknown,
  config: unknown,
): StrictLayoutMetrics => {
  const layout = asRecord(layoutConfig);
  const titleHeight = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'height'),
    nestedValue(config, 'subGroup', 'title', 'height'),
    layout.SUB_GROUP_TITLE_HEIGHT,
  ), 28, 0);
  const titlePadding = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    nestedValue(config, 'subGroup', 'title', 'padding', 'vertical'),
    layout.SUB_GROUP_TITLE_SAFE_GAP,
  ), 8, 0);
  const configuredTopPadding = boundedPositive(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subGroup', 'padding', 'top'),
    nestedValue(layout, 'SUB_GROUP_PADDING', 'V_TOP'),
  ), 28, 0);
  const titleClearance = boundedPositive(
    layout.SUB_GROUP_TITLE_CLEARANCE,
    titleHeight + titlePadding,
    0,
  );
  const ensureTitleClearance = layout.ENSURE_SUB_GROUP_TITLE_CLEARANCE === true;

  return {
    horizontalGap: boundedPositive(layout.NODE_H_GAP, 120, 0),
    verticalGap: boundedPositive(layout.NODE_V_GAP, 80, 0),
    horizontalPadding: boundedPositive(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(config, 'subGroup', 'padding', 'horizontal'),
      nestedValue(layout, 'SUB_GROUP_PADDING', 'H'),
    ), 30, 0),
    topPadding: (
      (ensureTitleClearance
        ? Math.max(titleHeight + titlePadding, titleClearance)
        : titleHeight + titlePadding)
      + configuredTopPadding
    ),
    titleHeight,
    titlePadding,
    bottomPadding: boundedPositive(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'bottom'),
      nestedValue(config, 'subGroup', 'padding', 'bottom'),
      nestedValue(layout, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
    ), 28, 0),
    minimumNodeWidth: boundedPositive(layout.NODE_MIN_WIDTH, 120, 1, 100_000),
    defaultNodeHeight: boundedPositive(nestedValue(config, 'node', 'height'), 80, 1, 100_000),
    fallbackContainerWidth: boundedPositive(
      nestedValue(config, 'layout', 'mainColumnWidth'),
      400,
      1,
      100_000,
    ),
  };
};

const cloneStrictLayoutNodes = (nodes: ReactFlowNode[]): ReactFlowNode[] => nodes.map(node => ({
  ...node,
  position: {
    x: finiteOrZero(node.position?.x),
    y: finiteOrZero(node.position?.y),
  },
  style: node.style ? { ...node.style } : node.style,
  measured: node.measured
    ? {
      width: boundedPositive(node.measured.width, 1, 1, 100_000),
      height: boundedPositive(node.measured.height, 1, 1, 100_000),
    }
    : node.measured,
}));

export const enforceSubGroupChildrenLayoutStrictWithConfig = (
  nodes: ReactFlowNode[],
  requestedLayout: unknown,
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const layout = coerceStrictLayout(requestedLayout);
  const metrics = resolveStrictLayoutMetrics(layoutConfig, config);
  const updated = cloneStrictLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));
  const subgroupCountByDomain = new Map<string, number>();
  for (const node of updated) {
    if (String(node.type || '') !== 'subGroup') continue;
    const domain = String(asRecord(node.data).domain || '').trim();
    subgroupCountByDomain.set(domain, (subgroupCountByDomain.get(domain) || 0) + 1);
  }

  for (const subGroup of updated) {
    if (String(subGroup.type || '') !== 'subGroup') continue;
    const children = visibleSubGroupChildren(subGroup, nodeById);
    if (!children.length) continue;

    const groupX = finiteOrZero(subGroup.position?.x);
    const groupY = finiteOrZero(subGroup.position?.y);
    const groupWidthValue = subGroup.measured?.width ?? subGroup.style?.width ?? subGroup.width;
    const groupWidth = (
      typeof groupWidthValue === 'number'
      && Number.isFinite(groupWidthValue)
      && groupWidthValue > 0
    )
      ? Math.min(groupWidthValue, 100_000)
      : metrics.fallbackContainerWidth;
    const innerLeft = groupX + metrics.horizontalPadding;
    const innerRight = groupX + groupWidth - metrics.horizontalPadding;
    const availableWidth = Math.max(1, innerRight - innerLeft);

    if (layout === 'grid') {
      const gridTopPadding = metrics.titleHeight
        + Math.max(6, Math.floor(metrics.titlePadding * 0.5));
      const innerTop = groupY + gridTopPadding;
      const columnGap = Math.max(12, metrics.horizontalGap);
      const rowGap = Math.max(8, metrics.verticalGap);
      const domain = String(asRecord(subGroup.data).domain || '').trim();
      const maximumColumns = Math.max(
        1,
        Math.min(
          children.length,
          (subgroupCountByDomain.get(domain) || 0) >= 3 ? 2 : 3,
        ),
      );
      const rows: ReactFlowNode[][] = [];
      for (let index = 0; index < children.length; index += maximumColumns) {
        rows.push(children.slice(index, index + maximumColumns));
      }
      const rowHeights = rows.map(row => Math.max(
        ...row.map(node => nodeHeight(node, metrics.defaultNodeHeight, 1)),
      ));
      const rowWidths = rows.map(row => row.reduce(
        (sum, node, index) => (
          sum
          + nodeWidth(node, metrics.minimumNodeWidth)
          + (index > 0 ? columnGap : 0)
        ),
        0,
      ));
      const contentWidth = Math.max(...rowWidths, 0);
      const newWidth = contentWidth + metrics.horizontalPadding * 2;
      const effectiveInnerWidth = Math.max(
        1,
        nodeWidth(subGroup, newWidth) - metrics.horizontalPadding * 2,
      );
      let rowY = innerTop;
      rows.forEach((row, rowIndex) => {
        let cursorX = innerLeft
          + Math.floor(Math.max(0, effectiveInnerWidth - rowWidths[rowIndex]) / 2);
        for (const child of row) {
          child.position = { x: cursorX, y: rowY };
          cursorX += nodeWidth(child, metrics.minimumNodeWidth) + columnGap;
        }
        rowY += rowHeights[rowIndex] + rowGap;
      });
      const contentHeight = rowHeights.reduce((sum, height) => sum + height, 0);
      const newHeight = (
        contentHeight
        + Math.max(0, rows.length - 1) * rowGap
        + gridTopPadding
        + Math.max(8, Math.floor(metrics.bottomPadding * 0.6))
      );
      subGroup.style = { ...subGroup.style, width: Math.round(newWidth), height: Math.round(newHeight) };
      subGroup.measured = { width: Math.round(newWidth), height: Math.round(newHeight) };
      continue;
    }

    const innerTop = groupY + metrics.topPadding;
    if (layout === 'vertical') {
      let cursorY = innerTop;
      for (const child of children) {
        const width = nodeWidth(child, metrics.minimumNodeWidth);
        const height = nodeHeight(child, metrics.defaultNodeHeight, 1);
        child.position = {
          x: Math.min(
            Math.max(
              innerLeft + Math.floor(Math.max(0, availableWidth - width) / 2),
              innerLeft,
            ),
            Math.max(innerLeft, innerRight - width),
          ),
          y: cursorY,
        };
        cursorY += height + metrics.verticalGap;
      }
      continue;
    }

    const totalWidth = children.reduce(
      (sum, child, index) => (
        sum
        + nodeWidth(child, metrics.minimumNodeWidth)
        + (index > 0 ? metrics.horizontalGap : 0)
      ),
      0,
    );
    const finalWidth = totalWidth <= availableWidth
      ? groupWidth
      : Math.max(groupWidth, totalWidth + metrics.horizontalPadding * 2);
    if (finalWidth !== groupWidth) {
      const height = nodeHeight(subGroup, 1, 1);
      subGroup.style = { ...subGroup.style, width: Math.round(finalWidth) };
      subGroup.measured = { width: Math.round(finalWidth), height };
    }
    const finalInnerWidth = Math.max(1, finalWidth - metrics.horizontalPadding * 2);
    let cursorX = innerLeft + Math.floor(Math.max(0, finalInnerWidth - totalWidth) / 2);
    for (const child of children) {
      const width = nodeWidth(child, metrics.minimumNodeWidth);
      const x = Math.min(
        Math.max(cursorX, innerLeft),
        Math.max(innerLeft, innerLeft + finalInnerWidth - width),
      );
      child.position = { x, y: innerTop };
      cursorX = x + width + metrics.horizontalGap;
    }
  }

  return updated;
};
