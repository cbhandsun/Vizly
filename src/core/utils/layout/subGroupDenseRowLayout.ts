import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

interface DenseRowMetrics {
  horizontalGap: number;
  verticalGap: number;
  horizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
  maximumPerRow: number;
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

const resolveMetrics = (
  maximumPerRowInput: unknown,
  layoutConfig: unknown,
  config: unknown,
): DenseRowMetrics => {
  const horizontalGap = dimension(
    nestedValue(layoutConfig, 'NODE_H_GAP'),
    120,
  );
  const verticalGap = dimension(
    nestedValue(layoutConfig, 'NODE_V_GAP'),
    80,
  );
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
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_CLEARANCE'),
  ), titleHeight + titlePadding);
  const rawMaximum = firstDefined(
    nestedValue(config, 'layout', 'maxPerRow'),
    maximumPerRowInput,
    4,
  );

  return {
    horizontalGap,
    verticalGap,
    horizontalPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(config, 'subGroup', 'padding', 'horizontal'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
    ), 30),
    topPadding: Math.max(titleHeight + titlePadding, configuredTopPadding),
    bottomPadding: dimension(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'bottom'),
      nestedValue(config, 'subGroup', 'padding', 'bottom'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
    ), 20),
    defaultNodeWidth: dimension(
      nestedValue(layoutConfig, 'NODE_MIN_WIDTH'),
      120,
    ),
    defaultNodeHeight: dimension(
      nestedValue(config, 'node', 'height'),
      80,
    ),
    maximumPerRow: Math.floor(boundedNumber(rawMaximum, 4, 2, 1_000)),
  };
};

const nodeWidth = (node: ReactFlowNode, metrics: DenseRowMetrics): number => (
  dimension(
    node.measured?.width ?? node.style?.width ?? node.width,
    metrics.defaultNodeWidth,
  )
);

const nodeHeight = (node: ReactFlowNode, metrics: DenseRowMetrics): number => (
  dimension(
    node.measured?.height ?? node.style?.height ?? node.height,
    metrics.defaultNodeHeight,
  )
);

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

const sortRow = (row: ReactFlowNode[]): ReactFlowNode[] => (
  row.sort((left, right) => {
    const leftOrder = semanticOrder(left);
    const rightOrder = semanticOrder(right);
    if (leftOrder !== null && rightOrder !== null) return leftOrder - rightOrder;
    if (leftOrder !== null) return -1;
    if (rightOrder !== null) return 1;
    return left.position.x - right.position.x;
  })
);

const rowWidth = (
  row: ReactFlowNode[],
  horizontalGap: number,
  metrics: DenseRowMetrics,
): number => row.reduce((sum, node, index) => (
  sum + nodeWidth(node, metrics) + (index ? horizontalGap : 0)
), 0);

const wrapRow = (
  rowInput: ReactFlowNode[],
  innerWidth: number,
  horizontalGap: number,
  metrics: DenseRowMetrics,
): ReactFlowNode[][] => {
  const row = sortRow(rowInput.slice());
  const chunks: ReactFlowNode[][] = [];
  let current: ReactFlowNode[] = [];
  let currentWidth = 0;
  for (const node of row) {
    const width = nodeWidth(node, metrics);
    const nextWidth = currentWidth + (current.length ? horizontalGap : 0) + width;
    if (
      current.length
      && (
        current.length >= metrics.maximumPerRow
        || nextWidth > innerWidth
      )
    ) {
      chunks.push(current);
      current = [];
      currentWidth = 0;
    }
    currentWidth += (current.length ? horizontalGap : 0) + width;
    current.push(node);
  }
  if (current.length) chunks.push(current);
  return chunks;
};

export const splitDenseRowsInSubGroupsWithConfig = (
  nodeInputs: ReactFlowNode[],
  maximumPerRowInput: unknown,
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const nodeById = new Map(updated.map(node => [node.id, node]));
  const metrics = resolveMetrics(maximumPerRowInput, layoutConfig, config);

  for (const subGroup of updated.filter(
    node => String(node.type || '') === 'subGroup',
  )) {
    const groupWidth = dimension(
      subGroup.measured?.width ?? subGroup.style?.width ?? subGroup.width,
      0,
    );
    const groupHeight = dimension(
      subGroup.measured?.height ?? subGroup.style?.height ?? subGroup.height,
      0,
    );
    const innerLeft = subGroup.position.x + metrics.horizontalPadding;
    const innerRight = (
      subGroup.position.x
      + Math.max(1, groupWidth)
      - metrics.horizontalPadding
    );
    const innerTop = subGroup.position.y + metrics.topPadding;
    const innerWidth = Math.max(1, innerRight - innerLeft);
    const childIds = asRecord(subGroup.data).children;
    if (!Array.isArray(childIds)) continue;
    const seen = new Set<string>();
    const children: ReactFlowNode[] = [];
    for (const childId of childIds) {
      if (typeof childId !== 'string' || seen.has(childId)) continue;
      seen.add(childId);
      const child = nodeById.get(childId);
      if (
        child
        && !CONTAINER_TYPES.has(String(child.type || ''))
        && !asRecord(child.data).hidden
      ) {
        children.push(child);
      }
    }
    if (children.length <= 1) continue;

    const area = Math.max(1, Math.max(1, groupWidth) * Math.max(1, groupHeight));
    const density = Math.min(1, Math.max(0, children.length / area * 50_000));
    const scale = 1 + Math.min(0.6, density * 0.6);
    const horizontalGap = Math.max(
      12,
      Math.floor(metrics.horizontalGap * scale),
    );
    const verticalGap = Math.max(
      8,
      Math.floor(metrics.verticalGap * scale),
    );
    const rowTolerance = Math.max(8, Math.floor(verticalGap * 0.35));
    const rows: ReactFlowNode[][] = [];
    const sortedByCenter = children.slice().sort((left, right) => (
      left.position.y + nodeHeight(left, metrics) / 2
      - right.position.y - nodeHeight(right, metrics) / 2
    ));
    for (const child of sortedByCenter) {
      const center = child.position.y + nodeHeight(child, metrics) / 2;
      const matchingRow = rows.find(row => {
        const averageCenter = row.reduce((sum, item) => (
          sum + item.position.y + nodeHeight(item, metrics) / 2
        ), 0) / row.length;
        return Math.abs(center - averageCenter) <= rowTolerance;
      });
      if (matchingRow) matchingRow.push(child);
      else rows.push([child]);
    }
    const wrappedRows = rows.flatMap(row => (
      wrapRow(row, innerWidth, horizontalGap, metrics)
    ));

    let cursorY = innerTop;
    let maximumContentWidth = 0;
    let totalRowHeight = 0;
    for (const row of wrappedRows) {
      const width = rowWidth(row, horizontalGap, metrics);
      const startX = (
        innerLeft + Math.floor(Math.max(0, innerWidth - width) / 2)
      );
      let cursorX = startX;
      let maximumRowHeight = 0;
      for (const child of row) {
        const widthOfChild = nodeWidth(child, metrics);
        const heightOfChild = nodeHeight(child, metrics);
        const x = Math.min(
          Math.max(cursorX, innerLeft),
          Math.max(innerLeft, innerRight - widthOfChild),
        );
        child.position = {
          x: Math.round(boundedNumber(x, innerLeft)),
          y: Math.round(boundedNumber(cursorY, innerTop)),
        };
        cursorX = x + widthOfChild + horizontalGap;
        maximumRowHeight = Math.max(maximumRowHeight, heightOfChild);
      }
      cursorY += maximumRowHeight + verticalGap;
      maximumContentWidth = Math.max(maximumContentWidth, width);
      totalRowHeight += maximumRowHeight;
    }

    const interRowGaps = Math.max(0, wrappedRows.length - 1) * verticalGap;
    const width = Math.round(
      Math.max(
        0,
        Math.min(innerWidth, maximumContentWidth)
        + metrics.horizontalPadding * 2,
      ),
    );
    const height = Math.round(Math.max(
      0,
      totalRowHeight
      + interRowGaps
      + metrics.topPadding
      + Math.max(8, Math.floor(metrics.bottomPadding * 0.6)),
    ));
    subGroup.style = { ...subGroup.style, width, height };
    subGroup.measured = { width, height };
    subGroup.width = width;
    subGroup.height = height;
  }

  return updated;
};
