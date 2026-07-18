import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

export interface DomainVerticalDagreReconstructionConfig {
  paddingLeft: number;
  paddingTop: number;
  domainPaddingHorizontal: number;
  domainPaddingVertical: number;
  domainGap: number;
  subGroupGap: number;
  domainTitleHeight: number;
  domainTitlePaddingVertical: number;
  domainTitleSafeGap: number;
  domainOrder?: readonly string[];
}

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
    style: { ...(node.style ?? {}) },
    measured: node.measured ? { ...node.measured } : undefined,
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

export interface DomainVerticalDagrePreprocessOptions {
  direction: unknown;
  horizontalGap: number;
  verticalGap: number;
  reflowSubGroup: (
    subGroup: ReactFlowNode,
    children: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
    edges: Edge[],
    direction: 'TB' | 'LR',
  ) => ReactFlowNode[];
  resolveStrict: (
    nodes: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
  ) => ReactFlowNode[];
  recomputeContainers: (nodes: ReactFlowNode[]) => ReactFlowNode[];
}

/**
 * Runs edge-aware Dagre projection for each subgroup, merges only known node
 * IDs, then applies the strict overlap safety net and container recovery.
 */
export const preprocessDomainVerticalDagreSubGroups = (
  nodes: readonly ReactFlowNode[],
  edges: Edge[],
  rawOptions: DomainVerticalDagrePreprocessOptions,
): ReactFlowNode[] => {
  let updated = cloneNodes(nodes);
  const horizontalGap = Math.max(12, finiteNumber(rawOptions.horizontalGap, 12));
  const verticalGap = Math.max(8, finiteNumber(rawOptions.verticalGap, 8));
  const direction = String(rawOptions.direction ?? 'TB').toUpperCase() === 'LR'
    ? 'LR'
    : 'TB';

  for (const subGroup of updated.filter(node => node.type === 'subGroup')) {
    const nodeById = new Map(updated.map(node => [node.id, node] as const));
    const children = childIdsOf(subGroup)
      .map(childId => nodeById.get(childId))
      .filter((child): child is ReactFlowNode =>
        Boolean(child)
        && (child?.data as Record<string, unknown> | undefined)?.hidden !== true);
    if (children.length === 0) continue;
    const projected = rawOptions.reflowSubGroup(
      subGroup,
      children,
      horizontalGap,
      verticalGap,
      edges,
      direction,
    );
    if (!Array.isArray(projected)) continue;
    const projectedById = new Map(
      projected
        .filter(node => node && typeof node.id === 'string')
        .map(node => [node.id, node] as const),
    );
    updated = updated.map(node => {
      const replacement = projectedById.get(node.id);
      if (!replacement) return node;
      return {
        ...replacement,
        position: {
          x: finiteNumber(replacement.position?.x, node.position.x),
          y: finiteNumber(replacement.position?.y, node.position.y),
        },
      };
    });
  }

  updated = rawOptions.recomputeContainers(updated);
  updated = rawOptions.resolveStrict(updated, horizontalGap, verticalGap);
  return rawOptions.recomputeContainers(updated);
};

const nodeWidth = (node: ReactFlowNode, fallback: number): number => {
  const data = node.data as Record<string, unknown> | undefined;
  const dagreSize = data?.__dagreSized as Record<string, unknown> | undefined;
  return positiveNumber(
    dagreSize?.w ?? node.measured?.width ?? node.style?.width ?? node.width,
    fallback,
  );
};

const nodeHeight = (node: ReactFlowNode, fallback: number): number => {
  const data = node.data as Record<string, unknown> | undefined;
  const dagreSize = data?.__dagreSized as Record<string, unknown> | undefined;
  return positiveNumber(
    dagreSize?.h ?? node.measured?.height ?? node.style?.height ?? node.height,
    fallback,
  );
};

const createDomainOrderIndex = (
  domainOrder: readonly string[] | undefined,
): Map<string, number> => {
  const index = new Map<string, number>();
  if (!Array.isArray(domainOrder)) return index;
  for (const value of domainOrder) {
    if (typeof value !== 'string') continue;
    const key = value.trim();
    if (key && !index.has(key)) index.set(key, index.size);
  }
  return index;
};

const sortedDomainContainers = (
  nodes: ReactFlowNode[],
  domainOrder: readonly string[] | undefined,
): ReactFlowNode[] => {
  const orderIndex = createDomainOrderIndex(domainOrder);
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index] as const));
  return nodes
    .filter(node => node.type === 'titleGroup')
    .sort((left, right) => {
      const leftOrder = orderIndex.get(domainKeyOf(left));
      const rightOrder = orderIndex.get(domainKeyOf(right));
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.POSITIVE_INFINITY)
          - (rightOrder ?? Number.POSITIVE_INFINITY);
      }
      return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
    });
};

const sanitizeConfig = (
  config: DomainVerticalDagreReconstructionConfig,
): DomainVerticalDagreReconstructionConfig => ({
  paddingLeft: finiteNumber(config.paddingLeft, 40),
  paddingTop: finiteNumber(config.paddingTop, 80),
  domainPaddingHorizontal: nonNegativeNumber(config.domainPaddingHorizontal, 24),
  domainPaddingVertical: nonNegativeNumber(config.domainPaddingVertical, 16),
  domainGap: nonNegativeNumber(config.domainGap, 48),
  subGroupGap: nonNegativeNumber(config.subGroupGap, 24),
  domainTitleHeight: nonNegativeNumber(config.domainTitleHeight, 48),
  domainTitlePaddingVertical: nonNegativeNumber(
    config.domainTitlePaddingVertical,
    12,
  ),
  domainTitleSafeGap: nonNegativeNumber(config.domainTitleSafeGap, 16),
  domainOrder: config.domainOrder,
});

/**
 * Rebuilds top-level domain and subgroup positions from a clean vertical cursor.
 *
 * Nodes are cloned. Subgroup children are intentionally not synchronized here;
 * the caller applies the canonical Dagre relative-position synchronization after
 * subgroup containers have been placed.
 */
export const reconstructDomainVerticalDagreLayout = (
  nodes: readonly ReactFlowNode[],
  rawConfig: DomainVerticalDagreReconstructionConfig,
): ReactFlowNode[] => {
  const config = sanitizeConfig(rawConfig);
  const updated = cloneNodes(nodes);
  const domainContainers = sortedDomainContainers(updated, config.domainOrder);
  let cursorY = config.paddingTop;

  for (const domain of domainContainers) {
    const domainKey = domainKeyOf(domain);
    domain.position = {
      x: Math.round(config.paddingLeft),
      y: Math.round(cursorY),
    };

    const subGroups = updated
      .filter(node =>
        node.type === 'subGroup'
        && domainKeyOf(node) === domainKey
        && !(node.data as Record<string, unknown>)?.hidden)
      .sort((left, right) =>
        finiteNumber(left.position?.x, 0) - finiteNumber(right.position?.x, 0));
    const subgroupChildren = new Set(subGroups.flatMap(childIdsOf));
    const innerTop = (
      cursorY
      + config.domainTitleHeight
      + config.domainTitlePaddingVertical
      + config.domainTitleSafeGap
    );
    const subgroupWidths = subGroups.map(node => nodeWidth(node, 200));
    const totalSubgroupWidth = subgroupWidths.reduce((sum, width) => sum + width, 0);
    const totalGaps = Math.max(0, subGroups.length - 1) * config.subGroupGap;
    const domainWidth = nodeWidth(domain, 800);
    const availableWidth = Math.max(
      1,
      domainWidth - config.domainPaddingHorizontal * 2,
    );
    let subgroupCursorX = (
      config.paddingLeft
      + config.domainPaddingHorizontal
      + Math.max(0, availableWidth - totalSubgroupWidth - totalGaps) / 2
    );
    let maxSubgroupHeight = 0;

    subGroups.forEach((subGroup, index) => {
      const width = subgroupWidths[index];
      const height = nodeHeight(subGroup, 100);
      subGroup.position = {
        x: Math.round(subgroupCursorX),
        y: Math.round(innerTop),
      };
      subGroup.style = { ...(subGroup.style ?? {}), width, height };
      subGroup.measured = { width, height };
      subGroup.width = width;
      subGroup.height = height;
      maxSubgroupHeight = Math.max(maxSubgroupHeight, height);
      subgroupCursorX += width + config.subGroupGap;
    });

    const orphanStartY = innerTop + maxSubgroupHeight + config.subGroupGap;
    let orphanBottom = orphanStartY;
    const orphans = updated.filter(node => {
      if (domainKeyOf(node) !== domainKey) return false;
      if (['titleGroup', 'subGroup', 'group'].includes(String(node.type ?? ''))) {
        return false;
      }
      if ((node.data as Record<string, unknown> | undefined)?.hidden) return false;
      return !subgroupChildren.has(String(node.id));
    });

    let orphanCursorY = orphanStartY;
    for (const orphan of orphans) {
      const height = nodeHeight(orphan, 60);
      orphan.position = {
        x: Math.round(config.paddingLeft + config.domainPaddingHorizontal),
        y: Math.round(orphanCursorY),
      };
      orphanCursorY += height + config.subGroupGap;
      orphanBottom = orphanCursorY;
    }

    const contentBottom = Math.max(
      innerTop + maxSubgroupHeight,
      orphanBottom,
    );
    const domainHeight = Math.max(
      config.domainTitleHeight
        + config.domainTitlePaddingVertical
        + config.domainTitleSafeGap
        + config.domainPaddingVertical,
      contentBottom - cursorY + config.domainPaddingVertical,
    );
    const measuredWidth = nodeWidth(domain, 300);
    domain.style = { ...(domain.style ?? {}), height: domainHeight };
    domain.measured = { width: measuredWidth, height: domainHeight };
    domain.width = measuredWidth;
    domain.height = domainHeight;
    cursorY += domainHeight + config.domainGap;
  }

  return updated;
};

/**
 * Centers already-sized subgroups after domain width projection and moves each
 * subgroup's children by the same horizontal delta.
 */
export const centerProjectedDagreSubGroups = (
  nodes: readonly ReactFlowNode[],
  rawConfig: Pick<
    DomainVerticalDagreReconstructionConfig,
    'domainPaddingHorizontal' | 'subGroupGap'
  >,
): ReactFlowNode[] => {
  const domainPaddingHorizontal = nonNegativeNumber(
    rawConfig.domainPaddingHorizontal,
    24,
  );
  const subGroupGap = nonNegativeNumber(rawConfig.subGroupGap, 24);
  const updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));

  for (const domain of updated.filter(node => node.type === 'titleGroup')) {
    const domainKey = domainKeyOf(domain);
    const subGroups = updated
      .filter(node =>
        node.type === 'subGroup'
        && domainKeyOf(node) === domainKey
        && !(node.data as Record<string, unknown>)?.hidden)
      .sort((left, right) =>
        finiteNumber(left.position?.x, 0) - finiteNumber(right.position?.x, 0));
    if (subGroups.length === 0) continue;

    const domainX = finiteNumber(domain.position?.x, 0);
    const domainWidth = nodeWidth(domain, 800);
    const subgroupWidths = subGroups.map(node => nodeWidth(node, 200));
    const totalWidth = subgroupWidths.reduce((sum, width) => sum + width, 0)
      + Math.max(0, subGroups.length - 1) * subGroupGap;
    const availableWidth = Math.max(
      1,
      domainWidth - domainPaddingHorizontal * 2,
    );
    let cursorX = (
      domainX
      + domainPaddingHorizontal
      + Math.max(0, availableWidth - totalWidth) / 2
    );

    subGroups.forEach((subGroup, index) => {
      const oldX = finiteNumber(subGroup.position?.x, 0);
      const newX = Math.round(cursorX);
      const deltaX = newX - oldX;
      subGroup.position = {
        x: newX,
        y: finiteNumber(subGroup.position?.y, 0),
      };
      for (const childId of childIdsOf(subGroup)) {
        const child = nodeById.get(childId);
        if (!child) continue;
        child.position = {
          x: Math.round(finiteNumber(child.position?.x, 0) + deltaX),
          y: finiteNumber(child.position?.y, 0),
        };
      }
      cursorX += subgroupWidths[index] + subGroupGap;
    });
  }

  return updated;
};
