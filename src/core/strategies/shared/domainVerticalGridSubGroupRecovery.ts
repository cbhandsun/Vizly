import type { Node as ReactFlowNode } from '@xyflow/react';

import type { GridLayoutResult } from './domainVerticalNodeLayoutPrimitives';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveNumber = (value: unknown, fallback: number): number => {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

const cloneNodes = (nodes: readonly ReactFlowNode[]): ReactFlowNode[] =>
  nodes.map(node => ({
    ...node,
    position: {
      x: finiteNumber(node.position?.x, 0),
      y: finiteNumber(node.position?.y, 0),
    },
    measured: node.measured ? { ...node.measured } : undefined,
    style: node.style ? { ...node.style } : undefined,
    data: { ...((node.data as Record<string, unknown> | undefined) ?? {}) },
  }));

const domainKeyOf = (node: ReactFlowNode): string =>
  String((node.data as Record<string, unknown> | undefined)?.domain ?? '').trim();

const childIdsOf = (node: ReactFlowNode): string[] => {
  const children = (node.data as Record<string, unknown> | undefined)?.children;
  if (!Array.isArray(children)) return [];
  return [...new Set(children.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  ))];
};

const writeSize = (
  node: ReactFlowNode,
  width: number,
  height: number,
): void => {
  const safeWidth = Math.max(0, finiteNumber(width, 0));
  const safeHeight = Math.max(0, finiteNumber(height, 0));
  node.style = { ...(node.style ?? {}), width: safeWidth, height: safeHeight };
  node.measured = { width: safeWidth, height: safeHeight };
  node.width = safeWidth;
  node.height = safeHeight;
};

export interface GridSubGroupRecoveryOptions {
  domainHorizontalPadding: number;
  subGroupHorizontalPadding: number;
  subGroupTopPadding: number;
  subGroupTitleHeight: number;
  subGroupTitleVerticalPadding: number;
  bottomSafeGap: number;
  horizontalGap: number;
  verticalGap: number;
  defaultChildWidth: number;
  defaultChildHeight: number;
  compareSubGroups?: (left: ReactFlowNode, right: ReactFlowNode) => number;
  layoutGrid: (
    children: ReactFlowNode[],
    left: number,
    right: number,
    startY: number,
    columns: number,
  ) => GridLayoutResult;
}

/**
 * Reflows declared children of visible subgroups in grid mode and projects the
 * resulting child rows back into subgroup position and dimensions.
 */
export const recoverGridSubGroupsByDomainWidth = (
  nodes: readonly ReactFlowNode[],
  rawOptions: GridSubGroupRecoveryOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  const domainHorizontalPadding = Math.max(
    0,
    finiteNumber(rawOptions.domainHorizontalPadding, 24),
  );
  const subGroupHorizontalPadding = Math.max(
    0,
    finiteNumber(rawOptions.subGroupHorizontalPadding, 18),
  );
  const subGroupTopPadding = Math.max(
    0,
    finiteNumber(rawOptions.subGroupTopPadding, 20),
  );
  const subGroupTitleHeight = Math.max(
    0,
    finiteNumber(rawOptions.subGroupTitleHeight, 28),
  );
  const subGroupTitleVerticalPadding = Math.max(
    0,
    finiteNumber(rawOptions.subGroupTitleVerticalPadding, 8),
  );
  const bottomSafeGap = Math.max(0, finiteNumber(rawOptions.bottomSafeGap, 12));
  const horizontalGap = Math.max(12, finiteNumber(rawOptions.horizontalGap, 12));
  const verticalGap = Math.max(8, finiteNumber(rawOptions.verticalGap, 8));
  const defaultChildWidth = positiveNumber(rawOptions.defaultChildWidth, 120);
  const defaultChildHeight = positiveNumber(rawOptions.defaultChildHeight, 80);

  for (const domain of updated.filter(node => node.type === 'titleGroup')) {
    const domainKey = domainKeyOf(domain);
    if (!domainKey) continue;
    const domainX = finiteNumber(domain.position?.x, 0);
    const domainY = finiteNumber(domain.position?.y, 0);
    const innerLeft = domainX + domainHorizontalPadding;
    const subGroups = updated.filter(node =>
      node.type === 'subGroup'
      && domainKeyOf(node) === domainKey
      && (node.data as Record<string, unknown> | undefined)?.hidden !== true);
    if (rawOptions.compareSubGroups) {
      subGroups.sort(rawOptions.compareSubGroups);
    }
    const desiredColumns = subGroups.length >= 3 ? 2 : 3;

    for (const subGroup of subGroups) {
      const children = childIdsOf(subGroup)
        .map(childId => nodeById.get(childId))
        .filter((child): child is ReactFlowNode => Boolean(child));
      if (children.length === 0) continue;
      const subGroupX = finiteNumber(
        subGroup.position?.x,
        innerLeft - subGroupHorizontalPadding,
      );
      const subGroupY = finiteNumber(
        subGroup.position?.y,
        domainY + subGroupTitleHeight + subGroupTitleVerticalPadding,
      );
      const left = subGroupX + subGroupHorizontalPadding;
      const startY = subGroupY
        + subGroupTitleHeight
        + subGroupTitleVerticalPadding
        + subGroupTopPadding;
      const columns = Math.max(1, Math.min(desiredColumns, children.length));
      let predictedRowWidth = 0;
      for (let index = 0; index < children.length; index += columns) {
        const row = children.slice(index, index + columns);
        const width = row.reduce(
          (sum, child) => sum + positiveNumber(
            child.measured?.width ?? child.style?.width ?? child.width,
            defaultChildWidth,
          ),
          0,
        ) + Math.max(0, row.length - 1) * horizontalGap;
        predictedRowWidth = Math.max(predictedRowWidth, width);
      }

      const result = rawOptions.layoutGrid(
        children,
        left,
        left + predictedRowWidth,
        startY,
        columns,
      );
      for (const child of children) {
        child.position = {
          x: Math.round(finiteNumber(child.position?.x, left)),
          y: Math.round(finiteNumber(child.position?.y, startY)),
        };
      }
      const rowHeights = (Array.isArray(result?.rows) ? result.rows : [])
        .filter(row => Array.isArray(row) && row.length > 0)
        .map(row => Math.max(...row.map(child => positiveNumber(
          child.measured?.height ?? child.style?.height ?? child.height,
          defaultChildHeight,
        ))));
      const minimumX = Math.min(...children.map(child =>
        finiteNumber(child.position?.x, left)));
      const maximumX = Math.max(...children.map(child =>
        finiteNumber(child.position?.x, left)
          + positiveNumber(
            child.measured?.width ?? child.style?.width ?? child.width,
            defaultChildWidth,
          )));
      const reportedRowWidth = Array.isArray(result?.rowWidths)
        && result.rowWidths.length > 0
        ? Math.max(...result.rowWidths.filter(width => Number.isFinite(width)))
        : 0;
      const contentWidth = Math.max(
        Math.max(0, reportedRowWidth),
        Math.max(0, maximumX - minimumX),
      );
      const contentHeight = rowHeights.reduce((sum, height) => sum + height, 0)
        + Math.max(0, rowHeights.length - 1) * verticalGap;
      subGroup.position = {
        x: Math.round(minimumX - subGroupHorizontalPadding),
        y: Math.round(subGroupY),
      };
      writeSize(
        subGroup,
        Math.round(contentWidth + subGroupHorizontalPadding * 2),
        Math.round(
          contentHeight
          + subGroupTitleHeight
          + subGroupTitleVerticalPadding
          + subGroupTopPadding
          + bottomSafeGap,
        ),
      );
    }
  }

  return updated;
};
