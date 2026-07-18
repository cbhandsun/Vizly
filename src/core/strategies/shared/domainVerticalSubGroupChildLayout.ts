import type { Node as ReactFlowNode } from '@xyflow/react';

import {
  placeNodeRowWithoutWrap,
  type DomainVerticalNodeMetrics,
  type DomainVerticalPrimitiveLayout,
} from './domainVerticalNodeLayoutPrimitives';

export type SubGroupChildProjector = (
  subGroup: ReactFlowNode,
  children: ReactFlowNode[],
  horizontalGap: number,
  verticalGap: number,
) => ReactFlowNode[];

export interface LayoutSubGroupChildrenOptions {
  layout: DomainVerticalPrimitiveLayout;
  horizontalPadding: number;
  topPadding: number;
  horizontalGap: number;
  verticalGap: number;
  metrics: DomainVerticalNodeMetrics;
  projectVertical: SubGroupChildProjector;
  projectGrid: SubGroupChildProjector;
}

export interface ResolveSubGroupChildOverlapsOptions {
  layout: DomainVerticalPrimitiveLayout;
  horizontalGap: number;
  verticalGap: number;
  fallbackChildWidth: number;
  resolveStrict: (
    nodes: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
  ) => ReactFlowNode[];
  recomputeContainers: (nodes: ReactFlowNode[]) => ReactFlowNode[];
}

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegativeNumber = (value: unknown, fallback: number): number =>
  Math.max(0, finiteNumber(value, fallback));

export const collectVisibleSubGroupChildren = (
  subGroup: ReactFlowNode,
  nodesById: ReadonlyMap<string, ReactFlowNode>,
): ReactFlowNode[] => {
  const declaredChildren = subGroup?.data?.children;
  if (!Array.isArray(declaredChildren)) return [];

  const seenIds = new Set<string>();
  return declaredChildren
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .filter(id => {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .map(id => nodesById.get(id))
    .filter((node): node is ReactFlowNode => (
      !!node && node.data?.hidden !== true
    ));
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

const positiveNumber = (value: unknown, fallback: number): number => {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

/**
 * Resolves phase-one child overlaps according to the selected node layout.
 * Dagre remains untouched; horizontal modes monotonically push visible
 * declared children rightward; grid/vertical delegate to strict resolution.
 */
export const resolveSubGroupChildOverlapsByMode = (
  nodes: readonly ReactFlowNode[],
  rawOptions: ResolveSubGroupChildOverlapsOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  if (rawOptions.layout === 'dagre') return updated;
  const horizontalGap = Math.max(0, finiteNumber(rawOptions.horizontalGap, 12));
  const verticalGap = Math.max(0, finiteNumber(rawOptions.verticalGap, 8));

  if (rawOptions.layout === 'horizontal' || rawOptions.layout === 'centered') {
    const nodeById = new Map(updated.map(node => [node.id, node] as const));
    const fallbackChildWidth = positiveNumber(rawOptions.fallbackChildWidth, 120);
    for (const subGroup of updated.filter(node => node.type === 'subGroup')) {
      const children = collectVisibleSubGroupChildren(subGroup, nodeById)
        .sort((left, right) =>
          finiteNumber(left.position?.x, 0) - finiteNumber(right.position?.x, 0));
      for (let index = 1; index < children.length; index += 1) {
        const previous = children[index - 1];
        const current = children[index];
        const desiredX = finiteNumber(previous.position?.x, 0)
          + positiveNumber(
            previous.measured?.width
              ?? previous.style?.width
              ?? previous.width,
            fallbackChildWidth,
          )
          + horizontalGap;
        const currentX = finiteNumber(current.position?.x, 0);
        if (currentX < desiredX) {
          current.position = {
            x: Math.round(desiredX),
            y: Math.round(finiteNumber(current.position?.y, 0)),
          };
        }
      }
    }
    return rawOptions.recomputeContainers(updated);
  }

  return rawOptions.recomputeContainers(
    rawOptions.resolveStrict(updated, horizontalGap, verticalGap),
  );
};

const copyProjectedPositions = (
  children: ReactFlowNode[],
  projected: ReactFlowNode[],
): void => {
  const positions = new Map(
    projected
      .filter(node => node && typeof node.id === 'string')
      .map(node => [node.id, node.position] as const),
  );
  for (const child of children) {
    const position = positions.get(child.id);
    const x = finiteNumber(position?.x, Number.NaN);
    const y = finiteNumber(position?.y, Number.NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      child.position = { x: Math.round(x), y: Math.round(y) };
    }
  }
};

/**
 * Applies one explicit child-layout mode to a subgroup.
 *
 * Dagre is intentionally a no-op because its edge-aware projection is completed
 * before the generic subgroup phases. Hidden-child filtering remains at the
 * caller boundary so this function cannot silently change subgroup membership.
 */
export const layoutSubGroupChildrenByMode = (
  subGroup: ReactFlowNode,
  children: ReactFlowNode[],
  options: LayoutSubGroupChildrenOptions,
): boolean => {
  if (!subGroup || !Array.isArray(children) || children.length === 0) return false;
  if (options.layout === 'dagre') return false;

  const horizontalGap = nonNegativeNumber(options.horizontalGap, 12);
  const verticalGap = nonNegativeNumber(options.verticalGap, 8);

  if (options.layout === 'vertical') {
    copyProjectedPositions(
      children,
      options.projectVertical(subGroup, children, horizontalGap, verticalGap),
    );
    return true;
  }
  if (options.layout === 'grid') {
    copyProjectedPositions(
      children,
      options.projectGrid(subGroup, children, horizontalGap, verticalGap),
    );
    return true;
  }

  const left = finiteNumber(subGroup.position?.x, 0)
    + nonNegativeNumber(options.horizontalPadding, 0);
  const startY = finiteNumber(subGroup.position?.y, 0)
    + nonNegativeNumber(options.topPadding, 0);
  placeNodeRowWithoutWrap(
    children,
    left,
    startY,
    horizontalGap,
    options.metrics,
  );
  return true;
};
