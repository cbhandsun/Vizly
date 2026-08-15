import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import type { LayoutOptions } from '../../types/layout';

import {
  assignChildrenToSubGroupsBySemantic,
  auditAndFixSubGroupChildrenBindings,
  enforceSubGroupStrictContainmentByChildren,
  enforceSubGroupTitleClearance,
  ensureMeasuredForNodes,
  finalizeDomainHeightsByProjection,
  finalizeDomainWidthsByProjection,
  finalizeSubGroupHeightsByProjectionPreserveAnchor,
  finalizeSubGroupWidthsByProjectionPreserveAnchor,
  purgeSubGroupChildrenBySemantic,
  recomputeSubGroupContainersBasic,
  reflowSubGroupChildrenDagre,
  resolveSubGroupChildrenOverlapsStrict,
  scatterNodesAtSamePoint,
  syncDagreChildPositions,
} from '../../utils/layoutUtils';
import { safeLog } from '../../utils/consoleCleanup';
import {
  injectSemanticSubGroupsForMissingKeys,
  rebindChildrenNormalized,
} from './semanticHelpers';
import {
  centerProjectedDagreSubGroups,
  preprocessDomainVerticalDagreSubGroups,
  reconstructDomainVerticalDagreLayout,
} from './domainVerticalDagreReconstruction';
import {
  collectVisibleSubGroupChildren,
  resolveSubGroupChildOverlapsByMode,
} from './domainVerticalSubGroupChildLayout';
import { areAllTitleGroupDomainsHidden } from './domainVerticalHiddenDomainLayout';
import { equalizeVisibleSubGroupHeightsByDomain } from './domainVerticalContainerProjection';
import { snapshotVisibleSubGroupChildOriginOffsets } from './domainVerticalRelativeOffsets';
import type { DomainVerticalLayoutContext } from './domainVerticalLayoutContext';

export interface DomainVerticalPhaseOneResult {
  nodes: ReactFlowNode[];
  allTitleGroupsHidden: boolean;
}

const dataOf = (node: ReactFlowNode): Record<string, unknown> => (
  node.data && typeof node.data === 'object' && !Array.isArray(node.data)
    ? node.data
    : {}
);

const isHidden = (node: ReactFlowNode): boolean => dataOf(node).hidden === true;

const domainOf = (node: ReactFlowNode): string => {
  const domain = dataOf(node).domain;
  return typeof domain === 'string' ? domain : '';
};

const widthOf = (
  node: ReactFlowNode,
  num: DomainVerticalLayoutContext['num'],
  fallback = 0,
): number => num(node.measured?.width ?? node.style?.width ?? node.width, fallback);

/**
 * Normalizes semantic bindings and establishes stable subgroup geometry before
 * the strategy starts domain-level placement and projection.
 */
export function runDomainVerticalPhaseOne(
  inputNodes: ReactFlowNode[],
  edges: Edge[],
  options: LayoutOptions,
  context: DomainVerticalLayoutContext,
): DomainVerticalPhaseOneResult {
  const {
    cfg,
    num,
    hGapDet,
    nodeV,
    nodeLayoutName,
    nodeLayoutMetrics,
    pipelineControls,
    domains,
    subTitleH,
    subTitleV,
    subPadTop,
    subBottomSafe,
    titleH,
    titleV,
    titleSafe,
    subPadH,
    effectiveTopPad,
    layoutSubGroupChildren,
  } = context;
  let updatedNodes = inputNodes;

  updatedNodes = purgeSubGroupChildrenBySemantic(updatedNodes);
  updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes);
  updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes);

  const nodeById = new Map(updatedNodes.map(node => [node.id, node] as const));
  for (const subGroup of updatedNodes.filter(node => String(node.type || '') === 'subGroup')) {
    const childrenValue = dataOf(subGroup).children;
    const childIds = Array.isArray(childrenValue)
      ? childrenValue.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const children = childIds
      .map(id => nodeById.get(id))
      .filter((node): node is ReactFlowNode => node !== undefined && !isHidden(node));
    if (children.length >= 2) {
      scatterNodesAtSamePoint(children, 'x', Math.max(12, hGapDet), 2);
    }
  }

  updatedNodes = rebindChildrenNormalized(updatedNodes);
  updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes);
  updatedNodes = ensureMeasuredForNodes(updatedNodes);
  if (nodeLayoutName === 'dagre') {
    updatedNodes = preprocessDomainVerticalDagreSubGroups(updatedNodes, edges, {
      direction: options.direction || cfg.diagram?.layout?.direction || 'TB',
      horizontalGap: hGapDet,
      verticalGap: nodeV,
      reflowSubGroup: reflowSubGroupChildrenDagre,
      resolveStrict: (nodes, horizontalGap, verticalGap) =>
        resolveSubGroupChildrenOverlapsStrict(
          nodes,
          horizontalGap,
          verticalGap,
        ),
      recomputeContainers: nodes =>
        recomputeSubGroupContainersBasic(nodes),
    });
  }

  const allTitleGroupsHidden = areAllTitleGroupDomainsHidden(updatedNodes);
  if (import.meta.env.DEV) {
    safeLog.debug(`[DOMAIN-HIDDEN-CHECK] allDomainsHidden=${allTitleGroupsHidden}`);
  }

  if (!allTitleGroupsHidden && nodeLayoutName === 'dagre') {
    const domainPadH = num(cfg?.domain?.padding?.horizontal, 24);
    const subGroupGap = num(cfg?.subDomain?.margin?.bottom, 24);
    updatedNodes = reconstructDomainVerticalDagreLayout(updatedNodes, {
      paddingLeft: num(options.padding?.left, 40),
      paddingTop: num(options.padding?.top, 80),
      domainPaddingHorizontal: domainPadH,
      domainPaddingVertical: num(cfg?.domain?.padding?.vertical, 16),
      domainGap: 48,
      subGroupGap,
      domainTitleHeight: num(cfg?.domain?.title?.height, 48),
      domainTitlePaddingVertical: num(cfg?.domain?.title?.padding?.vertical, 12),
      domainTitleSafeGap: num(cfg?.domain?.title?.safeGap, 16),
      domainOrder: domains,
    });
    updatedNodes = syncDagreChildPositions(updatedNodes);
    updatedNodes = finalizeDomainWidthsByProjection(updatedNodes);
    updatedNodes = finalizeDomainHeightsByProjection(updatedNodes);
    updatedNodes = centerProjectedDagreSubGroups(updatedNodes, {
      domainPaddingHorizontal: domainPadH,
      subGroupGap,
    });
  }

  if (nodeLayoutName !== 'dagre') {
    updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes);
  }
  updatedNodes = ensureMeasuredForNodes(updatedNodes);
  updatedNodes = resolveSubGroupChildOverlapsByMode(updatedNodes, {
    layout: nodeLayoutName,
    horizontalGap: Math.max(12, hGapDet),
    verticalGap: Math.max(8, nodeV),
    fallbackChildWidth: nodeLayoutMetrics.minimumWidth,
    resolveStrict: (nodes, horizontalGap, verticalGap) =>
      resolveSubGroupChildrenOverlapsStrict(
        nodes,
        horizontalGap,
        verticalGap,
      ),
    recomputeContainers: nodes =>
      recomputeSubGroupContainersBasic(nodes),
  });
  updatedNodes = ensureMeasuredForNodes(updatedNodes);

  if (!pipelineControls.lockSubGroupHeights && nodeLayoutName !== 'dagre') {
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes);
  }
  if (nodeLayoutName !== 'dagre') {
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes);
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = equalizeVisibleSubGroupHeightsByDomain(
      updatedNodes,
      subTitleH + subTitleV + subPadTop + subBottomSafe,
    );

    for (const domain of updatedNodes.filter(node => String(node.type || '') === 'titleGroup')) {
      if (isHidden(domain)) continue;
      const domainKey = domainOf(domain);
      const innerTop = num(domain.position?.y, 0) + titleH + titleV + titleSafe;
      for (const subGroup of updatedNodes.filter(node =>
        String(node.type || '') === 'subGroup'
        && domainOf(node) === domainKey
        && !isHidden(node))) {
        subGroup.position = {
          x: num(subGroup.position?.x, 0),
          y: Math.round(innerTop - effectiveTopPad()),
        };
      }
    }
    updatedNodes = enforceSubGroupTitleClearance(updatedNodes);
  }

  updatedNodes = snapshotVisibleSubGroupChildOriginOffsets(updatedNodes);
  if (nodeLayoutName !== 'dagre') {
    const currentNodeById = new Map(updatedNodes.map(node => [node.id, node] as const));
    for (const subGroup of updatedNodes.filter(node => String(node.type || '') === 'subGroup')) {
      const children = collectVisibleSubGroupChildren(subGroup, currentNodeById);
      if (!children.length) continue;
      layoutSubGroupChildren(subGroup, children, effectiveTopPad());
      if (nodeLayoutName === 'vertical') {
        const domain = updatedNodes.find(node =>
          String(node.type || '') === 'titleGroup'
          && domainOf(node) === domainOf(subGroup));
        if (!domain) continue;
        const domainX = num(domain.position?.x, 0);
        const domainWidth = widthOf(domain, num);
        const centerX = domainX + Math.max(subPadH, 0)
          + Math.max(1, domainWidth - Math.max(subPadH, 0) * 2) / 2;
        const subGroupX = num(subGroup.position?.x, 0);
        const subGroupWidth = widthOf(subGroup, num);
        const innerLeft = subGroupX + Math.max(subPadH, 0);
        const innerRight = subGroupX + subGroupWidth - Math.max(subPadH, 0);
        for (const child of children) {
          const width = widthOf(child, num, nodeLayoutMetrics.minimumWidth);
          const desiredX = Math.round(centerX - width / 2);
          child.position = {
            x: Math.min(Math.max(desiredX, innerLeft), Math.max(innerLeft, innerRight - width)),
            y: num(child.position?.y, 0),
          };
        }
      }
    }
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes);
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes);
    updatedNodes = equalizeVisibleSubGroupHeightsByDomain(
      updatedNodes,
      subTitleH + subTitleV + subPadTop + subBottomSafe,
    );
  }

  return { nodes: updatedNodes, allTitleGroupsHidden };
}
