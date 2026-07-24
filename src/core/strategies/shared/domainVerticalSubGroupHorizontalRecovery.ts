import type { Node as ReactFlowNode } from '@xyflow/react';

import type { DomainVerticalPrimitiveLayout } from './domainVerticalNodeLayoutPrimitives';
import {
  translateSubGroupRigidlyInPlace,
  type HorizontalSubGroupSeparationOptions,
  type HorizontalSubGroupSeparationResult,
} from './domainVerticalRigidTranslation';

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

export interface IterativeSubGroupSeparationOptions {
  layout: DomainVerticalPrimitiveLayout;
  domainHorizontalPadding: number;
  subGroupHorizontalPadding: number;
  horizontalGap: number;
  iterations: number;
  safeEdge: number;
  defaultSubGroupWidth: number;
  defaultContainerHeight: number;
  ensureMeasured: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  finalizeSubGroupWidths: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  recomputeSubGroups: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  separate: (
    nodes: ReactFlowNode[],
    options: HorizontalSubGroupSeparationOptions,
  ) => HorizontalSubGroupSeparationResult;
}

/**
 * Iteratively separates visible subgroups one domain at a time and expands the
 * current domain container from the final member right edge. Container
 * references are reacquired after every callback that may rebuild the graph.
 */
export const separateSubGroupsAndExpandDomainsIteratively = (
  nodes: readonly ReactFlowNode[],
  rawOptions: IterativeSubGroupSeparationOptions,
): ReactFlowNode[] => {
  let updated = cloneNodes(nodes);
  const domainHorizontalPadding = nonNegativeNumber(
    rawOptions.domainHorizontalPadding,
    0,
  );
  const subGroupHorizontalPadding = nonNegativeNumber(
    rawOptions.subGroupHorizontalPadding,
    0,
  );
  const horizontalGap = Math.max(
    12,
    nonNegativeNumber(rawOptions.horizontalGap, 12),
  );
  const iterations = Math.max(
    1,
    Math.floor(positiveNumber(rawOptions.iterations, 5)),
  );
  const safeEdge = nonNegativeNumber(rawOptions.safeEdge, horizontalGap);
  const defaultSubGroupWidth = positiveNumber(
    rawOptions.defaultSubGroupWidth,
    240,
  );
  const defaultContainerHeight = positiveNumber(
    rawOptions.defaultContainerHeight,
    80,
  );
  const domainKeys = [...new Set(updated
    .filter(node => node.type === 'titleGroup')
    .map(domainKeyOf)
    .filter(Boolean))];

  for (const domainKey of domainKeys) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      updated = rawOptions.ensureMeasured(updated);
      updated = rawOptions.finalizeSubGroupWidths(updated);
      updated = rawOptions.recomputeSubGroups(updated);
      const separated = rawOptions.separate(updated, {
        domainHorizontalPadding,
        firstSubGroupOffset: -subGroupHorizontalPadding + safeEdge,
        gap: (
          rawOptions.layout === 'grid'
            ? Math.max(12, Math.floor(horizontalGap * 0.4))
            : horizontalGap
        ) + safeEdge,
        fallbackSubGroupWidth: defaultSubGroupWidth,
        domainKeys: [domainKey],
      });
      updated = separated.nodes;
      if (!separated.movedDomainKeys.includes(domainKey)) break;
      updated = rawOptions.recomputeSubGroups(updated);
    }

    const container = updated.find(node =>
      node.type === 'titleGroup' && domainKeyOf(node) === domainKey);
    if (!container) continue;
    const containerLeft = finiteNumber(container.position?.x, 0);
    let maximumRight = Number.NEGATIVE_INFINITY;
    for (const member of updated) {
      if (
        member.type === 'titleGroup'
        || domainKeyOf(member) !== domainKey
      ) {
        continue;
      }
      maximumRight = Math.max(
        maximumRight,
        finiteNumber(member.position?.x, containerLeft)
          + readWidth(member, defaultSubGroupWidth),
      );
    }
    if (!Number.isFinite(maximumRight)) continue;
    writeSize(
      container,
      Math.max(0, maximumRight - containerLeft)
        + domainHorizontalPadding * 2
        + Math.max(16, Math.floor(horizontalGap * 0.65)),
      readHeight(container, defaultContainerHeight),
    );
  }

  return updated;
};

export interface SubGroupHorizontalInsetOptions {
  layout: DomainVerticalPrimitiveLayout;
  domainHorizontalPadding: number;
  subGroupHorizontalPadding: number;
  horizontalGap: number;
  defaultSubGroupWidth: number;
  orderOf: (node: ReactFlowNode) => number;
}

/**
 * Clamps subgroup containers to the owning domain's horizontal inset while
 * rigidly translating declared children with the current graph index.
 */
export const clampSubGroupsToDomainHorizontalInsets = (
  nodes: readonly ReactFlowNode[],
  rawOptions: SubGroupHorizontalInsetOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  const domainHorizontalPadding = nonNegativeNumber(
    rawOptions.domainHorizontalPadding,
    0,
  );
  const subGroupHorizontalPadding = nonNegativeNumber(
    rawOptions.subGroupHorizontalPadding,
    0,
  );
  const horizontalGap = nonNegativeNumber(rawOptions.horizontalGap, 0);
  const defaultSubGroupWidth = positiveNumber(
    rawOptions.defaultSubGroupWidth,
    240,
  );
  const leftBlank = Math.max(
    subGroupHorizontalPadding,
    Math.floor(
      rawOptions.layout === 'grid'
        ? horizontalGap * 0.2
        : horizontalGap * 0.35,
    ),
  );

  for (const container of updated.filter(node => node.type === 'titleGroup')) {
    const domainKey = domainKeyOf(container);
    if (!domainKey) continue;
    const containerLeft = finiteNumber(container.position?.x, 0);
    const innerLeft = containerLeft + domainHorizontalPadding;
    const innerRight = containerLeft
      + readWidth(container, 1)
      - domainHorizontalPadding;
    const subGroups = updated
      .filter(node =>
        node.type === 'subGroup' && domainKeyOf(node) === domainKey)
      .sort((left, right) =>
        finiteNumber(rawOptions.orderOf(left), Number.MAX_SAFE_INTEGER)
        - finiteNumber(rawOptions.orderOf(right), Number.MAX_SAFE_INTEGER));

    for (const subGroup of subGroups) {
      const currentLeft = finiteNumber(
        subGroup.position?.x,
        innerLeft - subGroupHorizontalPadding,
      );
      const subGroupWidth = readWidth(subGroup, defaultSubGroupWidth);
      const minimumLeft = innerLeft + leftBlank - subGroupHorizontalPadding;
      const maximumLeft = Math.max(
        innerLeft - subGroupHorizontalPadding,
        innerRight - subGroupHorizontalPadding - subGroupWidth,
      );
      const targetLeft = Math.min(
        Math.max(currentLeft, minimumLeft),
        maximumLeft,
      );
      translateSubGroupRigidlyInPlace(
        nodeById,
        subGroup,
        targetLeft - currentLeft,
        0,
      );
    }
  }

  return updated;
};
