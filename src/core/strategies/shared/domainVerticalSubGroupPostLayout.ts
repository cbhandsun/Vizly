import type { Node as ReactFlowNode } from '@xyflow/react';

import type { DomainVerticalPrimitiveLayout } from './domainVerticalNodeLayoutPrimitives';
import {
  separateVisibleSubGroupsHorizontally,
  translateDeclaredSubGroupChildrenInPlace,
} from './domainVerticalRigidTranslation';
import { hasVisibleSubGroupOverlapWithinDomains } from './domainVerticalSubGroupOverlap';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

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

export interface SubGroupPostLayoutOptions {
  layout: DomainVerticalPrimitiveLayout;
  domainHorizontalPadding: number;
  subGroupHorizontalPadding: number;
  horizontalGap: number;
  verticalGap: number;
  compactVerticalGap: number;
  fallbackSubGroupWidth: number;
  resolveChildOverlapsStrict: (
    nodes: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
  ) => ReactFlowNode[];
  recomputeContainers: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  resolveSubGroupOverlaps: (
    nodes: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
  ) => ReactFlowNode[];
}

/**
 * Runs phase-one subgroup post-layout recovery: strict child overlap repair,
 * conditional subgroup overlap repair, rigid child synchronization, and final
 * horizontal subgroup separation.
 */
export const finalizeInitialSubGroupLayout = (
  nodes: readonly ReactFlowNode[],
  rawOptions: SubGroupPostLayoutOptions,
): ReactFlowNode[] => {
  let updated = cloneNodes(nodes);
  if (rawOptions.layout === 'dagre') return updated;
  const horizontalGap = Math.max(12, finiteNumber(rawOptions.horizontalGap, 12));
  const verticalGap = Math.max(8, finiteNumber(rawOptions.verticalGap, 8));
  const compactVerticalGap = Math.max(
    0,
    finiteNumber(rawOptions.compactVerticalGap, verticalGap),
  );
  const beforePositions = new Map(
    updated
      .filter(node => node.type === 'subGroup')
      .map(node => [
        node.id,
        {
          x: finiteNumber(node.position?.x, 0),
          y: finiteNumber(node.position?.y, 0),
        },
      ] as const),
  );

  updated = rawOptions.resolveChildOverlapsStrict(
    updated,
    horizontalGap,
    verticalGap,
  );
  updated = rawOptions.recomputeContainers(updated);
  if (hasVisibleSubGroupOverlapWithinDomains(updated, 0)) {
    updated = rawOptions.resolveSubGroupOverlaps(
      updated,
      rawOptions.layout === 'grid'
        ? Math.max(12, Math.floor(horizontalGap * 0.4))
        : horizontalGap,
      compactVerticalGap,
    );
  }

  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  for (const subGroup of updated.filter(node => node.type === 'subGroup')) {
    const before = beforePositions.get(subGroup.id);
    if (!before) continue;
    const deltaX = Math.round(finiteNumber(subGroup.position?.x, before.x) - before.x);
    const deltaY = Math.round(finiteNumber(subGroup.position?.y, before.y) - before.y);
    translateDeclaredSubGroupChildrenInPlace(
      nodeById,
      subGroup,
      deltaX,
      deltaY,
    );
  }
  updated = rawOptions.recomputeContainers(updated);

  const separated = separateVisibleSubGroupsHorizontally(updated, {
    domainHorizontalPadding: Math.max(
      0,
      finiteNumber(rawOptions.domainHorizontalPadding, 0),
    ),
    firstSubGroupOffset: -Math.max(
      0,
      finiteNumber(rawOptions.subGroupHorizontalPadding, 0),
    ),
    gap: rawOptions.layout === 'grid'
      ? Math.max(12, Math.floor(horizontalGap * 0.4))
      : horizontalGap,
    fallbackSubGroupWidth: rawOptions.fallbackSubGroupWidth,
  });
  updated = separated.nodes;
  return updated;
};
