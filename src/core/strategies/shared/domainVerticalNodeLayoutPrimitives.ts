import type { Node as ReactFlowNode } from '@xyflow/react';

export type DomainVerticalPrimitiveLayout =
  | 'horizontal'
  | 'vertical'
  | 'grid'
  | 'centered'
  | 'dagre';

export interface DomainVerticalNodeMetrics {
  minimumWidth: number;
  defaultWidth?: number;
  defaultHeight: number;
  horizontalGap: number;
  verticalGap: number;
}

export interface GridLayoutResult {
  endY: number;
  rows: ReactFlowNode[][];
  rowWidths: number[];
}

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveNumber = (value: unknown, fallback: number): number => {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

const sanitizedMetrics = (
  metrics: DomainVerticalNodeMetrics,
): Required<DomainVerticalNodeMetrics> => ({
  minimumWidth: positiveNumber(metrics.minimumWidth, 120),
  defaultWidth: positiveNumber(metrics.defaultWidth, 240),
  defaultHeight: positiveNumber(metrics.defaultHeight, 80),
  horizontalGap: Math.max(0, finiteNumber(metrics.horizontalGap, 120)),
  verticalGap: Math.max(0, finiteNumber(metrics.verticalGap, 60)),
});

const nodeWidth = (
  node: ReactFlowNode,
  metrics: Required<DomainVerticalNodeMetrics>,
  enforceMinimum: boolean,
): number => {
  const measured = positiveNumber(node.measured?.width, metrics.defaultWidth);
  const styled = positiveNumber(node.style?.width ?? node.width, metrics.defaultWidth);
  const width = Math.max(measured, styled);
  return enforceMinimum ? Math.max(width, metrics.minimumWidth) : width;
};

const nodeHeight = (
  node: ReactFlowNode,
  metrics: Required<DomainVerticalNodeMetrics>,
): number => positiveNumber(
  node.measured?.height ?? node.style?.height ?? node.height,
  metrics.defaultHeight,
);

export const placeNodeRowWithWrap = (
  nodes: ReactFlowNode[],
  left: number,
  right: number,
  startY: number,
  horizontalGap: number,
  metrics: DomainVerticalNodeMetrics,
): { endY: number } => {
  const resolved = sanitizedMetrics(metrics);
  const safeLeft = finiteNumber(left, 0);
  const safeRight = Math.max(safeLeft, finiteNumber(right, safeLeft));
  const safeStartY = finiteNumber(startY, 0);
  const gap = Math.max(0, finiteNumber(horizontalGap, resolved.horizontalGap));
  let cursorX = safeLeft;
  let cursorY = safeStartY;
  let rowMaxHeight = 0;

  for (const node of nodes) {
    const width = nodeWidth(node, resolved, false);
    const height = nodeHeight(node, resolved);
    if (cursorX > safeLeft && cursorX + width > safeRight) {
      cursorX = safeLeft;
      cursorY += rowMaxHeight + resolved.verticalGap;
      rowMaxHeight = 0;
    }
    node.position = { x: Math.round(cursorX), y: Math.round(cursorY) };
    cursorX += width + gap;
    rowMaxHeight = Math.max(rowMaxHeight, height);
  }

  return { endY: cursorY + rowMaxHeight };
};

export const placeNodeRowWithoutWrap = (
  nodes: ReactFlowNode[],
  left: number,
  startY: number,
  horizontalGap: number,
  metrics: DomainVerticalNodeMetrics,
): { endY: number } => {
  const resolved = sanitizedMetrics(metrics);
  let cursorX = finiteNumber(left, 0);
  const safeStartY = finiteNumber(startY, 0);
  const gap = Math.max(0, finiteNumber(horizontalGap, resolved.horizontalGap));
  let rowMaxHeight = 0;

  for (const node of nodes) {
    const width = nodeWidth(node, resolved, false);
    const height = nodeHeight(node, resolved);
    node.position = { x: Math.round(cursorX), y: Math.round(safeStartY) };
    cursorX += width + gap;
    rowMaxHeight = Math.max(rowMaxHeight, height);
  }

  return { endY: safeStartY + rowMaxHeight };
};

export const layoutNodesHorizontally = (
  nodes: ReactFlowNode[],
  left: number,
  right: number,
  startY: number,
  metrics: DomainVerticalNodeMetrics,
): { endY: number } => {
  const resolved = sanitizedMetrics(metrics);
  const safeLeft = finiteNumber(left, 0);
  const availableWidth = Math.max(0, finiteNumber(right, safeLeft) - safeLeft);
  const widths = nodes.map(node => nodeWidth(node, resolved, true));
  const heights = nodes.map(node => nodeHeight(node, resolved));
  const rowHeight = heights.length ? Math.max(...heights) : 0;
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
    + Math.max(0, nodes.length - 1) * resolved.horizontalGap;
  let cursorX = availableWidth > totalWidth
    ? safeLeft + Math.round((availableWidth - totalWidth) / 2)
    : safeLeft;
  const safeStartY = finiteNumber(startY, 0);

  nodes.forEach((node, index) => {
    node.position = {
      x: Math.round(cursorX),
      y: Math.round(safeStartY + (rowHeight - heights[index]) / 2),
    };
    cursorX += widths[index] + resolved.horizontalGap;
  });

  return { endY: safeStartY + rowHeight };
};

export const layoutNodesVertically = (
  nodes: ReactFlowNode[],
  left: number,
  startY: number,
  metrics: DomainVerticalNodeMetrics,
): { endY: number } => {
  const resolved = sanitizedMetrics(metrics);
  const safeLeft = finiteNumber(left, 0);
  let cursorY = finiteNumber(startY, 0);

  for (const node of nodes) {
    node.position = { x: Math.round(safeLeft), y: Math.round(cursorY) };
    cursorY += nodeHeight(node, resolved) + resolved.verticalGap;
  }
  return { endY: cursorY };
};

export const layoutNodesInGrid = (
  nodes: ReactFlowNode[],
  left: number,
  right: number,
  startY: number,
  columns: number | undefined,
  metrics: DomainVerticalNodeMetrics,
): GridLayoutResult => {
  const resolved = sanitizedMetrics(metrics);
  const columnGap = Math.max(12, resolved.horizontalGap);
  const rowGap = Math.max(8, resolved.verticalGap);
  const safeLeft = finiteNumber(left, 0);
  const availableWidth = Math.max(1, finiteNumber(right, safeLeft + 1) - safeLeft);
  const safeStartY = finiteNumber(startY, 0);
  const widths = nodes.map(node => nodeWidth(node, resolved, false));
  const heights = nodes.map(node => nodeHeight(node, resolved));
  const maxColumns = typeof columns === 'number' && Number.isFinite(columns)
    ? Math.max(1, Math.min(Math.floor(columns), Math.max(1, nodes.length)))
    : Number.POSITIVE_INFINITY;
  const rows: ReactFlowNode[][] = [];
  const rowWidths: number[] = [];
  let cursorX = safeLeft;
  let cursorY = safeStartY;
  let column = 0;
  let rowMaxHeight = 0;
  let rowUsedWidth = 0;

  nodes.forEach((node, index) => {
    const width = widths[index];
    const height = heights[index];
    const exceedsWidth = maxColumns === Number.POSITIVE_INFINITY
      && column > 0
      && rowUsedWidth + columnGap + width > availableWidth;
    if (column >= maxColumns || exceedsWidth) {
      rowWidths.push(rowUsedWidth);
      cursorX = safeLeft;
      cursorY += rowMaxHeight + rowGap;
      column = 0;
      rowMaxHeight = 0;
      rowUsedWidth = 0;
    }
    if (column === 0) rows.push([]);
    node.position = { x: Math.round(cursorX), y: Math.round(cursorY) };
    rows[rows.length - 1].push(node);
    rowMaxHeight = Math.max(rowMaxHeight, height);
    rowUsedWidth = column === 0 ? width : rowUsedWidth + columnGap + width;
    column += 1;
    cursorX += width + columnGap;
  });
  if (nodes.length > 0) rowWidths.push(rowUsedWidth);

  return { endY: cursorY + rowMaxHeight, rows, rowWidths };
};

export const resolveNodeOverlapsByLayout = (
  nodes: ReactFlowNode[],
  layout: DomainVerticalPrimitiveLayout,
  metrics: DomainVerticalNodeMetrics,
): void => {
  const resolved = sanitizedMetrics(metrics);
  const widthOf = (node: ReactFlowNode) => nodeWidth(node, resolved, false);
  const heightOf = (node: ReactFlowNode) => nodeHeight(node, resolved);

  if (layout === 'grid') {
    const sorted = [...nodes].sort(
      (left, right) =>
        finiteNumber(left.position?.y, 0) - finiteNumber(right.position?.y, 0),
    );
    const averageHeight = sorted.length
      ? sorted.reduce((sum, node) => sum + heightOf(node), 0) / sorted.length
      : resolved.defaultHeight;
    const rowTolerance = Math.max(
      6,
      Math.floor(Math.min(resolved.verticalGap * 0.35, averageHeight * 0.5)),
    );
    const rows: ReactFlowNode[][] = [];
    for (const node of sorted) {
      const y = finiteNumber(node.position?.y, 0);
      const row = rows.find(candidate => {
        const averageY = candidate.reduce(
          (sum, member) => sum + finiteNumber(member.position?.y, 0),
          0,
        ) / candidate.length;
        return Math.abs(y - averageY) <= rowTolerance;
      });
      if (row) row.push(node);
      else rows.push([node]);
    }
    for (const row of rows) {
      const byX = [...row].sort(
        (left, right) =>
          finiteNumber(left.position?.x, 0) - finiteNumber(right.position?.x, 0),
      );
      for (let index = 1; index < byX.length; index++) {
        const previous = byX[index - 1];
        const current = byX[index];
        const desiredX = finiteNumber(previous.position?.x, 0)
          + widthOf(previous)
          + Math.max(12, resolved.horizontalGap);
        if (finiteNumber(current.position?.x, 0) < desiredX) {
          current.position = {
            x: Math.round(desiredX),
            y: finiteNumber(current.position?.y, 0),
          };
        }
      }
    }
    return;
  }

  const vertical = layout === 'vertical';
  const sorted = [...nodes].sort((left, right) => (
    vertical
      ? finiteNumber(left.position?.y, 0) - finiteNumber(right.position?.y, 0)
      : finiteNumber(left.position?.x, 0) - finiteNumber(right.position?.x, 0)
  ));
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (vertical) {
      const desiredY = finiteNumber(previous.position?.y, 0)
        + heightOf(previous)
        + resolved.verticalGap;
      if (finiteNumber(current.position?.y, 0) < desiredY) {
        current.position = {
          x: finiteNumber(current.position?.x, 0),
          y: Math.round(desiredY),
        };
      }
    } else {
      const desiredX = finiteNumber(previous.position?.x, 0)
        + widthOf(previous)
        + resolved.horizontalGap;
      if (finiteNumber(current.position?.x, 0) < desiredX) {
        current.position = {
          x: Math.round(desiredX),
          y: finiteNumber(current.position?.y, 0),
        };
      }
    }
  }
};
