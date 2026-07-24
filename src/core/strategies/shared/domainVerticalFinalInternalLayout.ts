import type { Node as ReactFlowNode } from '@xyflow/react';

import type { DomainVerticalPrimitiveLayout } from './domainVerticalNodeLayoutPrimitives';
import { translateSubGroupRigidlyInPlace } from './domainVerticalRigidTranslation';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegativeNumber = (value: unknown, fallback: number): number =>
  Math.max(0, finiteNumber(value, fallback));

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

const readWidth = (node: ReactFlowNode, fallback: number): number =>
  positiveNumber(
    node.measured?.width ?? node.style?.width ?? node.width,
    fallback,
  );

const readHeight = (node: ReactFlowNode, fallback: number): number =>
  positiveNumber(
    node.measured?.height ?? node.style?.height ?? node.height,
    fallback,
  );

const writeSize = (
  node: ReactFlowNode,
  width: number,
  height: number,
): void => {
  const safeWidth = nonNegativeNumber(width, 0);
  const safeHeight = nonNegativeNumber(height, 0);
  node.style = { ...(node.style ?? {}), width: safeWidth, height: safeHeight };
  node.measured = { width: safeWidth, height: safeHeight };
  node.width = safeWidth;
  node.height = safeHeight;
};

const childIdsOf = (subGroup: ReactFlowNode): string[] => {
  const children = (
    subGroup.data as Record<string, unknown> | undefined
  )?.children;
  if (!Array.isArray(children)) return [];
  return [...new Set(children.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  ))];
};

export interface FinalInternalDomainLayoutOptions {
  layout: DomainVerticalPrimitiveLayout;
  containerTypes: ReadonlySet<string>;
  anchorLeft: number;
  domainHorizontalPadding: number;
  domainHeaderHeight: number;
  domainBottomPadding: number;
  subGroupHorizontalPadding: number;
  subGroupHeaderHeight: number;
  subGroupBottomPadding: number;
  nodeHorizontalGap: number;
  nodeVerticalGap: number;
  subGroupGap: number;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
  orderOf: (node: ReactFlowNode) => number;
  layoutHorizontal: (
    children: ReactFlowNode[],
    left: number,
    right: number,
    top: number,
  ) => void;
  layoutVertical: (
    children: ReactFlowNode[],
    left: number,
    right: number,
    top: number,
  ) => void;
  layoutGrid: (
    children: ReactFlowNode[],
    left: number,
    right: number,
    top: number,
    columns: number,
  ) => void;
  resolveChildOverlaps: (
    children: ReactFlowNode[],
    layout: DomainVerticalPrimitiveLayout,
  ) => void;
}

/**
 * Reflows declared subgroup children against final domain widths, recomputes
 * subgroup bounds, rigidly centers a single subgroup, and projects the owning
 * domain's final width and height. A fresh node index is used so callbacks and
 * rigid translations always mutate the returned graph, not stale references.
 */
export const finalizeDomainInternalLayout = (
  nodes: readonly ReactFlowNode[],
  rawOptions: FinalInternalDomainLayoutOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  const anchorLeft = finiteNumber(rawOptions.anchorLeft, 0);
  const domainHorizontalPadding = nonNegativeNumber(
    rawOptions.domainHorizontalPadding,
    0,
  );
  const domainHeaderHeight = nonNegativeNumber(rawOptions.domainHeaderHeight, 0);
  const domainBottomPadding = nonNegativeNumber(
    rawOptions.domainBottomPadding,
    0,
  );
  const subGroupHorizontalPadding = nonNegativeNumber(
    rawOptions.subGroupHorizontalPadding,
    0,
  );
  const subGroupHeaderHeight = nonNegativeNumber(
    rawOptions.subGroupHeaderHeight,
    0,
  );
  const subGroupBottomPadding = nonNegativeNumber(
    rawOptions.subGroupBottomPadding,
    0,
  );
  const nodeHorizontalGap = nonNegativeNumber(rawOptions.nodeHorizontalGap, 0);
  const nodeVerticalGap = nonNegativeNumber(rawOptions.nodeVerticalGap, 0);
  const subGroupGap = Math.max(
    12,
    nonNegativeNumber(rawOptions.subGroupGap, 12),
  );
  const defaultNodeWidth = positiveNumber(rawOptions.defaultNodeWidth, 240);
  const defaultNodeHeight = positiveNumber(rawOptions.defaultNodeHeight, 80);
  for (const node of updated) {
    const width = readWidth(node, defaultNodeWidth);
    const height = readHeight(node, defaultNodeHeight);
    if (node.measured) node.measured = { width, height };
    if (node.style) {
      node.style = { ...node.style, width, height };
    }
    node.width = width;
    node.height = height;
  }
  const containers = updated.filter(node =>
    rawOptions.containerTypes.has(String(node.type ?? '')));

  for (const container of containers) {
    const domainKey = domainKeyOf(container);
    if (!domainKey) continue;
    const containerLeft = finiteNumber(container.position?.x, anchorLeft);
    const containerTop = finiteNumber(container.position?.y, 0);
    const containerWidth = readWidth(container, 0);
    const innerLeft = containerLeft + domainHorizontalPadding;
    const innerRight = containerLeft
      + containerWidth
      - domainHorizontalPadding;
    const innerTop = containerTop + domainHeaderHeight;
    const subGroups = updated
      .filter(node =>
        node.type === 'subGroup' && domainKeyOf(node) === domainKey)
      .sort((left, right) =>
        finiteNumber(rawOptions.orderOf(left), Number.MAX_SAFE_INTEGER)
        - finiteNumber(rawOptions.orderOf(right), Number.MAX_SAFE_INTEGER));

    for (const subGroup of subGroups) {
      const children = childIdsOf(subGroup)
        .map(id => nodeById.get(id))
        .filter((node): node is ReactFlowNode => !!node);
      if (!children.length) continue;
      const subGroupLeft = finiteNumber(
        subGroup.position?.x,
        innerLeft - subGroupHorizontalPadding,
      );
      const subGroupTop = finiteNumber(
        subGroup.position?.y,
        innerTop - subGroupHeaderHeight,
      );
      const childLeft = subGroupLeft + subGroupHorizontalPadding;
      const childTop = subGroupTop + subGroupHeaderHeight;
      const childRight = childLeft
        + children.reduce(
          (sum, child) => sum + readWidth(child, defaultNodeWidth),
          0,
        )
        + Math.max(0, children.length - 1) * nodeHorizontalGap;

      if (rawOptions.layout === 'grid') {
        rawOptions.layoutGrid(
          children,
          childLeft,
          childRight,
          childTop,
          subGroups.length >= 3 ? 2 : 3,
        );
        rawOptions.resolveChildOverlaps(children, rawOptions.layout);
      } else if (rawOptions.layout === 'vertical') {
        rawOptions.layoutVertical(children, childLeft, childRight, childTop);
        rawOptions.resolveChildOverlaps(children, rawOptions.layout);
      } else if (
        rawOptions.layout === 'horizontal'
        || rawOptions.layout === 'centered'
      ) {
        rawOptions.layoutHorizontal(children, childLeft, childRight, childTop);
        rawOptions.resolveChildOverlaps(children, rawOptions.layout);
      }

      if (rawOptions.layout === 'dagre') continue;
      let minimumLeft = Number.POSITIVE_INFINITY;
      let minimumTop = Number.POSITIVE_INFINITY;
      let maximumRight = Number.NEGATIVE_INFINITY;
      for (const child of children) {
        const childX = finiteNumber(child.position?.x, childLeft);
        const childY = finiteNumber(child.position?.y, childTop);
        minimumLeft = Math.min(minimumLeft, childX);
        minimumTop = Math.min(minimumTop, childY);
        maximumRight = Math.max(
          maximumRight,
          childX + readWidth(child, defaultNodeWidth),
        );
      }
      const sortedChildren = [...children].sort((left, right) =>
        finiteNumber(left.position?.y, 0) - finiteNumber(right.position?.y, 0));
      const averageHeight = Math.floor(
        children.reduce(
          (sum, child) => sum + readHeight(child, defaultNodeHeight),
          0,
        ) / children.length,
      );
      const rowThreshold = Math.max(
        8,
        Math.floor(Math.min(
          nodeVerticalGap,
          Math.max(8, Math.floor(averageHeight * 0.4)),
        )),
      );
      const rows: ReactFlowNode[][] = [];
      for (const child of sortedChildren) {
        const childY = finiteNumber(child.position?.y, 0);
        const lastRow = rows.at(-1);
        if (
          !lastRow
          || Math.abs(
            childY - finiteNumber(lastRow[0]?.position?.y, 0),
          ) > rowThreshold
        ) {
          rows.push([child]);
        } else {
          lastRow.push(child);
        }
      }
      const rowHeights = rows.map(row =>
        Math.max(...row.map(child => readHeight(child, defaultNodeHeight))));
      const rowWidths = rows.map(row =>
        row.reduce(
          (sum, child) => sum + readWidth(child, defaultNodeWidth),
          0,
        ) + Math.max(0, row.length - 1) * nodeHorizontalGap);
      const contentHeight = rowHeights.reduce((sum, height) => sum + height, 0)
        + Math.max(0, rowHeights.length - 1) * nodeVerticalGap;
      const contentWidth = Math.max(
        rowWidths.length ? Math.max(...rowWidths) : 0,
        Math.max(0, maximumRight - minimumLeft),
      );
      subGroup.position = {
        x: minimumLeft - subGroupHorizontalPadding,
        y: minimumTop - subGroupHeaderHeight,
      };
      writeSize(
        subGroup,
        Math.round(contentWidth + subGroupHorizontalPadding * 2),
        Math.round(
          contentHeight + subGroupHeaderHeight + subGroupBottomPadding,
        ),
      );
    }

    if (subGroups.length === 1) {
      const subGroup = subGroups[0];
      const subGroupWidth = readWidth(subGroup, 0);
      const availableWidth = Math.max(0, innerRight - innerLeft);
      if (subGroupWidth > 0 && availableWidth > subGroupWidth) {
        const targetLeft = Math.round(
          innerLeft + (availableWidth - subGroupWidth) / 2,
        ) - subGroupHorizontalPadding;
        translateSubGroupRigidlyInPlace(
          nodeById,
          subGroup,
          targetLeft - finiteNumber(
            subGroup.position?.x,
            innerLeft - subGroupHorizontalPadding,
          ),
          0,
        );
      }
      writeSize(
        container,
        Math.max(
          readWidth(container, 0),
          subGroupWidth
            + domainHorizontalPadding * 2
            + Math.max(12, Math.floor(subGroupGap * 0.6)),
        ),
        readHeight(container, domainHeaderHeight),
      );
    }

    const deterministicSubGroupWidth = subGroups.length
      ? subGroups.reduce(
        (sum, subGroup) => sum + readWidth(subGroup, 0),
        0,
      )
        + Math.max(0, subGroups.length - 1) * subGroupGap
        + domainHorizontalPadding * 2
        + Math.max(12, Math.floor(subGroupGap * 0.6))
      : 0;
    const currentContainerWidth = Math.max(
      readWidth(container, 0),
      Math.ceil(deterministicSubGroupWidth),
    );
    writeSize(
      container,
      currentContainerWidth,
      readHeight(container, domainHeaderHeight),
    );

    let maximumRight = Number.NEGATIVE_INFINITY;
    let maximumBottom = Number.NEGATIVE_INFINITY;
    for (const member of updated) {
      if (
        rawOptions.containerTypes.has(String(member.type ?? ''))
        || domainKeyOf(member) !== domainKey
      ) {
        continue;
      }
      maximumRight = Math.max(
        maximumRight,
        finiteNumber(member.position?.x, anchorLeft + domainHorizontalPadding)
          + readWidth(member, defaultNodeWidth),
      );
      maximumBottom = Math.max(
        maximumBottom,
        finiteNumber(member.position?.y, innerTop)
          + readHeight(member, defaultNodeHeight),
      );
    }
    const safeEdgeWidth = Math.max(
      4,
      Math.floor(domainHorizontalPadding * 0.25),
    );
    const projectedWidth = Number.isFinite(maximumRight)
      ? Math.max(
        0,
        maximumRight - (containerLeft + domainHorizontalPadding),
      ) + domainHorizontalPadding + safeEdgeWidth
      : 0;
    const projectedHeight = domainHeaderHeight
      + (Number.isFinite(maximumBottom)
        ? Math.max(0, maximumBottom - innerTop)
        : 0)
      + domainBottomPadding;
    writeSize(
      container,
      Math.max(readWidth(container, 0), projectedWidth),
      projectedHeight,
    );
  }

  return updated;
};
