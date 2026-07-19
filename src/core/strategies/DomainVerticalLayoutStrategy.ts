import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../models/DiagramModels';
import type { LayoutOptions } from '../types/layout';

import { LayeredConfigManager } from '../config/LayeredConfigManager';
import { diagramConfigManager } from '../config/DiagramConfig';
import { pushFreeNodesBelowSubGroupRow, resolveDomainContainerOverlaps, scatterNodesAtSamePoint } from '../utils/layoutUtils';
import { ILayoutStrategy } from './LayoutStrategyManager';
import { applyDomainGrouping, applySubGrouping, assignChildrenToSubGroupsBySemantic, normalizeSubGroupDomainByChildren, enforceDomainContainerStrictContainment, recomputeSubGroupContainersBasic, purgeSubGroupChildrenBySemantic, resolveSubGroupOverlaps, resolveFreeNodeOverlapsInDomain, resolveSubGroupChildrenOverlapsStrict, expandSubGroupContainersBySemantic, enforceSubGroupStrictContainmentByChildren, finalizeSubGroupHeightsByProjectionPreserveAnchor, finalizeDomainWidthsByProjection, ensureMeasuredForNodes, normalizeMissingNodeSubDomainByDomain, finalizeSubGroupWidthsByProjectionPreserveAnchor, unifySubGroupWidthsByDomain, finalizeDomainHeightsByProjection, reflowSubGroupChildrenVertical, packSubGroupChildrenRigid, clampDomainHeightsToSubGroups, enforceSubGroupTitleClearance, reflowSubGroupChildrenGrid, unifySubGroupGapsInDomain, unifySubGroupHeightsByDomain, reflowSubGroupChildrenDagre, syncDagreChildPositions, centerSubGroupsInDomain, scaleDomainContentToFitWidthAll } from '../utils/layoutUtils';
import { auditAndFixSubGroupChildrenBindings, centerSubGroupChildrenHorizontally, centerSubGroupChildrenVertically, layoutSubGroupChildrenInRow, alignSubGroupGridRows, alignSubGroupStack } from '../utils/layoutUtils';
import { injectSemanticSubGroupsForMissingKeys, rebindChildrenNormalized } from './shared/semanticHelpers';
import { ensureDomainContainment } from './shared/geometryGuard';
import { runEdgeRoutingPipeline } from './shared/edgeRoutingPipeline';
import { safeLog } from '../utils/consoleCleanup';
import {
  applyDomainVerticalVisibility,
  collectDomainVerticalDomainOrder,
  collectOrderedDomainSubGroups,
  createDomainVerticalOrderKey,
  resolveDomainVerticalNodeLayout,
} from './shared/domainVerticalLayoutPreparation';
import {
  centerProjectedDagreSubGroups,
  preprocessDomainVerticalDagreSubGroups,
  reconstructDomainVerticalDagreLayout,
} from './shared/domainVerticalDagreReconstruction';
import {
  alignDomainsToLeftAnchor,
  centerVisibleDomainMembersHorizontally,
  separateVisibleSubGroupsHorizontally,
  stackDomainsVerticallyRigid,
} from './shared/domainVerticalRigidTranslation';
import {
  layoutNodesHorizontally,
  layoutNodesInGrid,
  layoutNodesVertically,
  placeNodeRowWithoutWrap,
  placeNodeRowWithWrap,
  resolveNodeOverlapsByLayout,
} from './shared/domainVerticalNodeLayoutPrimitives';
import {
  collectVisibleSubGroupChildren,
  layoutSubGroupChildrenByMode,
  resolveSubGroupChildOverlapsByMode,
} from './shared/domainVerticalSubGroupChildLayout';
import {
  equalizeVisibleSubGroupHeightsByDomain,
  projectAndUnifyDomainContainerBounds,
  projectAndUnifyDeterministicDomainWidths,
  projectAndUnifySemanticDomainWidths,
  projectDomainHeightsFromVisibleMembers,
  projectSingleDomainContainer,
  unifyContainerWidthsByMaximum,
} from './shared/domainVerticalContainerProjection';
import { snapshotVisibleSubGroupChildOriginOffsets } from './shared/domainVerticalRelativeOffsets';
import { resolveDomainVerticalPipelineControls } from './shared/domainVerticalPipelineControls';
import { alignDomainVerticalTerminalSubGroupChildren } from './shared/domainVerticalTerminalChildAlignment';
import { recoverGridSubGroupsByDomainWidth } from './shared/domainVerticalGridSubGroupRecovery';
import {
  areAllTitleGroupDomainsHidden,
  layoutHiddenDomainSubGroups,
} from './shared/domainVerticalHiddenDomainLayout';
import { layoutInitialSubGroupsInDomain } from './shared/domainVerticalSubGroupInitialLayout';
import { finalizeInitialSubGroupLayout } from './shared/domainVerticalSubGroupPostLayout';
import { finalizeDomainInternalLayout } from './shared/domainVerticalFinalInternalLayout';
import {
  clampSubGroupsToDomainHorizontalInsets,
  separateSubGroupsAndExpandDomainsIteratively,
} from './shared/domainVerticalSubGroupHorizontalRecovery';
import { finalizePhaseTwoSubGroupLayout } from './shared/domainVerticalPhaseTwoSubGroupLayout';

/**
 * 域纵向布局策略
 * 函数级注释：
 * - 域垂直堆叠：按显式顺序或数据默认域顺序依次放置
 * - 子域横排：域内子域从左到右排列，超出宽度则换行
 * - 节点布局：子域内节点或域内无子域的节点使用横排换行
 * - 单次容器回收：一次性回收子域与域容器尺寸，不做重复消重
 */
export class DomainVerticalLayoutStrategy implements ILayoutStrategy {
  getName(): string { return 'DomainVerticalLayout'; }
  getCategory(): 'hierarchy' | 'node' { return 'hierarchy'; }
  getDescription(): string { return '最小管线：域垂直、子域横排、节点横排，单次回收容器'; }
  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean { return Array.isArray(nodes) && nodes.length > 0; }

  /**
   * 计算布局
   * 函数级注释：
   * - 始终生成域/子域容器用于计算；显示通过 hidden 控制
   * - 不调用复杂消重，仅通过顺序堆叠与单次回收保证不重叠
   */
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
    const cfg = diagramConfigManager.getConfig() as any;
    const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
    const layeredCfg = LayeredConfigManager.getInstance();
    const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

    const padH = num(layoutCfg?.GROUP_PADDING?.H, 24);
    const titleH = num(layoutCfg?.GROUP_TITLE_HEIGHT, 48);
    const titleV = num(layoutCfg?.GROUP_TITLE_SAFE_GAP, 8); // Use safeGap as vertical padding proxy
    const titleSafe = num(layoutCfg?.GROUP_TITLE_SAFE_GAP, 8);
    const bottomSafe = num(layoutCfg?.GROUP_BOTTOM_SAFE_GAP, 12);
    const domainGap = num(layoutCfg?.DOMAIN_H_GAP, 40);

    // 新增：读取对称性补偿配置
    const sideSafeGap = num((cfg?.domain?.sideSafeGap), 0);
    const bottomSafeGap = num((cfg?.domain?.bottomSafeGap), 0);
    const widthCompensation = num((cfg?.domain?.widthCompensation), 1.0);

    /**
     * 函数级注释：域间垂直间距（紧凑化）
     * - 依据 layout.autoGapScale.v 对域间距进行缩放，默认偏紧凑（<=1）
     * - 去除对标题安全留白的额外加成，仅保留域间距本身，避免上下间隔过大
     */
    const vScale = num((cfg?.layout?.autoGapScale?.v as any), 0.7);
    const domainGapEff = Math.max(12, Math.round(domainGap * vScale));
    const domainGapFinal = Math.max(domainGapEff, Math.floor(titleSafe + Math.max(6, Math.floor(padH * 0.5))));

    const subPadH = num((cfg?.subDomain?.padding?.horizontal ?? cfg?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 18);
    const subTitleH = num((cfg?.subDomain?.title?.height ?? cfg?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 30);
    const subTitleV = num((cfg?.subDomain?.title?.padding?.vertical ?? cfg?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 16);
    const subBottomSafe = num((cfg?.subDomain?.padding?.bottom ?? cfg?.subGroup?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 16);
    const subPadTop = num((cfg?.subDomain?.padding?.top ?? cfg?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP), 28);

    const nodeH = num(layoutCfg?.NODE_H_GAP, 120);
    const nodeV = num(layoutCfg?.NODE_V_GAP, 60);

    const baseHGapCfg = num((layoutCfg?.NODE_H_GAP), 120);
    const scaleHCfg = num(((cfg?.layout?.autoGapScale?.h) as any), 1);
    const hGapDet = Math.max(12, Math.floor(baseHGapCfg * Math.min(1.0, scaleHCfg)));
    /**
     * 函数级注释：同域子域行间距（紧凑化）
     * - 定义：仅作用于同一域内子域容器之间的垂直间距
     * - 策略：按节点垂直间距 nodeV 的 0.6 比例，并保留 8 像素下限，获得更紧凑的子域堆叠
     */
    const subGroupVGapCompact = Math.max(8, Math.floor(nodeV * 0.6));

    const domainWhitelist = (options as any)?.domainWhitelist as string[] | undefined;
    const subWhitelist = (options as any)?.subDomainWhitelist as string[] | undefined;
    const showDomain = !!(options as any)?.generateDomainGroups;
    const showSub = !!((options as any)?.generateSubDomainGroups);
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
    const { constantGapMode, fitDomainContent, stopAfterPhase } = pipelineControls;

    let updatedNodes: ReactFlowNode[] = nodes as ReactFlowNode[];
    const orderKeyOf = createDomainVerticalOrderKey(
      nodes,
      (options as any)?.subDomainOrder,
    );
    // 函数级注释：域/子域分组与缺失子域键补齐（与水平策略对齐）
    updatedNodes = applyDomainGrouping(updatedNodes as any, domainWhitelist) as any;
    updatedNodes = normalizeMissingNodeSubDomainByDomain(updatedNodes) as any;
    updatedNodes = applySubGrouping(updatedNodes as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist) as any;
    updatedNodes = ensureMeasuredForNodes(updatedNodes);
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);

    /**
     * 子域标题有效顶部留白计算
     * 函数级注释：
     * - 当开启 ENSURE_SUB_GROUP_TITLE_CLEARANCE 时，取 max(标题高度+内边距+top, SUB_GROUP_TITLE_CLEARANCE)
     * - 关闭时仅使用 标题高度+内边距+top
    */
    const effectiveTopPad = (): number => {
      const layout = layoutCfg;
      const raw = subTitleH + subTitleV + subPadTop;
      const ensure = !!layout?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
      const clearance = num(layout?.SUB_GROUP_TITLE_CLEARANCE, raw);
      return ensure ? Math.max(raw, clearance) : raw;
    };
    /**
     * 函数级注释：容器可见性与左锚锁定
     * - 为 titleGroup/domain/group 三类容器设置 anchorLocked，避免后续任何水平避让破坏左锚
     * - 子域(subGroup)按白名单控制显隐，并保留可参与内部布局的状态
     */
    updatedNodes = applyDomainVerticalVisibility(updatedNodes, {
      domainWhitelist,
      subDomainWhitelist: subWhitelist,
      generateDomainGroups: showDomain,
      generateSubDomainGroups: showSub,
    });

    // 语义处理由阶段一管线统一执行：注入→归一→绑定→审计


    const domains = collectDomainVerticalDomainOrder(
      updatedNodes,
      (options as any)?.domainOrder,
    );
    /**
     * 函数级注释：域容器稳定排序索引
     * - 来源：按输入数据结构出现顺序或 options.domainOrder 构建的域顺序
     * - 作用：在所有“顶对齐/堆叠/间距统一”阶段，使用稳定顺序避免因几何变化导致的显示顺序漂移
     */
    // 容器类型统一集合（函数级注释）
    // 用于统一域宽、左锚、垂直堆叠等阶段，确保所有域容器类型均参与计算
    const CONTAINER_TYPES = new Set(['titleGroup', 'domain', 'group']);

    // injectSemanticSubGroupsForMissingKeys 和 rebindChildrenNormalized 已提取至 shared/semanticHelpers.ts

    /**
     * 函数级注释：按最大列数进行横排并换行
     * - 目的：当域内存在多个子域时，控制每行最多元素数并进行换行
     */


    let cursorYGlobal = num((options as any)?.padding?.top, 80);
    const targetWGlobal = num(((options as any)?.containerSize?.width), num((cfg?.diagram?.container?.width), 1200));
    /**
     * 函数级注释：统一左锚并取整
     * - 目的：消除子像素导致的视觉不齐，所有域左锚统一为整数像素
     */
    const anchorLeftGlobal = Math.round(num((options as any)?.padding?.left, Math.max(40, num((cfg?.diagram?.padding?.left), 40))));
    // 节点布局策略归一化（函数级注释）
    // 目的：统一映射到 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre'
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



    /** 函数级注释：阶段一（注入→归一→严格布局→回收→统一）
     * - 注入缺失子域容器、规范化 children 归属
     * - 按选定节点布局策略对子域 children 严格排布
     * - 回收子域容器尺寸，并按域统一子域宽度与左锚
     */
    updatedNodes = purgeSubGroupChildrenBySemantic(updatedNodes) as any;
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes) as any;
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes) as any;
    {
      /**
       * 函数级注释：阶段一同点散列（子域 children）
       * - 目标：在严格布局之前，对属于同一子域且初始坐标相同的业务节点进行轻量散列，避免早期视觉重叠；
       * - 规则：按 x 轴散列，间距使用 hGapDet 的下限；仅调整 position，不改变 measured。
       */
      const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        const list = ch
          .map(id => idm.get(id))
          .filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
        if (list.length >= 2) scatterNodesAtSamePoint(list as any, 'x', Math.max(12, hGapDet), 2);
      }

    }
    updatedNodes = rebindChildrenNormalized(updatedNodes) as any;
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes) as any;
    // 对于 dagre 布局，使用 reflowSubGroupChildrenDagre；其他布局使用 enforceSubGroupChildrenLayoutStrict
    // 重要：在 dagre 布局之前确保节点尺寸已计算完成，否则投影会使用错误的默认尺寸
    updatedNodes = ensureMeasuredForNodes(updatedNodes);
    if (nodeLayoutName === 'dagre') {
      updatedNodes = preprocessDomainVerticalDagreSubGroups(updatedNodes, edges, {
        direction: (options as any)?.direction
          || (cfg as any)?.diagram?.layout?.direction
          || 'TB',
        horizontalGap: hGapDet,
        verticalGap: nodeV,
        reflowSubGroup: reflowSubGroupChildrenDagre,
        resolveStrict: (currentNodes, horizontalGap, verticalGap) =>
          resolveSubGroupChildrenOverlapsStrict(
            currentNodes as any,
            horizontalGap,
            verticalGap,
          ) as any,
        recomputeContainers: currentNodes =>
          recomputeSubGroupContainersBasic(currentNodes) as any,
      });
    }

    const allTitleGroupsHidden = areAllTitleGroupDomainsHidden(updatedNodes);

    // dagre 布局后的子域垂直堆叠：把子域作为整体，在每个域内垂直排布
    {
      const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      safeLog.debug(`[DOMAIN-HIDDEN-CHECK] allDomainsHidden=${allTitleGroupsHidden}`);

      if (!allTitleGroupsHidden) {
        // [STANDARD PIPELINE]
        if (nodeLayoutName === 'dagre') {
          const globalPadLeft = num((options as any)?.padding?.left, 40);
          const globalPadTop = num((options as any)?.padding?.top, 80);
          const domainPadH = num(cfg?.domain?.padding?.horizontal, 24);
          const domainPadV = num(cfg?.domain?.padding?.vertical, 16);
          const dagreDomainGap = 48;
          const subGroupGap = num(cfg?.subDomain?.margin?.bottom, 24);
          const dagreTitleHeight = num(cfg?.domain?.title?.height, 48);
          const dagreTitlePadding = num(cfg?.domain?.title?.padding?.vertical, 12);
          const dagreTitleSafeGap = num(cfg?.domain?.title?.safeGap, 16);

          updatedNodes = reconstructDomainVerticalDagreLayout(updatedNodes, {
            paddingLeft: globalPadLeft,
            paddingTop: globalPadTop,
            domainPaddingHorizontal: domainPadH,
            domainPaddingVertical: domainPadV,
            domainGap: dagreDomainGap,
            subGroupGap,
            domainTitleHeight: dagreTitleHeight,
            domainTitlePaddingVertical: dagreTitlePadding,
            domainTitleSafeGap: dagreTitleSafeGap,
            domainOrder: domains,
          });
          updatedNodes = syncDagreChildPositions(updatedNodes);
          updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
          updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;
          updatedNodes = centerProjectedDagreSubGroups(updatedNodes, {
            domainPaddingHorizontal: domainPadH,
            subGroupGap,
          });
        }

      }




      // 子域垂直堆叠后，同步 dagre 子节点位置，确保 __dagreRel 与实际位置一致
      // dagre 模式跳过：reflowSubGroupChildrenDagre 已精确计算容器尺寸
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;
      }
      /**
       * 函数级注释：尺寸刷新优先（投影与消重前）
       * - 目标：在阶段一的严格布局与容器回收完成后，先刷新 measured，保证后续严格消重使用准确尺寸。
       */
      updatedNodes = ensureMeasuredForNodes(updatedNodes);
      updatedNodes = resolveSubGroupChildOverlapsByMode(updatedNodes, {
        layout: nodeLayoutName,
        horizontalGap: Math.max(12, hGapDet),
        verticalGap: Math.max(8, nodeV),
        fallbackChildWidth: nodeLayoutMetrics.minimumWidth,
        resolveStrict: (currentNodes, horizontalGap, verticalGap) =>
          resolveSubGroupChildrenOverlapsStrict(
            currentNodes as any,
            horizontalGap,
            verticalGap,
          ) as any,
        recomputeContainers: currentNodes =>
          recomputeSubGroupContainersBasic(currentNodes) as any,
      });
      /**
       * 函数级注释：确保节点与子域容器 measured 完整后再投影
       * - 目标：在严格布局与回收后，强制刷新节点与容器的 measured，避免以旧值参与宽度投影
       */
      updatedNodes = ensureMeasuredForNodes(updatedNodes);
      /**
       * 函数级注释：子域高度按投影（保留锚点）
       * - 目标：以 children 的最大下缘为准回收子域高度，同时不改变当前锚点，避免后续左锚与推开受影响
       * - dagre 模式跳过：dagre 已精确计算尺寸，不需要再次投影
       */
      if (!pipelineControls.lockSubGroupHeights && nodeLayoutName !== 'dagre') {
        updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
      }
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as any;
        updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
      }
      /**
       * 函数级注释：阶段一同域子域高度统一
       * - 目标：在严格布局与尺寸回收完成后，按域取该域内子域容器的最大高度，并将同域子域高度统一为该值，确保横排视觉对齐
       * - 规则：保留当前锚点（position.y 不变）；不平移 children；仅更新子域容器的 style/measured/height
       * - dagre 模式跳过：子域是垂直堆叠的，不需要高度统一
      */
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = equalizeVisibleSubGroupHeightsByDomain(
          updatedNodes,
          subTitleH + subTitleV + subPadTop + subBottomSafe,
        );
      }

      /**
       * 函数级注释：阶段一子域顶端对齐（垂直策略）
       * - 目标：子域容器的顶部对齐到域内容区的 innerTop，避免在阶段一出现左右锚统一造成的误解
       * - dagre 模式跳过：dagre 已在前面正确处理了垂直堆叠
       */
      if (nodeLayoutName !== 'dagre') {
        const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of tgs) {
          // 跳过隐藏的域容器
          if ((dc as any)?.data?.hidden) continue;
          const dId = String((((dc as any).data?.domain || '')));
          const dy = num(((dc as any)?.position?.y), 0);
          const innerTop = dy + titleH + titleV + titleSafe;
          const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
          for (const sg of sgs) {
            const sx = num(((sg as any)?.position?.x), 0);
            const newY = Math.round(innerTop - effectiveTopPad());
            (sg as any).position = { x: sx, y: newY } as any;
          }
        }
      }
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = enforceSubGroupTitleClearance(updatedNodes) as any;
      }
      {
        updatedNodes = snapshotVisibleSubGroupChildOriginOffsets(updatedNodes);
        /**
         * 函数级注释：阶段一子域专用重排（按布局类型，无折行）
         * - 目标：在记录 __rel 后，按节点布局选择进行一次重排；horizontal/centered 不做可用宽度折行，保持线性横排；
         * - 行为：vertical→reflowSubGroupChildrenVertical；grid→reflowSubGroupChildrenGrid；horizontal/centered→layoutHorizontal；随后仅回收容器尺寸与按投影回收子域尺寸。
         */
        // dagre 布局已在前面计算完成，跳过整个阶段一重排以保留分层结构
        if (nodeLayoutName === 'dagre') {
          // dagre：跳过容器尺寸回收，因为 reflowSubGroupChildrenDagre 已精确计算
          // 注意：recomputeSubGroupContainersBasic 会用错误的 minHeight=200 覆盖正确的尺寸
        } else {
          const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
          const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
          for (const sg of sgs) {
            const list = collectVisibleSubGroupChildren(sg, idm);
            if (!list.length) continue;
            layoutSubGroupChildren(sg, list, effectiveTopPad());
            if (nodeLayoutName === 'vertical') {
              try {
                const tg = updatedNodes.find(nn => String(nn.type || '') === 'titleGroup' && String((((nn as any)?.data?.domain || ''))) === String(((sg as any)?.data?.domain || '')));
                if (tg) {
                  const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
                  const tgX = numLocal(((tg as any)?.position?.x), 0);
                  const tgW = numLocal((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
                  const innerLeftDom = tgX + Math.max(subPadH, 0);
                  const domainInnerW = Math.max(1, tgW - Math.max(subPadH, 0) * 2);
                  const centerXDom = innerLeftDom + domainInnerW / 2;
                  const sgPos = (sg as any)?.position || { x: 0, y: 0 } as any;
                  const innerLeft = numLocal(sgPos.x, 0) + Math.max(subPadH, 0);
                  const innerRight = numLocal(sgPos.x, 0) + numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0) - Math.max(subPadH, 0);
                  for (const n of list) {
                    const w = numLocal(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), nodeLayoutMetrics.minimumWidth);
                    const y = numLocal(((n as any)?.position?.y), 0);
                    const desired = Math.round(centerXDom - w / 2);
                    const clamped = Math.min(Math.max(desired, innerLeft), Math.max(innerLeft, innerRight - w));
                    (n as any).position = { x: clamped, y } as any;
                  }
                }
              } catch {
                // ignore
              }
            }
          }
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
          updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as any;
          updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
          updatedNodes = equalizeVisibleSubGroupHeightsByDomain(
            updatedNodes,
            subTitleH + subTitleV + subPadTop + subBottomSafe,
          );
        }
      }

      /** 函数级注释：阶段停靠（phase1）
       * - 依据配置或 options.stopAfterPhase，可在阶段一结束时提前返回，便于对齐水平策略的调试体验
       */
      if (stopAfterPhase === 'phase1') return { nodes: updatedNodes, edges } as any;
      const layoutHorizontal = (
        list: ReactFlowNode[],
        left: number,
        right: number,
        startY: number,
      ) => layoutNodesHorizontally(list, left, right, startY, nodeLayoutMetrics);
      const layoutVertical = (
        list: ReactFlowNode[],
        left: number,
        _right: number,
        startY: number,
      ) => layoutNodesVertically(list, left, startY, nodeLayoutMetrics);
      const fixChildOverlaps = (
        list: ReactFlowNode[],
        layout: 'horizontal' | 'vertical' | 'grid' | 'centered' | 'dagre',
      ) => resolveNodeOverlapsByLayout(list, layout, nodeLayoutMetrics);
      const layoutGrid = (
        list: ReactFlowNode[],
        left: number,
        right: number,
        startY: number,
        columns?: number,
      ) => layoutNodesInGrid(
        list,
        left,
        right,
        startY,
        columns,
        nodeLayoutMetrics,
      );
      // 检测是否所有域容器都隐藏（或没有域容器）- 如果是则跳过域行布局，保留紧凑堆叠结果
      // 注意：与 dagre 分支的 allDomainsHidden 条件保持一致
      // dagre 布局模式也跳过域内循环：dagre 分支已在前面正确处理了子域的垂直堆叠
      if (!allTitleGroupsHidden && nodeLayoutName !== 'dagre') {
        for (const d of domains) {
          const tg = updatedNodes.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === d);
          if (!tg) continue;
          (tg as any).position = { x: anchorLeftGlobal, y: num(((tg as any)?.position?.y), 0) } as any;
          const laneLeft = anchorLeftGlobal + padH;
          let tgW = num(((tg as any)?.measured?.width ?? (tg as any)?.style?.width), 0);
          if (!(tgW > 0)) tgW = targetWGlobal;
          ((tg as any).style || ((tg as any).style = {})).width = tgW;
          (tg as any).measured = { width: tgW, height: num(((tg as any)?.measured?.height ?? (tg as any)?.style?.height), titleH + titleV + titleSafe) } as any;
          const laneRightLayout = laneLeft + Math.max(1, tgW) - padH;
          const posY = cursorYGlobal;
          (tg as any).position = { x: num(((tg as any)?.position?.x), 0), y: posY } as any;
          const innerTop = posY + titleH + titleV + titleSafe;
          const subGroups = collectOrderedDomainSubGroups(
            updatedNodes,
            d,
            orderKeyOf,
          );
          // 域内初次横排：仅对子域容器进行显式顺序摆放，避免自由节点干扰子域左右顺序
          if (nodeLayoutName === 'vertical') {
            placeRowNoWrap(subGroups as any, laneLeft, innerTop);
          } else {
            placeRowWrap(subGroups as any, laneLeft, laneRightLayout, innerTop);
          }

          updatedNodes = layoutInitialSubGroupsInDomain(updatedNodes, {
            domainKey: d,
            subGroupHorizontalPadding: subPadH,
            topPadding: effectiveTopPad(),
            bottomPadding: subBottomSafe,
            horizontalGap: Math.max(12, hGapDet),
            verticalGap: Math.max(8, nodeV),
            fallbackChildWidth: 240,
            fallbackChildHeight: 80,
            layoutChildren: (subGroup, children) =>
              layoutSubGroupChildren(subGroup, children, effectiveTopPad()),
            packChildren: (subGroup, children, horizontalGap, verticalGap) =>
              packSubGroupChildrenRigid(
                subGroup as any,
                children as any,
                horizontalGap,
                verticalGap,
              ) as any,
            scatterCoincidentChildren: (children, horizontalGap) =>
              scatterNodesAtSamePoint(
                children as any,
                'x',
                horizontalGap,
                2,
              ),
            resolveChildOverlaps: children =>
              fixChildOverlaps(children, nodeLayoutName),
          });
          updatedNodes = finalizeInitialSubGroupLayout(updatedNodes, {
            layout: nodeLayoutName,
            domainHorizontalPadding: padH,
            subGroupHorizontalPadding: subPadH,
            horizontalGap: hGapDet,
            verticalGap: nodeV,
            compactVerticalGap: subGroupVGapCompact,
            fallbackSubGroupWidth: Math.max(240, nodeLayoutMetrics.minimumWidth),
            resolveChildOverlapsStrict: (currentNodes, horizontalGap, verticalGap) =>
              resolveSubGroupChildrenOverlapsStrict(
                currentNodes as any,
                horizontalGap,
                verticalGap,
              ) as any,
            recomputeContainers: currentNodes =>
              recomputeSubGroupContainersBasic(currentNodes) as any,
            resolveSubGroupOverlaps: (currentNodes, horizontalGap, verticalGap) =>
              resolveSubGroupOverlaps(
                currentNodes,
                horizontalGap,
                verticalGap,
              ) as any,
          });

          const domainProjection = projectSingleDomainContainer(updatedNodes, {
            containerId: tg.id,
            domainKey: d,
            left: anchorLeftGlobal,
            top: posY,
            memberFallbackLeft: laneLeft,
            memberFallbackTop: innerTop,
            horizontalPadding: padH,
            sideSafeGap,
            widthCompensation,
            headerHeight: titleH + titleV + titleSafe,
            bottomSafeGap: bottomSafe + bottomSafeGap,
            extraVerticalPadding: num(cfg?.domain?.padding?.vertical, 0),
            domainGap: domainGapEff,
            defaultMemberWidth: 240,
            defaultMemberHeight: 80,
          });
          updatedNodes = domainProjection.nodes;
          cursorYGlobal = domainProjection.nextTop;
        }
      } else {
        // 所有域隐藏时（非 dagre 模式）：对所有可见子域进行全局紧凑垂直堆叠
        // 与 dagre 模式下 allDomainsHidden 分支保持一致
        updatedNodes = layoutHiddenDomainSubGroups(updatedNodes, {
          layout: nodeLayoutName,
          top: num((options as any)?.padding?.top, 80),
          gap: 48,
          anchorLeft: anchorLeftGlobal,
          horizontalPadding: subPadH,
          topPadding: effectiveTopPad(),
          bottomPadding: subBottomSafe,
          fallbackSubGroupWidth: 480,
          fallbackChildWidth: 240,
          fallbackChildHeight: 80,
          layoutChildren: (layout, children, left, right, top) => {
            if (layout === 'grid') {
              layoutGrid(children, left, right, top, 3);
            } else if (layout === 'vertical') {
              layoutVertical(children, left, right, top);
            } else {
              layoutHorizontal(children, left, right, top);
            }
          },
        });
      } // end else - 所有域隐藏时的全局子域紧凑垂直堆叠



      updatedNodes = projectAndUnifyDeterministicDomainWidths(updatedNodes, {
        containerTypes: CONTAINER_TYPES,
        anchorLeft: anchorLeftGlobal,
        horizontalPadding: padH,
        subGroupGap: nodeH,
        freeNodeGap: hGapDet,
        defaultMemberWidth: 240,
        fallbackContainerHeight:
          titleH + titleV + titleSafe + bottomSafe,
      });

      // 统一域左边界坐标（增强版对齐列左边，函数级注释）
      // - 目标：所有域容器的左边界 x 严格对齐为统一值（anchorLeftGlobal），避免任何残差；同步平移该域的所有成员，包括子域和节点
      // - 增强：添加强制校正检查，如果任何域的 position.x 不等于 anchorLeftGlobal，则递归平移；这确保在布局切换或尺寸变化后左对齐生效
      // - 兼容布局管道：此步骤在统一域宽后执行，不干扰节点布局 → 子域投影 → 域投影 → 单次包含/钳制顺序
      updatedNodes = alignDomainsToLeftAnchor(updatedNodes, {
        left: anchorLeftGlobal,
        containerTypes: CONTAINER_TYPES,
      });

      updatedNodes = finalizeDomainInternalLayout(updatedNodes, {
        layout: nodeLayoutName,
        containerTypes: CONTAINER_TYPES,
        anchorLeft: anchorLeftGlobal,
        domainHorizontalPadding: padH,
        domainHeaderHeight: titleH + titleV + titleSafe,
        domainBottomPadding:
          bottomSafe + num(cfg?.domain?.padding?.vertical, 0),
        subGroupHorizontalPadding: subPadH,
        subGroupHeaderHeight: subTitleH + subTitleV + subPadTop,
        subGroupBottomPadding: subBottomSafe,
        nodeHorizontalGap: nodeH,
        nodeVerticalGap: nodeV,
        subGroupGap: hGapDet,
        defaultNodeWidth: 240,
        defaultNodeHeight: 80,
        orderOf: orderKeyOf,
        layoutHorizontal,
        layoutVertical,
        layoutGrid: (children, left, right, top, columns) =>
          layoutGrid(children, left, right, top, columns),
        resolveChildOverlaps: fixChildOverlaps,
      });

      /**
       * 函数级注释：将域内自由业务节点下推到子域横排之下
       * - 目的：在“子域与自由节点混排横排”后，确保同域内的普通业务节点位于子域行的下方，避免与子域容器发生垂直重叠
       * - 时机：终态内部重排与域宽统一后，进行一次全域遍历下推，再进入后续的垂直防重叠与堆叠收敛
       */
      updatedNodes = pushFreeNodesBelowSubGroupRow(updatedNodes) as any;
      updatedNodes = resolveFreeNodeOverlapsInDomain(updatedNodes, Math.max(12, subPadH), Math.max(8, nodeV)) as any;

      // 二次垂直防重叠确认（函数级注释）
      // - 统一域宽后再执行一次垂直防重叠，确保最终高度与间隙满足要求（包含阴影安全）
      updatedNodes = stackDomainsVerticallyRigid(updatedNodes, {
        top: num((options as any)?.padding?.top, 0),
        gap: domainGapEff,
        domainOrder: domains,
        containerTypes: CONTAINER_TYPES,
        mode: 'push-down',
        fallbackHeight: titleH + titleV + titleSafe + bottomSafe,
      });

      // 最终域垂直堆叠收敛（函数级注释）
      // - 目标：无条件按顺序使域容器顶部单调递增，保证最小间隙（domainGap + shadowPad），彻底消除轻微贴边
      // - 方法：按 y 升序遍历域容器，赋值当前域的目标 top = max(当前 top, 上一域 bottom + domainGap + shadowPad)，并同步平移域成员
      updatedNodes = stackDomainsVerticallyRigid(updatedNodes, {
        top: num((options as any)?.padding?.top, 0),
        gap: domainGapFinal,
        domainOrder: domains,
        containerTypes: CONTAINER_TYPES,
        fallbackHeight: titleH + titleV + titleSafe + bottomSafe,
      });

      // 终态域尺寸回收（函数级注释）
      // 目的：左对齐/统一宽/堆叠与钳制之后，按最终成员投影回收各域容器高度，确保“严格包含 + 呼吸感”
      // Dagre 模式跳过：已经精确计算，防止误重置
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = projectDomainHeightsFromVisibleMembers(updatedNodes, {
          titleHeight: titleH,
          titleVerticalPadding: titleV,
          titleSafeGap: titleSafe,
          bottomSafeGap: bottomSafe,
          defaultMemberHeight: 80,
          containerTypes: CONTAINER_TYPES,
          left: anchorLeftGlobal,
          extraVerticalPadding: num((cfg?.domain?.padding?.vertical), 0),
        });
      }

      // 域内整体水平居中（函数级注释）
      // 目的：在统一域宽且左对齐后，保证域内所有成员（子域与未归属子域的节点）在域内部水平范围内整体居中，减少偏向一侧导致的溢出
      // 行为：计算域内部成员的最终水平投影，按域内部允许宽度做整体 dx 平移
      updatedNodes = centerVisibleDomainMembersHorizontally(updatedNodes, {
        horizontalPadding: padH,
        containerTypes: CONTAINER_TYPES,
        fallbackMemberWidth: 240,
      });


      // 最终严格包含收敛（函数级注释）
      // 目的：在整体居中后，对子域容器与其 children 进行垂直/水平再次钳制，确保完全落在域内部边界；随后再按最终投影回收域高度


      // 终态垂直单调堆叠（函数级注释）
      // 目的：在终态域尺寸回收后，再次确保所有域容器按“上一域 bottom + 有效间隙 + 阴影安全”单调堆叠，彻底统一对齐与呼吸感
      // Dagre 模式跳过：Phase 1 已完成堆叠
      if (nodeLayoutName !== 'dagre') {
        // [FIX] 堆叠前必须再次确认域高度，确保使用最新的投影高度进行堆叠计算
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;

        updatedNodes = stackDomainsVerticallyRigid(updatedNodes, {
          top: num((options as any)?.padding?.top, 0),
          gap: domainGapEff,
          sortBy: 'position',
          fallbackHeight: titleH + titleV + titleSafe + bottomSafe,
        });
      }

      // 终态左锚强制确认（函数级注释）
      // 目的：在全部收敛之后，以“当前最小左边界”为统一锚点，确保所有域容器左边界严格一致；同步平移该域成员与子域 children
      updatedNodes = alignDomainsToLeftAnchor(updatedNodes, {
        left: anchorLeftGlobal,
        containerTypes: CONTAINER_TYPES,
      });

      /**
       * 函数级注释：域容器投影回收（严格几何）
       * - 宽度按域内成员最终右缘投影并在所有域间统一；
       * - 高度按成员最终下缘逐域回收；隐藏成员仍参与这一严格包含阶段。
       */
      updatedNodes = projectAndUnifyDomainContainerBounds(updatedNodes, {
        containerTypes: CONTAINER_TYPES,
        horizontalPadding: padH,
        titleHeight: titleH,
        titleVerticalPadding: titleV,
        titleSafeGap: titleSafe,
        bottomSafeGap: bottomSafe,
        defaultMemberWidth: 240,
        defaultMemberHeight: 80,
        fallbackContainerHeight: titleH + titleV + titleSafe + bottomSafe,
      });

      /**
       * 函数级注释：保持混排序列
       * - 目的：不触发“子域行打包”与“自由节点置底”的再排，保留原始顺序混排结果
       */
      updatedNodes = enforceDomainContainerStrictContainment(updatedNodes) as any;
      /**
       * 函数级注释：同域子域容器最终水平推开（迭代收敛）
       * - 目标：在统一域宽与钳制之后，确保同域子域容器在单行内不相互覆盖；按“前一右缘 + hGapDet”单调推进，最多迭代 5 次
       * - 行为：每次迭代按 x 升序推开容器，并将 children 刚体同步；随后回收容器尺寸；若无位移变化则提前结束
       */
      const subGroupPushSafeEdgeBase = nodeLayoutName === 'grid'
        ? Math.max(4, Math.floor(hGapDet * 0.2))
        : Math.max(12, hGapDet);
      updatedNodes = separateSubGroupsAndExpandDomainsIteratively(
        updatedNodes,
        {
          layout: nodeLayoutName,
          domainHorizontalPadding: padH,
          subGroupHorizontalPadding: subPadH,
          horizontalGap: hGapDet,
          iterations: layeredCfg.get<number>(
            'diagram.layout.subGroupPush.iterations' as any,
            5,
          ),
          safeEdge: layeredCfg.get<number>(
            'diagram.layout.subGroupPush.safeEdge' as any,
            subGroupPushSafeEdgeBase,
          ),
          defaultSubGroupWidth: Math.max(
            240,
            nodeLayoutMetrics.minimumWidth,
          ),
          defaultContainerHeight:
            titleH + titleV + titleSafe + bottomSafe,
          ensureMeasured: ensureMeasuredForNodes,
          finalizeSubGroupWidths:
            finalizeSubGroupWidthsByProjectionPreserveAnchor,
          recomputeSubGroups: recomputeSubGroupContainersBasic,
          separate: separateVisibleSubGroupsHorizontally,
        },
      );
      updatedNodes = resolveDomainContainerOverlaps(updatedNodes, domainGapFinal) as any;


      // Grid 容器二次“域宽感知”回收：按域的可用内宽计算子域的列容量并重排 children，再回收容器
      if (nodeLayoutName === 'grid') {
        updatedNodes = recoverGridSubGroupsByDomainWidth(updatedNodes, {
          domainHorizontalPadding: num(cfg?.domain?.padding?.horizontal, 24),
          subGroupHorizontalPadding: num(
            cfg?.subDomain?.padding?.horizontal
              ?? cfg?.subGroup?.padding?.horizontal
              ?? layoutCfg?.SUB_GROUP_PADDING?.H,
            Math.max(16, Math.floor(padH * 0.8)),
          ),
          subGroupTopPadding: num(
            cfg?.subDomain?.padding?.top
              ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP
              ?? cfg?.subGroup?.padding?.top
              ?? cfg?.subGroup?.padding?.vertical,
            Math.max(12, Math.floor(padH * 0.8)),
          ),
          subGroupTitleHeight: num(
            cfg?.subDomain?.title?.height ?? cfg?.subGroup?.title?.height,
            28,
          ),
          subGroupTitleVerticalPadding: num(
            cfg?.subDomain?.title?.padding?.vertical
              ?? cfg?.subGroup?.title?.padding?.vertical,
            8,
          ),
          bottomSafeGap: num(
            cfg?.subDomain?.padding?.bottom
              ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM_SAFE
              ?? cfg?.subGroup?.padding?.bottom
              ?? cfg?.subGroup?.padding?.vertical,
            12,
          ),
          horizontalGap: hGapDet,
          verticalGap: nodeV,
          defaultChildWidth: 120,
          defaultChildHeight: 80,
          compareSubGroups: (left, right) => orderKeyOf(left) - orderKeyOf(right),
          layoutGrid,
        });
      }

      updatedNodes = finalizePhaseTwoSubGroupLayout(updatedNodes, {
        layout: nodeLayoutName,
        top: num((options as any)?.padding?.top, 0),
        domainGap: domainGapFinal,
        domainOrder: domains,
        domainHorizontalPadding: padH,
        subGroupHorizontalPadding: subPadH,
        subGroupTopPadding: subTitleH + subTitleV + subPadTop,
        horizontalGap: hGapDet,
        verticalGap: nodeV,
        compactVerticalGap: subGroupVGapCompact,
        fallbackContainerHeight: titleH + titleV + titleSafe + bottomSafe,
        fallbackSubGroupWidth: Math.max(240, nodeLayoutMetrics.minimumWidth),
        orderOf: orderKeyOf,
        layoutChildren: layoutSubGroupChildren,
        operations: {
          purgeSemanticChildren: purgeSubGroupChildrenBySemantic,
          assignSemanticChildren: assignChildrenToSubGroupsBySemantic,
          recomputeSubGroups: recomputeSubGroupContainersBasic,
          finalizeSubGroupWidths:
            finalizeSubGroupWidthsByProjectionPreserveAnchor,
          finalizeSubGroupHeights:
            finalizeSubGroupHeightsByProjectionPreserveAnchor,
          enforceSubGroupContainment:
            enforceSubGroupStrictContainmentByChildren,
          expandSubGroupsBySemantic: expandSubGroupContainersBySemantic,
          resolveSubGroupOverlaps,
          enforceDomainContainment:
            enforceDomainContainerStrictContainment,
          resolveFreeNodeOverlaps: resolveFreeNodeOverlapsInDomain,
          finalizeDomainWidths: finalizeDomainWidthsByProjection,
          unifySubGroupWidths: unifySubGroupWidthsByDomain,
          unifySubGroupGaps: unifySubGroupGapsInDomain,
          unifySubGroupHeights: unifySubGroupHeightsByDomain,
          clampDomainHeights: clampDomainHeightsToSubGroups,
        },
      });

      // 终态再次统一域宽（函数级注释：严格包含与钳制后，按最终成员水平投影扩展域宽）
      updatedNodes = projectAndUnifySemanticDomainWidths(updatedNodes, {
        containerTypes: CONTAINER_TYPES,
        horizontalPadding: padH,
        extraRightPadding: Math.max(16, Math.floor(hGapDet * 0.65)),
        defaultMemberWidth: 240,
        fallbackContainerHeight: titleH + titleV + titleSafe + bottomSafe,
        preserveCurrentWidth: true,
      });
      // 函数级注释：在节点布局为 vertical 时禁用域内容水平缩放（不适配水平拉伸）
      if (fitDomainContent && nodeLayoutName !== 'vertical') {
        // 单子域域不做等比铺满，避免拉伸导致视觉异常与误判重叠
        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        const hasMultipleSubGroups = domainsList.some(dc => {
          const dId = String((((dc as any).data?.domain || '')));
          const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
          return sgs.length >= 2;
        });
        // 函数级注释：vertical 模式禁用域内容水平缩放（多子域分支）
        // - 目的：避免在垂直节点布局下对子域与孩子进行水平等比缩放，导致孩子 x 发生整体漂移
        if (!constantGapMode && hasMultipleSubGroups && fitDomainContent) {
          updatedNodes = scaleDomainContentToFitWidthAll(updatedNodes) as any;
        }
      }
      updatedNodes = enforceDomainContainerStrictContainment(updatedNodes) as any;
      // 终态统一子域间距（后置）：在所有可能改变 X/width 的步骤之后执行一次，确保像素级统一
      {
        const gapHUnifiedFinal = Math.max(8, Math.floor(hGapDet * 0.6));
        const gapVUnifiedFinal = Math.max(6, Math.floor(nodeV * 0.6));
        updatedNodes = unifySubGroupGapsInDomain(updatedNodes, gapHUnifiedFinal, gapVUnifiedFinal, (a, b) => orderKeyOf(a) - orderKeyOf(b)) as any;
        // dagre 模式跳过：保留 dagre 精确计算的子域尺寸
        if (nodeLayoutName !== 'dagre') {
          updatedNodes = unifySubGroupHeightsByDomain(updatedNodes) as any;
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
        }
        updatedNodes = enforceDomainContainerStrictContainment(updatedNodes) as any;
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;
      }

      /**
       * 函数级注释：子域节点重叠最终消解（参考水平策略）
       * - 目标：在所有统一与堆叠完成后，针对边缘场景进行一次终态消解，避免残留重叠。
       * - 步骤：同点最小散列 → 语义补齐与规范化重绑定 → 严格消解 → 容器回收与钳制 → 域高度投影。
      */
      {
        updatedNodes = alignDomainVerticalTerminalSubGroupChildren(
          updatedNodes,
          {
            layout: nodeLayoutName,
            horizontalGap: nodeH,
            handlers: {
              alignHorizontal: (children, subGroup) =>
                layoutSubGroupChildrenInRow(
                  children,
                  subGroup,
                  layoutCfg,
                  cfg,
                ),
              scatterHorizontally: (children, minimumGap) =>
                scatterNodesAtSamePoint(
                  children as any,
                  'x',
                  minimumGap,
                  2,
                ),
              alignVerticalStack: alignSubGroupStack,
              alignGridRows: alignSubGroupGridRows,
            },
          },
        );
        // dagre 模式跳过：避免覆盖精确计算的子域尺寸
        if (nodeLayoutName !== 'dagre') {
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
          updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
        }
        // dagre 模式跳过：子域高度统一，因为 dagre 子域是垂直堆叠的
        if (nodeLayoutName !== 'dagre') {
          updatedNodes = equalizeVisibleSubGroupHeightsByDomain(
            updatedNodes,
            subTitleH + subTitleV + subPadTop + subBottomSafe,
          );
        }
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;
      }


      /**
       * 函数级注释：最终域垂直堆叠强制收敛
       * - 目标：在所有“严格包含/钳制/统一宽”之后，保证各域容器之间至少保留 `domainGapEff` 的留白；
       * - 行为：以首个显式顺序域的当前位置为锚，刚性平移每个域及其成员。
       */
      updatedNodes = stackDomainsVerticallyRigid(updatedNodes, {
        gap: domainGapEff,
        domainOrder: domains,
        anchor: 'first-current',
        fallbackHeight: titleH + titleV + titleSafe + bottomSafe,
      });
      /** 函数级注释：阶段停靠（phase2）
       * - 若配置为在阶段二结束时提前返回，则此处直接返回当前稳定结果
       */
      if (stopAfterPhase === 'phase2') return { nodes: updatedNodes, edges } as any;
      updatedNodes = projectDomainHeightsFromVisibleMembers(updatedNodes, {
        titleHeight: titleH,
        titleVerticalPadding: titleV,
        titleSafeGap: titleSafe,
        bottomSafeGap: bottomSafe,
        defaultMemberHeight: 80,
      });
      // 子域容器高度最终按投影精确回收，随后再回收域高度
      updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
      // 钳制一次，确保子域 children 与域内部边界都严格包含（按需）
      updatedNodes = clampSubGroupsToDomainHorizontalInsets(updatedNodes, {
        layout: nodeLayoutName,
        domainHorizontalPadding: padH,
        subGroupHorizontalPadding: subPadH,
        horizontalGap: hGapDet,
        defaultSubGroupWidth: Math.max(240, nodeLayoutMetrics.minimumWidth),
        orderOf: orderKeyOf,
      });
      updatedNodes = projectDomainHeightsFromVisibleMembers(updatedNodes, {
        titleHeight: titleH,
        titleVerticalPadding: titleV,
        titleSafeGap: titleSafe,
        bottomSafeGap: bottomSafe,
        defaultMemberHeight: 80,
      });
      // 域宽度最终按投影精确回收（保留左锚）
      // 警告：finalizeDomainWidthsByProjection 仅基于 maxRight - minLeft 计算，
      // 如果子域偏离了左边界，会导致域宽收缩而不包括左空白。
      // 因此此处禁用，改用前文的 maxRight - domX 投影。
      // 最终统一域宽（函数级注释：按所有域的最大需求宽度统一，保留左锚）
      updatedNodes = unifyContainerWidthsByMaximum(
        updatedNodes,
        new Set(['titleGroup']),
        titleH + titleV + titleSafe + bottomSafe,
      );
      // 统一域宽后再次进行“域内容等比缩放”，确保铺满最终容器宽度
      // 函数级注释：在节点布局为 vertical 时禁用域内容水平缩放（不适配水平拉伸）
      if (fitDomainContent && nodeLayoutName !== 'vertical' && !constantGapMode) {
        updatedNodes = scaleDomainContentToFitWidthAll(updatedNodes) as any;
      }

      // 终态仅回收容器尺寸（不做钳制）：保持“自内而外”的布局收敛
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
      }

      // 最终终末统一：子域间距+高度统一，并回收与严格包含（确保为最后执行）
      {
        const gapHUnifiedFinal = Math.max(8, Math.floor(hGapDet * 0.6));
        const gapVUnifiedFinal = Math.max(6, Math.floor(nodeV * 0.6));
        updatedNodes = unifySubGroupGapsInDomain(updatedNodes, gapHUnifiedFinal, gapVUnifiedFinal, (a, b) => orderKeyOf(a) - orderKeyOf(b)) as any;

        // Recompute to fit content before forcing unified height
        // dagre 模式跳过：保留 dagre 精确计算的子域尺寸
        if (nodeLayoutName !== 'dagre') {
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
          // Force unified height (expand)
          updatedNodes = unifySubGroupHeightsByDomain(updatedNodes) as any;
        }

        if (nodeLayoutName === 'horizontal' || nodeLayoutName === 'centered') {
          updatedNodes = centerSubGroupChildrenHorizontally(updatedNodes) as any;
          updatedNodes = centerSubGroupChildrenVertically(updatedNodes) as any;
          // Do NOT recompute here, to enforce unified height
        }

        updatedNodes = enforceDomainContainerStrictContainment(updatedNodes) as any;
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;
      }

      /**
       * 函数级注释：子域整体居中（终态通用路径）
       * - 时机：在所有统一宽度/间距/推开/投影/域宽回收步骤完成后执行
       * - 目标：使所有子域作为整体相对父域水平居中
       * - 规则：适用于所有节点布局模式（horizontal/vertical/grid/dagre）
       * - 修复说明：居中必须为pipeline最后一步，因为 finalizeDomainWidthsByProjection
       *   和 unifySubGroupGapsInDomain 会覆盖子域位置
       */
      updatedNodes = centerSubGroupsInDomain(updatedNodes) as any;

      /**
       * 函数级注释：边配置处理（启用容器透明）
       * - 目标：为所有边添加避障配置，使容器（domain/titleGroup/subGroup）不作为障碍物
       * - 关键参数：
       *   - intraContainerNoObstacle: true - 容器内部连线不避障
       *   - obstacleScope: 'corridor' - 仅在走廊范围内避障业务节点
       *   - obstaclePadding: 适中值，避免箭头贴边
       */
      // dagre 布局：最终同步（确保所有容器移动后子节点位置正确）
      if (nodeLayoutName === 'dagre') {
        updatedNodes = syncDagreChildPositions(updatedNodes) as any;

        // [FIX] Dagre 布局后强制刷新容器尺寸与垂直堆叠
        // 解决“域高度不足”与“子域间距异常”的核心修复
        // 根据 sync 后的子节点位置，重新计算子域容器的最小包围盒
        updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;




        // 重新计算域容器尺寸（基于子域边界框）
        updatedNodes = enforceDomainContainerStrictContainment(updatedNodes)          // [FIX] Dagre 模式下必须手动触发域尺寸投影，否则后续的垂直堆叠无法感知正确高度
        updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;

        // [FIX] 最终域垂直堆叠修正 (Final Re-Stacking)
        // `finalizeDomainHeightsByProjection` 可能增大了域高度，导致后续域被遮挡。
        // 必须基于最终高度重新计算所有域的 Y 坐标，并同步移动域内所有内容。
        updatedNodes = stackDomainsVerticallyRigid(updatedNodes, {
          top: num((options as any)?.padding?.top, 80),
          gap: 48,
          domainOrder: domains,
        });
      }
    }

    // ===== 边路由管线（已提取至 shared/edgeRoutingPipeline.ts）=====
    const finalRoutedEdges = await runEdgeRoutingPipeline(updatedNodes, edges, { layoutDirection: 'TB' });

    // ===== 最终几何包含保障（已提取至 shared/geometryGuard.ts）=====
    ensureDomainContainment(updatedNodes, 30);
    return { nodes: updatedNodes, edges: finalRoutedEdges } as any;
  }
}

export default DomainVerticalLayoutStrategy;
