import type { Node as ReactFlowNode } from '@xyflow/react';

import {
  expandDomainWidthsFromVisibleVerticalBands,
  unifyContainerWidthsByMaximum,
} from './domainVerticalContainerProjection';
import type { DomainVerticalPrimitiveLayout } from './domainVerticalNodeLayoutPrimitives';
import {
  separateVisibleSubGroupsHorizontally,
  stackDomainsVerticallyRigid,
} from './domainVerticalRigidTranslation';
import { collectVisibleSubGroupChildren } from './domainVerticalSubGroupChildLayout';
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

export interface PhaseTwoSubGroupOperations {
  purgeSemanticChildren: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  assignSemanticChildren: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  recomputeSubGroups: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  finalizeSubGroupWidths: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  finalizeSubGroupHeights: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  enforceSubGroupContainment: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  expandSubGroupsBySemantic: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  resolveSubGroupOverlaps: (
    nodes: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
  ) => ReactFlowNode[];
  enforceDomainContainment: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  resolveFreeNodeOverlaps: (
    nodes: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
  ) => ReactFlowNode[];
  finalizeDomainWidths: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  unifySubGroupWidths: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  unifySubGroupGaps: (
    nodes: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
    compare: (left: ReactFlowNode, right: ReactFlowNode) => number,
  ) => ReactFlowNode[];
  unifySubGroupHeights: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  clampDomainHeights: (nodes: ReactFlowNode[]) => ReactFlowNode[];
}

export interface PhaseTwoSubGroupLayoutOptions {
  layout: DomainVerticalPrimitiveLayout;
  top: number;
  domainGap: number;
  domainOrder: readonly string[];
  domainHorizontalPadding: number;
  subGroupHorizontalPadding: number;
  subGroupTopPadding: number;
  horizontalGap: number;
  verticalGap: number;
  compactVerticalGap: number;
  fallbackContainerHeight: number;
  fallbackSubGroupWidth: number;
  orderOf: (node: ReactFlowNode) => number;
  layoutChildren: (
    subGroup: ReactFlowNode,
    children: ReactFlowNode[],
    topPadding: number,
  ) => void;
  operations: PhaseTwoSubGroupOperations;
}

/**
 * Coordinates the phase-two subgroup convergence transaction. Geometry
 * algorithms remain injectable; this module owns their ordering, Dagre
 * exclusions, conditional overlap recovery, and final domain stacking.
 */
export const finalizePhaseTwoSubGroupLayout = (
  nodes: readonly ReactFlowNode[],
  rawOptions: PhaseTwoSubGroupLayoutOptions,
): ReactFlowNode[] => {
  let updated = cloneNodes(nodes);
  const horizontalGap = Math.max(
    12,
    finiteNumber(rawOptions.horizontalGap, 12),
  );
  const verticalGap = Math.max(8, finiteNumber(rawOptions.verticalGap, 8));
  const compactVerticalGap = Math.max(
    0,
    finiteNumber(rawOptions.compactVerticalGap, verticalGap),
  );
  const domainHorizontalPadding = Math.max(
    0,
    finiteNumber(rawOptions.domainHorizontalPadding, 0),
  );
  const subGroupHorizontalPadding = Math.max(
    0,
    finiteNumber(rawOptions.subGroupHorizontalPadding, 0),
  );
  const fallbackContainerHeight = Math.max(
    1,
    finiteNumber(rawOptions.fallbackContainerHeight, 80),
  );
  const fallbackSubGroupWidth = Math.max(
    1,
    finiteNumber(rawOptions.fallbackSubGroupWidth, 240),
  );
  const operations = rawOptions.operations;

  if (rawOptions.layout !== 'dagre') {
    updated = operations.purgeSemanticChildren(updated);
    updated = operations.assignSemanticChildren(updated);
  }
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  for (const subGroup of updated.filter(node => node.type === 'subGroup')) {
    const children = collectVisibleSubGroupChildren(subGroup, nodeById);
    if (children.length) {
      rawOptions.layoutChildren(
        subGroup,
        children,
        Math.max(0, finiteNumber(rawOptions.subGroupTopPadding, 0)),
      );
    }
  }
  updated = operations.recomputeSubGroups(updated);
  updated = operations.finalizeSubGroupWidths(updated);
  updated = operations.finalizeSubGroupHeights(updated);
  updated = operations.enforceSubGroupContainment(updated);
  updated = expandDomainWidthsFromVisibleVerticalBands(updated, {
    horizontalPadding: domainHorizontalPadding,
    leftTolerance: 10,
    fallbackContainerHeight,
  });
  updated = unifyContainerWidthsByMaximum(
    updated,
    new Set(['titleGroup']),
    fallbackContainerHeight,
  );
  updated = stackDomainsVerticallyRigid(updated, {
    top: finiteNumber(rawOptions.top, 0),
    gap: Math.max(0, finiteNumber(rawOptions.domainGap, 0)),
    domainOrder: rawOptions.domainOrder,
    mode: 'push-down',
    fallbackHeight: fallbackContainerHeight,
  });
  updated = stackDomainsVerticallyRigid(updated, {
    gap: Math.max(0, finiteNumber(rawOptions.domainGap, 0)),
    domainOrder: rawOptions.domainOrder,
    anchor: 'first-current',
    fallbackHeight: fallbackContainerHeight,
    markFinalizedDomains: true,
  });
  if (rawOptions.layout !== 'dagre') {
    updated = operations.recomputeSubGroups(updated);
  }
  updated = operations.enforceSubGroupContainment(updated);
  updated = operations.expandSubGroupsBySemantic(updated);
  if (hasVisibleSubGroupOverlapWithinDomains(updated, horizontalGap)) {
    updated = operations.resolveSubGroupOverlaps(
      updated,
      rawOptions.layout === 'grid'
        ? Math.max(12, Math.floor(horizontalGap * 0.4))
        : horizontalGap,
      compactVerticalGap,
    );
  }
  updated = operations.enforceDomainContainment(updated);
  updated = operations.resolveFreeNodeOverlaps(
    updated,
    Math.max(12, subGroupHorizontalPadding),
    verticalGap,
  );
  if (rawOptions.layout !== 'dagre') {
    updated = operations.finalizeSubGroupHeights(updated);
  }
  updated = operations.finalizeDomainWidths(updated);
  if (rawOptions.layout !== 'dagre') {
    updated = operations.recomputeSubGroups(updated);
  }
  updated = operations.unifySubGroupWidths(updated);
  const unifiedHorizontalGap = Math.max(8, Math.floor(horizontalGap * 0.6));
  const unifiedVerticalGap = Math.max(6, Math.floor(verticalGap * 0.6));
  updated = operations.unifySubGroupGaps(
    updated,
    unifiedHorizontalGap,
    unifiedVerticalGap,
    (left, right) =>
      finiteNumber(rawOptions.orderOf(left), Number.MAX_SAFE_INTEGER)
      - finiteNumber(rawOptions.orderOf(right), Number.MAX_SAFE_INTEGER),
  );
  if (rawOptions.layout !== 'dagre') {
    updated = operations.unifySubGroupHeights(updated);
  }
  updated = operations.resolveSubGroupOverlaps(
    updated,
    unifiedHorizontalGap,
    unifiedVerticalGap,
  );
  updated = operations.clampDomainHeights(updated);

  const safeEdge = horizontalGap;
  const separated = separateVisibleSubGroupsHorizontally(updated, {
    domainHorizontalPadding,
    gap: (
      rawOptions.layout === 'grid'
        ? Math.max(12, Math.floor(horizontalGap * 0.4))
        : horizontalGap
    ) + safeEdge,
    fallbackSubGroupWidth,
  });
  updated = separated.nodes;
  if (
    separated.movedDomainKeys.length > 0
    && rawOptions.layout !== 'dagre'
  ) {
    updated = operations.recomputeSubGroups(updated);
  }
  return updated;
};
