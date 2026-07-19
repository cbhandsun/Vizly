import type { Node as ReactFlowNode } from '@xyflow/react';
import type { StandardNodeData } from '../../models/DiagramModels';
import type { LayoutOptions } from '../../types/layout';

import { LayeredConfigManager } from '../../config/LayeredConfigManager';
import { diagramConfigManager } from '../../config/DiagramConfig';
import {
  applyDomainGrouping,
  applySubGrouping,
  ensureMeasuredForNodes,
  normalizeMissingNodeSubDomainByDomain,
  normalizeSubGroupDomainByChildren,
  reflowSubGroupChildrenGrid,
  reflowSubGroupChildrenVertical,
} from '../../utils/layoutUtils';
import {
  layoutSubGroupChildrenByMode,
} from './domainVerticalSubGroupChildLayout';
import {
  placeNodeRowWithoutWrap,
  placeNodeRowWithWrap,
} from './domainVerticalNodeLayoutPrimitives';
import {
  applyDomainVerticalVisibility,
  collectDomainVerticalDomainOrder,
  createDomainVerticalOrderKey,
  resolveDomainVerticalNodeLayout,
} from './domainVerticalLayoutPreparation';
import { resolveDomainVerticalPipelineControls } from './domainVerticalPipelineControls';

const MAX_ABSOLUTE_LAYOUT_VALUE = 1_000_000;

export const finiteLayoutNumber = (value: unknown, fallback: number): number => {
  const safeFallback = typeof fallback === 'number' && Number.isFinite(fallback)
    ? fallback
    : 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) return safeFallback;
  return Math.min(
    MAX_ABSOLUTE_LAYOUT_VALUE,
    Math.max(-MAX_ABSOLUTE_LAYOUT_VALUE, value),
  );
};

export function prepareDomainVerticalLayout(
  nodes: ReactFlowNode[],
  options: LayoutOptions,
) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const cfg = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const layeredCfg = LayeredConfigManager.getInstance();
  const num = finiteLayoutNumber;

  const padH = num(layoutCfg?.GROUP_PADDING?.H, 24);
  const titleH = num(layoutCfg?.GROUP_TITLE_HEIGHT, 48);
  const titleV = num(layoutCfg?.GROUP_TITLE_SAFE_GAP, 8);
  const titleSafe = num(layoutCfg?.GROUP_TITLE_SAFE_GAP, 8);
  const bottomSafe = num(layoutCfg?.GROUP_BOTTOM_SAFE_GAP, 12);
  const domainGap = num(layoutCfg?.DOMAIN_H_GAP, 40);
  const sideSafeGap = num(cfg?.domain?.sideSafeGap, 0);
  const bottomSafeGap = num(cfg?.domain?.bottomSafeGap, 0);
  const widthCompensation = num(cfg?.domain?.widthCompensation, 1);
  const vScale = num(cfg?.layout?.autoGapScale?.v, 0.7);
  const domainGapEff = Math.max(12, Math.round(domainGap * vScale));
  const domainGapFinal = Math.max(
    domainGapEff,
    Math.floor(titleSafe + Math.max(6, Math.floor(padH * 0.5))),
  );

  const subPadH = num(
    cfg?.subDomain?.padding?.horizontal
      ?? cfg?.subGroup?.padding?.horizontal
      ?? layoutCfg?.SUB_GROUP_PADDING?.H,
    18,
  );
  const subTitleH = num(
    cfg?.subDomain?.title?.height
      ?? cfg?.subGroup?.title?.height
      ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT,
    30,
  );
  const subTitleV = num(
    cfg?.subDomain?.title?.padding?.vertical
      ?? cfg?.subGroup?.title?.padding?.vertical
      ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP,
    16,
  );
  const subBottomSafe = num(
    cfg?.subDomain?.padding?.bottom
      ?? cfg?.subGroup?.padding?.bottom
      ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM,
    16,
  );
  const subPadTop = num(
    cfg?.subDomain?.padding?.top
      ?? cfg?.subGroup?.padding?.top
      ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP,
    28,
  );
  const nodeH = num(layoutCfg?.NODE_H_GAP, 120);
  const nodeV = num(layoutCfg?.NODE_V_GAP, 60);
  const scaleHCfg = num(cfg?.layout?.autoGapScale?.h, 1);
  const hGapDet = Math.max(
    12,
    Math.floor(num(layoutCfg?.NODE_H_GAP, 120) * Math.min(1, scaleHCfg)),
  );
  const subGroupVGapCompact = Math.max(8, Math.floor(nodeV * 0.6));

  const domainWhitelist = (options as any)?.domainWhitelist as string[] | undefined;
  const subWhitelist = (options as any)?.subDomainWhitelist as string[] | undefined;
  const pipelineControls = resolveDomainVerticalPipelineControls({
    optionStopAfterPhase: (options as any)?.stopAfterPhase,
    configuredStopAfterPhase: layeredCfg.get<string>(
      'diagram.layout.stopAfterPhase',
      'none',
    ),
    optionLockSubGroupHeights: (options as any)?.__lockSubGroupHeights,
    optionFitDomainContent: (options as any)?.fitDomainContent,
    configuredConstantGapMode: layeredCfg.get<boolean>(
      'diagram.layout.constantGapMode' as any,
      true,
    ),
  });

  let updatedNodes = applyDomainGrouping(safeNodes as any, domainWhitelist) as ReactFlowNode[];
  updatedNodes = normalizeMissingNodeSubDomainByDomain(updatedNodes) as ReactFlowNode[];
  updatedNodes = applySubGrouping(
    updatedNodes as ReactFlowNode<StandardNodeData>[],
    subWhitelist,
  ) as ReactFlowNode[];
  updatedNodes = ensureMeasuredForNodes(updatedNodes);
  updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);
  updatedNodes = applyDomainVerticalVisibility(updatedNodes, {
    domainWhitelist,
    subDomainWhitelist: subWhitelist,
    generateDomainGroups: Boolean((options as any)?.generateDomainGroups),
    generateSubDomainGroups: Boolean((options as any)?.generateSubDomainGroups),
  });

  const effectiveTopPad = (): number => {
    const raw = subTitleH + subTitleV + subPadTop;
    const clearance = num(layoutCfg?.SUB_GROUP_TITLE_CLEARANCE, raw);
    return layoutCfg?.ENSURE_SUB_GROUP_TITLE_CLEARANCE
      ? Math.max(raw, clearance)
      : raw;
  };
  const domains = collectDomainVerticalDomainOrder(
    updatedNodes,
    (options as any)?.domainOrder,
  );
  const orderKeyOf = createDomainVerticalOrderKey(
    safeNodes,
    (options as any)?.subDomainOrder,
  );
  const nodeLayoutName = resolveDomainVerticalNodeLayout(
    (options as any)?.nodeLayout,
    cfg?.diagram?.layout?.nodeStrategy,
  );
  const nodeLayoutMetrics = {
    minimumWidth: num(layoutCfg?.NODE_MIN_WIDTH, 120),
    defaultWidth: 240,
    defaultHeight: num(cfg?.node?.height, 80),
    horizontalGap: hGapDet,
    verticalGap: nodeV,
  };
  const layoutSubGroupChildren = (
    subGroup: ReactFlowNode,
    children: ReactFlowNode[],
    topPadding: number,
  ) => layoutSubGroupChildrenByMode(subGroup, children, {
    layout: nodeLayoutName,
    horizontalPadding: subPadH,
    topPadding,
    horizontalGap: Math.max(12, hGapDet),
    verticalGap: Math.max(8, nodeV),
    metrics: nodeLayoutMetrics,
    projectVertical: reflowSubGroupChildrenVertical,
    projectGrid: reflowSubGroupChildrenGrid,
  });
  const placeRowWrap = (
    list: ReactFlowNode[],
    left: number,
    right: number,
    startY: number,
  ) => placeNodeRowWithWrap(
    list,
    left,
    right,
    startY,
    nodeLayoutName === 'grid' ? Math.max(12, hGapDet) : Math.max(12, nodeH),
    nodeLayoutMetrics,
  );
  const placeRowNoWrap = (
    list: ReactFlowNode[],
    left: number,
    startY: number,
  ) => placeNodeRowWithoutWrap(
    list,
    left,
    startY,
    Math.max(12, nodeH),
    nodeLayoutMetrics,
  );

  return {
    cfg,
    layoutCfg,
    layeredCfg,
    num,
    padH,
    titleH,
    titleV,
    titleSafe,
    bottomSafe,
    sideSafeGap,
    bottomSafeGap,
    widthCompensation,
    domainGapEff,
    domainGapFinal,
    subPadH,
    subTitleH,
    subTitleV,
    subBottomSafe,
    subPadTop,
    nodeH,
    nodeV,
    hGapDet,
    subGroupVGapCompact,
    pipelineControls,
    updatedNodes,
    orderKeyOf,
    effectiveTopPad,
    domains,
    containerTypes: new Set(['titleGroup', 'domain', 'group']),
    cursorYGlobal: num((options as any)?.padding?.top, 80),
    targetWGlobal: num(
      (options as any)?.containerSize?.width,
      num(cfg?.diagram?.container?.width, 1200),
    ),
    anchorLeftGlobal: Math.round(num(
      (options as any)?.padding?.left,
      Math.max(40, num(cfg?.diagram?.padding?.left, 40)),
    )),
    nodeLayoutName,
    nodeLayoutMetrics,
    layoutSubGroupChildren,
    placeRowWrap,
    placeRowNoWrap,
  };
}

export type DomainVerticalLayoutContext = ReturnType<typeof prepareDomainVerticalLayout>;
