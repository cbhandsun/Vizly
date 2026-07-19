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

  updatedNodes = purgeSubGroupChildrenBySemantic(updatedNodes) as ReactFlowNode[];
  updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes) as ReactFlowNode[];
  updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes) as ReactFlowNode[];

  const nodeById = new Map(updatedNodes.map(node => [node.id, node] as const));
  for (const subGroup of updatedNodes.filter(node => String(node.type || '') === 'subGroup')) {
    const childIds = Array.isArray((subGroup as any)?.data?.children)
      ? (subGroup as any).data.children as string[]
      : [];
    const children = childIds
      .map(id => nodeById.get(id))
      .filter((node): node is ReactFlowNode => Boolean(node) && !(node as any)?.data?.hidden);
    if (children.length >= 2) {
      scatterNodesAtSamePoint(children as any, 'x', Math.max(12, hGapDet), 2);
    }
  }

  updatedNodes = rebindChildrenNormalized(updatedNodes) as ReactFlowNode[];
  updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes) as ReactFlowNode[];
  updatedNodes = ensureMeasuredForNodes(updatedNodes);
  if (nodeLayoutName === 'dagre') {
    updatedNodes = preprocessDomainVerticalDagreSubGroups(updatedNodes, edges, {
      direction: (options as any)?.direction || cfg?.diagram?.layout?.direction || 'TB',
      horizontalGap: hGapDet,
      verticalGap: nodeV,
      reflowSubGroup: reflowSubGroupChildrenDagre,
      resolveStrict: (nodes, horizontalGap, verticalGap) =>
        resolveSubGroupChildrenOverlapsStrict(
          nodes as any,
          horizontalGap,
          verticalGap,
        ) as ReactFlowNode[],
      recomputeContainers: nodes =>
        recomputeSubGroupContainersBasic(nodes) as ReactFlowNode[],
    });
  }

  const allTitleGroupsHidden = areAllTitleGroupDomainsHidden(updatedNodes);
  safeLog.debug(`[DOMAIN-HIDDEN-CHECK] allDomainsHidden=${allTitleGroupsHidden}`);

  if (!allTitleGroupsHidden && nodeLayoutName === 'dagre') {
    const domainPadH = num(cfg?.domain?.padding?.horizontal, 24);
    const subGroupGap = num(cfg?.subDomain?.margin?.bottom, 24);
    updatedNodes = reconstructDomainVerticalDagreLayout(updatedNodes, {
      paddingLeft: num((options as any)?.padding?.left, 40),
      paddingTop: num((options as any)?.padding?.top, 80),
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
    updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as ReactFlowNode[];
    updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as ReactFlowNode[];
    updatedNodes = centerProjectedDagreSubGroups(updatedNodes, {
      domainPaddingHorizontal: domainPadH,
      subGroupGap,
    });
  }

  if (nodeLayoutName !== 'dagre') {
    updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as ReactFlowNode[];
  }
  updatedNodes = ensureMeasuredForNodes(updatedNodes);
  updatedNodes = resolveSubGroupChildOverlapsByMode(updatedNodes, {
    layout: nodeLayoutName,
    horizontalGap: Math.max(12, hGapDet),
    verticalGap: Math.max(8, nodeV),
    fallbackChildWidth: nodeLayoutMetrics.minimumWidth,
    resolveStrict: (nodes, horizontalGap, verticalGap) =>
      resolveSubGroupChildrenOverlapsStrict(
        nodes as any,
        horizontalGap,
        verticalGap,
      ) as ReactFlowNode[],
    recomputeContainers: nodes =>
      recomputeSubGroupContainersBasic(nodes) as ReactFlowNode[],
  });
  updatedNodes = ensureMeasuredForNodes(updatedNodes);

  if (!pipelineControls.lockSubGroupHeights && nodeLayoutName !== 'dagre') {
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as ReactFlowNode[];
  }
  if (nodeLayoutName !== 'dagre') {
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as ReactFlowNode[];
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as ReactFlowNode[];
    updatedNodes = equalizeVisibleSubGroupHeightsByDomain(
      updatedNodes,
      subTitleH + subTitleV + subPadTop + subBottomSafe,
    );

    for (const domain of updatedNodes.filter(node => String(node.type || '') === 'titleGroup')) {
      if ((domain as any)?.data?.hidden) continue;
      const domainKey = String((domain as any).data?.domain || '');
      const innerTop = num((domain as any)?.position?.y, 0) + titleH + titleV + titleSafe;
      for (const subGroup of updatedNodes.filter(node =>
        String(node.type || '') === 'subGroup'
        && String((node.data as any)?.domain || '') === domainKey
        && !(node as any)?.data?.hidden)) {
        (subGroup as any).position = {
          x: num((subGroup as any)?.position?.x, 0),
          y: Math.round(innerTop - effectiveTopPad()),
        };
      }
    }
    updatedNodes = enforceSubGroupTitleClearance(updatedNodes) as ReactFlowNode[];
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
          && String((node as any)?.data?.domain || '')
            === String((subGroup as any)?.data?.domain || ''));
        if (!domain) continue;
        const domainX = num((domain as any)?.position?.x, 0);
        const domainWidth = num(
          (domain as any)?.measured?.width ?? (domain as any)?.style?.width,
          0,
        );
        const centerX = domainX + Math.max(subPadH, 0)
          + Math.max(1, domainWidth - Math.max(subPadH, 0) * 2) / 2;
        const subGroupX = num((subGroup as any)?.position?.x, 0);
        const subGroupWidth = num(
          (subGroup as any)?.measured?.width
            ?? (subGroup as any)?.style?.width
            ?? (subGroup as any)?.width,
          0,
        );
        const innerLeft = subGroupX + Math.max(subPadH, 0);
        const innerRight = subGroupX + subGroupWidth - Math.max(subPadH, 0);
        for (const child of children) {
          const width = num(
            (child as any)?.measured?.width
              ?? (child as any)?.style?.width
              ?? (child as any)?.width,
            nodeLayoutMetrics.minimumWidth,
          );
          const desiredX = Math.round(centerX - width / 2);
          (child as any).position = {
            x: Math.min(Math.max(desiredX, innerLeft), Math.max(innerLeft, innerRight - width)),
            y: num((child as any)?.position?.y, 0),
          };
        }
      }
    }
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as ReactFlowNode[];
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as ReactFlowNode[];
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as ReactFlowNode[];
    updatedNodes = equalizeVisibleSubGroupHeightsByDomain(
      updatedNodes,
      subTitleH + subTitleV + subPadTop + subBottomSafe,
    );
  }

  return { nodes: updatedNodes, allTitleGroupsHidden };
}
