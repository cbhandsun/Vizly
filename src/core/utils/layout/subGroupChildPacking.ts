import type { Node as ReactFlowNode } from '@xyflow/react';

import { diagramConfigManager } from '../../config/DiagramConfig';

type UnknownRecord = Record<string, unknown>;

interface SubGroupInsets {
  horizontal: number;
  titleHeight: number;
  titleVerticalPadding: number;
  topPadding: number;
  bottomPadding: number;
  titleSafeGap: number;
}

const asRecord = (value: unknown): UnknownRecord => (
  typeof value === 'object' && value !== null ? value as UnknownRecord : {}
);

const nestedValue = (value: unknown, ...keys: string[]): unknown => {
  let current: unknown = value;
  for (const key of keys) {
    current = asRecord(current)[key];
  }
  return current;
};

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const finiteSize = (value: unknown, fallback: number): number => (
  Math.max(0, finiteNumber(value, fallback))
);

const finiteGap = (value: unknown, minimum: number): number => (
  Math.max(minimum, finiteNumber(value, minimum))
);

const nodePosition = (node: ReactFlowNode, axis: 'x' | 'y'): number => (
  finiteNumber(asRecord(node.position)[axis], 0)
);

const nodeDimension = (
  node: ReactFlowNode,
  dimension: 'width' | 'height',
  fallback: number,
  includeDirectDimension = true,
): number => finiteSize(
  asRecord(node.measured)[dimension]
    ?? asRecord(node.style)[dimension]
    ?? (includeDirectDimension ? asRecord(node)[dimension] : undefined),
  fallback,
);

const relativePosition = (
  node: ReactFlowNode,
  axis: 'x' | 'y',
  fallbackToPosition = true,
): number => (
  finiteNumber(
    nestedValue(node.data, '__rel', axis),
    fallbackToPosition ? nodePosition(node, axis) : 0,
  )
);

const readInsets = (): SubGroupInsets => {
  const config: unknown = diagramConfigManager.getConfig() ?? {};
  const layoutConfig: unknown = diagramConfigManager.getLayoutConfig() ?? {};
  const horizontal = finiteSize(
    nestedValue(config, 'subDomain', 'padding', 'horizontal')
      ?? nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
    24,
  );

  return {
    horizontal,
    titleHeight: finiteSize(nestedValue(config, 'subDomain', 'title', 'height'), 32),
    titleVerticalPadding: finiteSize(
      nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
      8,
    ),
    topPadding: finiteSize(nestedValue(config, 'subDomain', 'padding', 'top'), 12),
    bottomPadding: finiteSize(
      nestedValue(config, 'subDomain', 'padding', 'bottom')
        ?? nestedValue(config, 'subDomain', 'bottomSafeGap'),
      12,
    ),
    titleSafeGap: finiteSize(nestedValue(config, 'subDomain', 'title', 'safeGap'), 0),
  };
};

const contentBounds = (
  sg: ReactFlowNode,
  includeBottom: boolean,
  widthFallback: number,
) => {
  const insets = readInsets();
  const x = nodePosition(sg, 'x');
  const y = nodePosition(sg, 'y');
  const left = x + insets.horizontal;
  const top = y
    + insets.titleHeight
    + insets.titleVerticalPadding
    + insets.topPadding
    + insets.titleSafeGap;
  const width = nodeDimension(sg, 'width', widthFallback);
  const height = nodeDimension(sg, 'height', 80, false);

  return {
    left,
    top,
    right: Math.max(left, left + width - insets.horizontal * 2),
    bottom: includeBottom ? Math.max(top, y + height - insets.bottomPadding) : undefined,
  };
};

/** Packs children into their relative rows while enforcing finite container bounds. */
export const packSubGroupChildrenRigid = (
  sg: ReactFlowNode,
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number,
): ReactFlowNode[] => {
  const bounds = contentBounds(sg, true, 0);
  const horizontalGap = finiteGap(hGap, 8);
  const verticalGap = finiteGap(vGap, 8);
  const rows = new Map<number, ReactFlowNode[]>();

  for (const node of nodes) {
    const bucket = Math.round(relativePosition(node, 'y', false) / verticalGap);
    const row = rows.get(bucket) ?? [];
    row.push(node);
    rows.set(bucket, row);
  }

  let nextY = bounds.top;
  for (const bucket of [...rows.keys()].sort((left, right) => left - right)) {
    const row = rows.get(bucket) ?? [];
    row.sort((left, right) => (
      relativePosition(left, 'x', false) - relativePosition(right, 'x', false)
    ));
    const rowY = Math.max(nextY, bounds.top + bucket * verticalGap);
    let nextX = bounds.left;
    let maximumHeight = 0;

    for (const node of row) {
      const width = nodeDimension(node, 'width', 120, false);
      const height = nodeDimension(node, 'height', 80, false);
      const x = Math.min(
        Math.max(nextX, bounds.left),
        Math.max(bounds.left, bounds.right - width),
      );
      const y = Math.min(
        Math.max(rowY, bounds.top),
        Math.max(bounds.top, (bounds.bottom ?? bounds.top) - height),
      );
      node.position = { x: Math.round(x), y: Math.round(y) };
      nextX = x + width + horizontalGap;
      maximumHeight = Math.max(maximumHeight, height);
    }
    nextY = rowY + maximumHeight + verticalGap;
  }

  return [sg, ...nodes];
};

/** Stacks children vertically in semantic relative-position order. */
export const reflowSubGroupChildrenVertical = (
  sg: ReactFlowNode,
  nodes: ReactFlowNode[],
  _hGap: number,
  vGap: number,
): ReactFlowNode[] => {
  const bounds = contentBounds(sg, false, 240);
  const verticalGap = finiteGap(vGap, 8);
  const availableWidth = Math.max(0, bounds.right - bounds.left);
  const sorted = [...nodes].sort(
    (left, right) => relativePosition(left, 'y') - relativePosition(right, 'y'),
  );
  let nextY = bounds.top;

  for (const node of sorted) {
    const width = nodeDimension(node, 'width', 0);
    const height = nodeDimension(node, 'height', 0);
    const x = bounds.left + Math.max(0, Math.floor((availableWidth - width) / 2));
    node.position = { x: Math.round(x), y: Math.round(nextY) };
    nextY += height + verticalGap;
  }

  return [sg, ...sorted];
};

/** Wraps children into centered rows constrained by the subgroup content width. */
export const reflowSubGroupChildrenGrid = (
  sg: ReactFlowNode,
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number,
): ReactFlowNode[] => {
  const bounds = contentBounds(sg, false, 240);
  const horizontalGap = finiteGap(hGap, 8);
  const verticalGap = finiteGap(vGap, 8);
  const availableWidth = Math.max(0, bounds.right - bounds.left);
  const sorted = [...nodes].sort((left, right) => {
    const yDifference = relativePosition(left, 'y') - relativePosition(right, 'y');
    return yDifference || relativePosition(left, 'x') - relativePosition(right, 'x');
  });
  const rows: ReactFlowNode[][] = [];
  let currentRow: ReactFlowNode[] = [];
  let currentWidth = 0;

  for (const node of sorted) {
    const width = nodeDimension(node, 'width', 0);
    const requiredWidth = currentWidth + (currentRow.length > 0 ? horizontalGap : 0) + width;
    if (currentRow.length > 0 && requiredWidth > availableWidth) {
      rows.push(currentRow);
      currentRow = [node];
      currentWidth = width;
    } else {
      currentRow.push(node);
      currentWidth = requiredWidth;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  let nextY = bounds.top;
  for (const row of rows) {
    const widths = row.map((node) => nodeDimension(node, 'width', 0));
    const heights = row.map((node) => nodeDimension(node, 'height', 0));
    const contentWidth = widths.reduce(
      (total, width, index) => total + width + (index > 0 ? horizontalGap : 0),
      0,
    );
    let nextX = bounds.left + Math.max(0, Math.floor((availableWidth - contentWidth) / 2));
    let maximumHeight = 0;

    row.forEach((node, index) => {
      const width = widths[index];
      const height = heights[index];
      const x = Math.min(
        Math.max(nextX, bounds.left),
        Math.max(bounds.left, bounds.right - width),
      );
      node.position = { x: Math.round(x), y: Math.round(nextY) };
      nextX = x + width + horizontalGap;
      maximumHeight = Math.max(maximumHeight, height);
    });
    nextY += maximumHeight + verticalGap;
  }

  return [sg, ...sorted];
};
