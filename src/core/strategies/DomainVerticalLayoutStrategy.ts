// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../models/DiagramModels';
import type { LayoutOptions } from '../types/layout';

import { LayeredConfigManager } from '../config/LayeredConfigManager';
import { LayoutType } from '../types/layout';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import { pushFreeNodesBelowSubGroupRow, resolveDomainContainerOverlaps, scatterNodesAtSamePoint } from '../utils/layoutUtils';
import { decideEdgeRouting, separateParallelEdges, globalOptimizeEdgeRouting, bundleEdges, layerBasedEdgeRouting, optimizeEdgeLabelPositions, beautifyOrthogonalEdges, optimizeTreeBusRouting, assignGlobalPorts, distributePortConnections } from '../utils/HandlePicker';
import { ILayoutStrategy } from './LayoutStrategyManager';
import { stackSubGroupsVertically, applyDomainGrouping, applySubGrouping, assignChildrenToSubGroupsBySemantic, normalizeSubGroupDomainByChildren, enforceDomainContainerStrictContainment, recomputeSubGroupContainersBasic, purgeSubGroupChildrenBySemantic, resolveSubGroupOverlaps, resolveFreeNodeOverlapsInDomain, resolveSubGroupChildrenOverlapsStrict, expandSubGroupContainersBySemantic, enforceSubGroupStrictContainmentByChildren, finalizeSubGroupHeightsByProjectionPreserveAnchor, finalizeDomainWidthsByProjection, ensureMeasuredForNodes, normalizeMissingNodeSubDomainByDomain, finalizeSubGroupWidthsByProjectionPreserveAnchor, unifySubGroupWidthsByDomain, finalizeDomainHeightsByProjection, reflowSubGroupChildrenVertical, packSubGroupChildrenRigid, clampDomainHeightsToSubGroups, enforceSubGroupTitleClearance, reflowSubGroupChildrenGrid, unifySubGroupGapsInDomain, unifySubGroupHeightsByDomain, reflowSubGroupChildrenDagre, syncDagreChildPositions, centerSubGroupsInDomain } from '../utils/layoutUtils';
import { auditAndFixSubGroupChildrenBindings, centerSubGroupChildrenHorizontally, centerSubGroupChildrenVertically, layoutSubGroupChildrenInRow, alignSubGroupGridRows, alignSubGroupStack } from '../utils/layoutUtils';
import { routeEdgesWithELK } from '../utils/elkEdgeRouter';
import { injectSemanticSubGroupsForMissingKeys, rebindChildrenNormalized } from './shared/semanticHelpers';
import { ensureDomainContainment } from './shared/geometryGuard';
import { runEdgeRoutingPipeline } from './shared/edgeRoutingPipeline';


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
    const constantGapMode = !!LayeredConfigManager.getInstance().get<boolean>('diagram.layout.constantGapMode' as any, true);

    let updatedNodes: ReactFlowNode[] = nodes as ReactFlowNode[];
    /**
     * 函数级注释：原始顺序索引映射
     * - 目的：保留配置文件中节点出现的默认顺序，用于域内排序
     * - 规则：以进入策略前的 nodes 参数顺序建立 id→index 映射
     */
    const originalIndex = new Map<string, number>(nodes.map((n, i) => [String(n.id), i] as const));
    /**
     * 函数级注释：获取子域首次出现的原始顺序索引
     * - 输入：域键与子域键
     * - 行为：扫描原始 nodes，找到同域同子域的首个节点位置
     * - 输出：若未找到返回 Infinity
     */
    const firstIndexOfSubDomain = (domainKey: string, subKey: string): number => {
      const dTrim = String(domainKey || '').trim();
      const sTrim = String(subKey || '').trim();
      let found = Number.POSITIVE_INFINITY;
      for (let i = 0; i < nodes.length; i++) {
        const nd: any = nodes[i]?.data || {};
        const d = String(nd?.domain || '').trim();
        const s = String(((nd?.subDomain ?? nd?.subdomain) ?? nd?.metadata?.subDomain) || '').trim();
        if (d === dTrim && s === sTrim) { found = i; break; }
      }
      return found;
    };
    /**
     * 函数级注释：域内对象排序键
     * - 输入：ReactFlowNode（子域容器或业务节点）
     * - 规则：
     *   1) 业务节点：直接取其在原始 nodes 中的索引
     *   2) 子域容器：优先取其 children 的最小原始索引；
     *      若 children 为空，则按“同域下该子域在原始数据中的首次出现索引”
     * - 输出：数值排序键；不可用时返回 Infinity
     */
    /**
     * 函数级注释：域内对象排序键（支持显式子域顺序）
     * - 优先级：显式 subDomainOrder > children 最小原始索引 > 首次出现索引 > 节点原始索引
     * - subDomainOrder 形态：
     *   1) string[] 全局子域顺序
     *   2) Record<string, string[]> 按域定制的子域顺序
     */
    const subOrderOptRaw: any = (options as any)?.subDomainOrder;
    /**
     * 函数级注释：获取显式配置的子域索引（增强版）
     * - 支持全局数组 string[] 或按域对象 Record<string, string[]>
     * - 引入归一化匹配 (norm) 解决大小写、标点、空格导致的键名不一致问题
     * - 优先尝试精确匹配，失败后尝试归一化匹配
     */
    const getExplicitSubIndex = (domainKey: string, subKey: string): number => {
      try {
        const norm = (s: string) => String(s || '').toLowerCase().replace(/\u3000|\u00A0/g, '').replace(/\s+/g, '').replace(/[+_-]/g, '');
        const dTrim = String(domainKey || '').trim();
        const sTrim = String(subKey || '').trim();

        const findIdx = (arr: string[], key: string) => {
          let idx = arr.indexOf(key);
          if (idx >= 0) return idx;
          const keyNorm = norm(key);
          idx = arr.findIndex(k => norm(k) === keyNorm);
          return idx;
        };

        if (Array.isArray(subOrderOptRaw)) {
          const idx = findIdx(subOrderOptRaw, sTrim);
          return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
        }
        if (subOrderOptRaw && typeof subOrderOptRaw === 'object') {
          let arr = subOrderOptRaw[dTrim] || subOrderOptRaw[String(dTrim)];
          if (!Array.isArray(arr)) {
            const dNorm = norm(dTrim);
            const foundKey = Object.keys(subOrderOptRaw).find(k => norm(k) === dNorm);
            if (foundKey) arr = subOrderOptRaw[foundKey];
          }

          if (Array.isArray(arr)) {
            const idx = findIdx(arr, sTrim);
            return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
          }
        }
      } catch {
        // ignore
      }
      return Number.POSITIVE_INFINITY;
    };

    const orderKeyOf = (n: ReactFlowNode): number => {
      const tp = String(n.type || '');
      const data: any = (n as any)?.data || {};

      if (tp === 'subGroup') {
        // 1. 显式配置优先 (Explicit Configuration)
        const dKey = String((data?.domain || '')).trim();
        const sKeyRaw = String(((data?.description || data?.subDomain || String((n as any)?.id || '')) || '')).trim();
        const expIdx = getExplicitSubIndex(dKey, sKeyRaw);
        if (isFinite(expIdx)) return expIdx - 200000; // 最高优先级

        // 2. 语义顺序优先 (Semantic Sequence: sequence > order)
        const seqRaw = data?.sequence ?? data?.order;
        const seq = typeof seqRaw === 'number' ? seqRaw : parseFloat(seqRaw);
        if (isFinite(seq)) return seq - 100000; // 优先于自动推断

        // 3. 基于子节点位置推断 (Inferred from Children)
        const children = Array.isArray(data?.children) ? (data.children as string[]) : [];
        let idx = Number.POSITIVE_INFINITY;
        for (const cid of children) {
          const v = originalIndex.get(String(cid));
          if (typeof v === 'number') idx = Math.min(idx, v);
        }
        if (isFinite(idx)) return idx;

        // 4. 基于首次出现顺序兜底 (First Occurrence Fallback)
        const sIdx = firstIndexOfSubDomain(dKey, sKeyRaw);
        return sIdx;
      }

      // 普通节点/其他：语义顺序 > 原始索引
      const seqRaw = data?.sequence ?? data?.order;
      const seq = typeof seqRaw === 'number' ? seqRaw : parseFloat(seqRaw);
      if (isFinite(seq)) return seq - 100000;

      const id = String((n as any)?.id || '');
      const v = originalIndex.get(id);
      return (typeof v === 'number') ? v : Number.POSITIVE_INFINITY;
    };
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
      const layout = diagramConfigManager.getLayoutConfig() as any;
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
    updatedNodes = updatedNodes.map(n => {
      const clone: any = { ...n, data: { ...(n as any).data } };
      if (String(n.type || '') === 'subGroup') {
        const key = String(((clone.data?.description || clone.data?.subDomain || clone.id) || '')).trim();
        const inWhite = Array.isArray(subWhitelist) ? subWhitelist.includes(key) : false;
        const visible = showSub ? (Array.isArray(subWhitelist) ? inWhite : true) : false;
        clone.data.hidden = !visible;
      }
      if (String(n.type || '') === 'titleGroup') {
        const dKey = String(((clone.data?.domain || '') || '')).trim();
        const inWhiteDom = Array.isArray(domainWhitelist) ? domainWhitelist.includes(dKey) : false;
        const visibleDom = showDomain ? (Array.isArray(domainWhitelist) ? inWhiteDom : true) : false;
        clone.data.hidden = !visibleDom;
        clone.data.anchorLocked = true;
      }
      if (String(n.type || '') === 'domain' || String(n.type || '') === 'group') {
        clone.data.anchorLocked = true;
      }
      return clone as ReactFlowNode;
    });

    // 传播隐藏状态到子节点：如果子域被隐藏，其 children 也应该被隐藏
    {
      const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const hiddenSubGroups = updatedNodes.filter(n =>
        String(n.type || '') === 'subGroup' && !!((n as any)?.data?.hidden)
      );
      for (const sg of hiddenSubGroups) {
        const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        for (const cid of children) {
          const child = idMap.get(cid);
          if (child) {
            (child as any).data = { ...((child as any).data || {}), hidden: true };
          }
        }
      }
    }

    // 语义处理由阶段一管线统一执行：注入→归一→绑定→审计


    const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
    const orderOpt: string[] | undefined = (options as any)?.domainOrder as any;
    const domainsSet = new Set<string>();
    if (Array.isArray(orderOpt) && orderOpt.length) orderOpt.forEach(d => domainsSet.add(String(d)));
    else updatedNodes.forEach(n => { const d = String(((n.data as any)?.domain || '')).trim(); if (d) domainsSet.add(d); });
    const domains = Array.from(domainsSet);
    /**
     * 函数级注释：域容器稳定排序索引
     * - 来源：按输入数据结构出现顺序或 options.domainOrder 构建的域顺序
     * - 作用：在所有“顶对齐/堆叠/间距统一”阶段，使用稳定顺序避免因几何变化导致的显示顺序漂移
     */
    const domainOrderIndex = new Map<string, number>(domains.map((d, i) => [String(d).trim(), i] as const));
    /**
     * 函数级注释：domain 容器排序键
     * - 输入：titleGroup/domain/group 容器
     * - 输出：该容器所属域在稳定顺序中的索引；缺失时返回 +∞ 以保持原有位置
     */
    const orderIndexOfDomainContainer = (dc: ReactFlowNode): number => {
      const dId = String((((dc as any)?.data?.domain || ''))).trim();
      const v = domainOrderIndex.get(dId);
      return (typeof v === 'number') ? v : Number.POSITIVE_INFINITY;
    };
    // 容器类型统一集合（函数级注释）
    // 用于统一域宽、左锚、垂直堆叠等阶段，确保所有域容器类型均参与计算
    const CONTAINER_TYPES = new Set(['titleGroup', 'domain', 'group']);

    // injectSemanticSubGroupsForMissingKeys 和 rebindChildrenNormalized 已提取至 shared/semanticHelpers.ts

    const placeRowWrap = (list: ReactFlowNode[], left: number, right: number, startY: number) => {
      let cursorX = left; let cursorY = startY; let rowMaxH = 0;
      const getW = (n: ReactFlowNode) => {
        const mw = num(((n as any)?.measured?.width), 240);
        const sw = num(((n as any)?.style?.width), 240);
        return Math.max(mw, sw);
      };
      const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
      for (const n of list) {
        const w = getW(n); const h = getH(n);
        if (cursorX + w > right) { cursorX = left; cursorY += rowMaxH + nodeV; rowMaxH = 0; }
        (n as any).position = { x: cursorX, y: cursorY } as any;
        // 修正：移除网格布局下的强制 0.4 倍缩放，直接使用 hGapDet (已包含 scaleHCfg)
        // 解决用户反馈的“子域间左右留白不生效”问题（原逻辑导致间距过小）
        const hGapRowEff = (nodeLayoutName === 'grid') ? Math.max(12, hGapDet) : Math.max(12, nodeH);
        cursorX += w + hGapRowEff; rowMaxH = Math.max(rowMaxH, h);
      }
      return { endY: cursorY + rowMaxH };
    };
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
    const nodeLayoutRaw: any = (options as any)?.nodeLayout;
    const nodeLayoutName: 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre' = (() => {
      const byEnum: Record<number, 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre'> = {
        [LayoutType.GRID as any]: 'grid',
        [LayoutType.HORIZONTAL as any]: 'horizontal',
        [LayoutType.VERTICAL as any]: 'vertical',
        [LayoutType.CENTERED as any]: 'centered',
        [LayoutType.DAGRE as any]: 'dagre',
      };
      if (typeof nodeLayoutRaw === 'number' && isFinite(nodeLayoutRaw)) return byEnum[nodeLayoutRaw] || 'horizontal';
      const s = String(nodeLayoutRaw || 'horizontal').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
      const byString: Record<string, 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre'> = {
        'gridlayout': 'grid', 'grid': 'grid',
        'horizontallayout': 'horizontal', 'horizontal': 'horizontal',
        'verticallayout': 'vertical', 'vertical': 'vertical',
        'centeredlayout': 'centered', 'centered': 'centered',
        'dagrelayout': 'dagre', 'dagre': 'dagre',
      };
      return byString[s] || (() => {
        try {
          const cfgNode = String((diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
          return byString[cfgNode] || 'horizontal';
        } catch { return 'horizontal'; }
      })();
    })();



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
      // dagre 布局需要边信息，对每个子域单独处理
      const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        const childNodes = ch.map(id => idm.get(id)).filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
        if (childNodes.length === 0) continue;
        const dagreDirection = String((options as any)?.direction || (cfg as any)?.diagram?.layout?.direction || 'TB').toUpperCase() === 'LR' ? 'LR' : 'TB';
        // 使用 dagre 布局子域内节点
        const result = reflowSubGroupChildrenDagre(sg, childNodes, hGapDet, nodeV, edges, dagreDirection as any);
        // 更新节点位置
        const resultMap = new Map(result.map(n => [n.id, n]));
        for (let i = 0; i < updatedNodes.length; i++) {
          const updated = resultMap.get(updatedNodes[i].id);
          if (updated) updatedNodes[i] = updated;
        }
      }
      // 重要：Dagre 布局后，必须重新计算所有子域容器的尺寸，以确保后续堆叠逻辑使用的 measured.height 是最新的
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;

      // [FIX] Dagre 布局后强制执行一次重叠消解，作为安全网防止节点重叠
      updatedNodes = resolveSubGroupChildrenOverlapsStrict(updatedNodes as any, Math.max(12, hGapDet), Math.max(8, nodeV)) as any;
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    }

    // [CHECKPOINT 1] Dagre 布局完成后，记录子节点**相对位置**
    const sgsCheck1 = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
    for (const sg of sgsCheck1) {
      const sgDesc = String((sg.data as any)?.description || sg.id);
      const sgX = (sg.position as any)?.x || 0;
      const sgY = (sg.position as any)?.y || 0;
      const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
      children.slice(0, 5).forEach(cid => {
        const child = updatedNodes.find(n => n.id === cid);
        if (child) {
          const cx = (child.position as any)?.x || 0;
          const cy = (child.position as any)?.y || 0;
          const relX = cx - sgX;
          const relY = cy - sgY;
          const dagreRel = (child.data as any)?.__dagreRel;
        }
      });
    }

    // dagre 布局后的子域垂直堆叠：把子域作为整体，在每个域内垂直排布
    {
      const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      const idmUpdated = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');



      // 检测是否所有域容器都隐藏（或没有域容器）
      const allDomainsHidden = tgs.length === 0 || tgs.every(tg => !!((tg as any)?.data?.hidden));
      console.debug(`[DOMAIN-HIDDEN-CHECK] tgs.length=${tgs.length}, allDomainsHidden=${allDomainsHidden}`);

      if (allDomainsHidden) {
        // 所有域隐藏时：对所有子域进行全局紧凑垂直堆叠
        const allSgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && !((n as any)?.data)?.hidden);
        if (allSgs.length >= 1) {
          allSgs.sort((a, b) => num((a as any)?.position?.y, 0) - num((b as any)?.position?.y, 0));
          const subGap = 48; // 紧凑模式间隔（增大避免连线回折）
          let cursorY = num((options as any)?.padding?.top, 80);
          for (const sg of allSgs) {
            const sgX = num((sg as any)?.position?.x, 0);
            const oldY = num((sg as any)?.position?.y, 0);
            // 优先使用 dagre 精确高度，其次用 measured/style
            const dagreSized = (sg.data as any)?.__dagreSized;
            const sgH = (dagreSized && typeof dagreSized.h === 'number' && dagreSized.h > 0)
              ? dagreSized.h
              : num((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height, 100);
            const deltaY = cursorY - oldY;
            (sg as any).position = { x: sgX, y: Math.round(cursorY) };
            const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            for (const childId of children) {
              const child = idmUpdated.get(childId);
              if (child) {
                const cx = num((child as any)?.position?.x, 0);
                const cy = num((child as any)?.position?.y, 0);
                (child as any).position = { x: cx, y: Math.round(cy + deltaY) };
              }
            }
            cursorY += sgH + subGap;
          }
        }
      } else {
        // [STANDARD PIPELINE]
        if (nodeLayoutName === 'dagre') {
          // [FIX] Deep Layout Reconstruction (No Incremental Drifts)
          // Rebuild the entire layout structure (Domain -> SubGroup -> Children) from scratch
          // to ensure absolute containment and alignment.

          // 1. Preparation: Helpers & Constants
          const globalPadLeft = num((options as any)?.padding?.left, 40);
          const globalPadTop = num((options as any)?.padding?.top, 80);
          const domainPadH = num(cfg?.domain?.padding?.horizontal, 24);
          const domainPadV = num(cfg?.domain?.padding?.vertical, 16);
          const domainGap = 48; // Space between domains
          const subGroupGap = num(cfg?.subDomain?.margin?.bottom, 24);

          const getDagreHeight = (n: any) => {
            const ds = (n.data as any)?.__dagreSized;
            if (ds && typeof ds.h === 'number') return ds.h;
            return num(n?.measured?.height ?? n?.style?.height, 100);
          };

          // 2. Identify & Sort Domains
          const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
          tgs.sort((a, b) => String((a.data as any)?.domain || '').localeCompare(String((b.data as any)?.domain || '')));

          // 3. Main Layout Loop
          let cursorY = globalPadTop;

          for (const tg of tgs) {
            const dId = String((tg.data as any)?.domain || '');
            // A. Set Domain Position (Top-Left)
            (tg as any).position = { x: globalPadLeft, y: Math.round(cursorY) };

            // B. Stack SubGroups
            const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String((n.data as any)?.domain || '') === dId);
            // Sort SubGroups (e.g. by subDomain name or existing order)
            // Using existing X to preserve logical column order from input if possible
            sgs.sort((a, b) => num((a as any)?.position?.x, 0) - num((b as any)?.position?.x, 0));

            const titleH = num(cfg?.domain?.title?.height, 48);
            const titleV = num(cfg?.domain?.title?.padding?.vertical, 12);
            const safeGap = num(cfg?.domain?.title?.safeGap, 16);

            const innerTop = cursorY + titleH + titleV + safeGap;

            // ✨ 整体居中逻辑: 计算所有子域的总宽度
            const subWidths = sgs.map(sg => {
              const dagreSized = (sg.data as any)?.__dagreSized;
              return dagreSized?.w ?? num((sg as any)?.measured?.width, 200);
            });
            const totalSubWidth = subWidths.reduce((sum, w) => sum + w, 0);
            const totalGaps = Math.max(0, sgs.length - 1) * subGroupGap;
            const totalWidthNeeded = totalSubWidth + totalGaps;

            // ✨ 整体居中逻辑: 计算域内可用宽度和居中起点
            const domainInnerLeft = globalPadLeft + domainPadH;
            const domainWidth = num((tg as any)?.measured?.width ?? (tg as any)?.style?.width, 800);
            const domainInnerRight = globalPadLeft + domainWidth - domainPadH;
            const availWidth = Math.max(1, domainInnerRight - domainInnerLeft);
            const spaceRemaining = Math.max(0, availWidth - totalWidthNeeded);
            const centeredStartX = domainInnerLeft + (spaceRemaining / 2);

            let currentX = centeredStartX;  // ✨ 从居中起点开始,而非域左边界
            let maxSubGroupHeight = 0;

            // [FIX] Horizontal Stacking for Swimlanes (Side-by-Side)
            // User requested "Top Aligned" sub-domains.
            for (const sg of sgs) {
              const h = getDagreHeight(sg);
              // IMPORTANT: Ensure style/measured reflects dagre size
              const w = (sg.data as any)?.__dagreSized?.w ?? num((sg as any)?.measured?.width, 200);

              (sg as any).position = { x: Math.round(currentX), y: Math.round(innerTop) };
              (sg as any).style = { ...((sg as any).style || {}), width: w, height: h };
              (sg as any).measured = { width: w, height: h };

              maxSubGroupHeight = Math.max(maxSubGroupHeight, h);
              currentX += w + subGroupGap; // Advance horizontally
            }

            // B2. Stack Orphans below the tallest swimlane
            const orphansY = innerTop + maxSubGroupHeight + subGroupGap;
            let orphansBottom = orphansY;

            const orphans = updatedNodes.filter(n => {
              const belongs = String((n.data as any)?.domain || '') === dId;
              const type = String(n.type || '');
              if (!belongs || type === 'titleGroup' || type === 'subGroup' || type === 'group') return false;
              for (const sg of sgs) {
                const ch = (sg.data as any)?.children as string[] | undefined;
                if (ch?.includes(n.id)) return false;
              }
              return true;
            });

            if (orphans.length > 0) {
              const orphanX = globalPadLeft + domainPadH;
              // Stack orphans horizontally or vertically? Let's stack vertically for safety as a "Footer"
              let currentOrphanY = orphansY;
              for (const orphan of orphans) {
                const oh = num((orphan as any)?.measured?.height ?? (orphan as any)?.style?.height, 60);
                const ow = num((orphan as any)?.measured?.width ?? (orphan as any)?.style?.width, 150);
                (orphan as any).position = { x: Math.round(orphanX), y: Math.round(currentOrphanY) };
                currentOrphanY += oh + subGroupGap;
                orphansBottom = currentOrphanY;
              }
            }

            // C. Determine Domain Height
            // Content Bottom is max(SubGroups Bottom, Orphans Bottom)
            const contentBottom = Math.max(innerTop + maxSubGroupHeight, orphansBottom);
            const minDomainH = contentBottom - cursorY + domainPadV;

            // Apply to Domain
            ((tg as any).style || ((tg as any).style = {})).height = minDomainH;
            (tg as any).measured = {
              width: num((tg as any)?.measured?.width, 300), // Width processed later
              height: minDomainH
            };

            // Advance Cursor
            cursorY += minDomainH + domainGap;
          }

          // 4. Sync Children (Rigid Body Lock)
          // Now that SubGroups are strictly placed, use __dagreRel to offsets children
          updatedNodes = syncDagreChildPositions(updatedNodes);

          // 5. Finalize Widths (Wrap Content)
          updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
          // Heights are already correct from stack loop, but calling project won't hurt if stable
          // actually, finalizeDomainHeightsByProjection might handle orphans loop missed
          updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;

          // ✨ 域宽度确定后,重新居中子域
          {
            const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
            const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));

            for (const tg of tgs) {
              const dId = String((tg.data as any)?.domain || '');
              const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String((n.data as any)?.domain || '') === dId);
              if (sgs.length === 0) continue;

              const tgX = num((tg as any)?.position?.x, globalPadLeft);
              const tgW = num((tg as any)?.measured?.width ?? (tg as any)?.style?.width, 800);
              const domainInnerLeft = tgX + domainPadH;
              const domainInnerRight = tgX + tgW - domainPadH;
              const availWidth = Math.max(1, domainInnerRight - domainInnerLeft);

              const subWidths = sgs.map(sg => num((sg as any)?.measured?.width ?? (sg as any)?.style?.width, 200));
              const totalSubWidth = subWidths.reduce((sum, w) => sum + w, 0);
              const totalGaps = Math.max(0, sgs.length - 1) * subGroupGap;
              const totalWidthNeeded = totalSubWidth + totalGaps;

              const spaceRemaining = Math.max(0, availWidth - totalWidthNeeded);
              const centeredStartX = domainInnerLeft + (spaceRemaining / 2);


              sgs.sort((a, b) => num((a as any)?.position?.x, 0) - num((b as any)?.position?.x, 0));
              let cursorX = centeredStartX;

              for (let i = 0; i < sgs.length; i++) {
                const sg = sgs[i];
                const oldX = num((sg as any)?.position?.x, 0);
                const oldY = num((sg as any)?.position?.y, 0);
                const newX = Math.round(cursorX);
                const dx = newX - oldX;


                (sg as any).position = { x: newX, y: oldY };

                const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
                for (const childId of children) {
                  const child = idMap.get(childId);
                  if (child) {
                    const cx = num((child as any)?.position?.x, 0);
                    const cy = num((child as any)?.position?.y, 0);
                    (child as any).position = { x: Math.round(cx + dx), y: cy };
                  }
                }

                cursorX += subWidths[i] + subGroupGap;
              }
            }
          }
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
      {
        /**
         * 函数级注释：阶段一消重（按布局类型）
         * - horizontal/centered：使用轻量水平单调推进（fixChildOverlaps），仅调整 x，保持 y 不变；
         * - grid/vertical：使用严格消重 resolveSubGroupChildrenOverlapsStrict；随后回收容器尺寸。
         */
        const padX = Math.max(12, hGapDet);
        const padY = Math.max(8, nodeV);
        if (nodeLayoutName === 'horizontal' || nodeLayoutName === 'centered') {
          const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
          const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
          for (const sg of sgs) {
            const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            const list = ch.map(id => idm.get(id)).filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
            if (!list.length) continue;
            const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
            const SAFE_W = numLocal((diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH, 120);
            const getW = (n: ReactFlowNode) => numLocal((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), SAFE_W);
            const byX = list.slice().sort((a, b) => numLocal(((a as any)?.position?.x), 0) - numLocal(((b as any)?.position?.x), 0));
            let prev: ReactFlowNode | null = null;
            for (const n of byX) {
              if (!prev) { prev = n; continue; }
              const px = numLocal(((prev as any)?.position?.x), 0);
              const pw = getW(prev);
              const nx0 = numLocal(((n as any)?.position?.x), 0);
              const desiredX = px + pw + padX;
              if (nx0 < desiredX) {
                const ny0 = numLocal(((n as any)?.position?.y), 0);
                (n as any).position = { x: Math.round(desiredX), y: Math.round(ny0) } as any;
              }
              prev = n;
            }
          }
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
        } else if (nodeLayoutName === 'dagre') {
          // dagre 布局已通过 dagre 算法计算位置，跳过严格消重以保留层次结构
          // 不调用 recomputeSubGroupContainersBasic，因为它会覆盖 dagre 计算的精确尺寸
          // 尺寸已在 reflowSubGroupChildrenDagre 中计算
        } else {
          updatedNodes = resolveSubGroupChildrenOverlapsStrict(updatedNodes as any, padX, padY) as any;
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
        }
      }
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
      if (!(options as any)?.__lockSubGroupHeights && nodeLayoutName !== 'dagre') {
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
        const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of tgs) {
          const dId = String((((dc as any).data?.domain || '')));
          if (!dId) continue;
          const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
          if (sgs.length < 2) continue;
          const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), subTitleH + subTitleV + subPadTop + subBottomSafe);
          const maxH = Math.max(...sgs.map(getH));
          for (const sg of sgs) {
            const curW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
            ((sg as any).style || ((sg as any).style = {})).width = curW;
            ((sg as any).style || ((sg as any).style = {})).height = maxH;
            (sg as any).measured = { width: curW, height: maxH } as any;
            (sg as any).width = curW;
            (sg as any).height = maxH;
          }
        }
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
        /**
         * 函数级注释：子域 children 相对偏移快照（阶段一末尾）
         * - 目标：在子域投影、顶端对齐与间距一致完成后，记录每个 children 相对于所属子域的相对位置，用于阶段二的刚体整体移动
         */
        const snapshotChildrenRel = (list: ReactFlowNode[]) => {
          const idm = new Map<string, ReactFlowNode>(list.map(n => [n.id, n] as const));
          const sgs = list.filter(n => String(n.type || '') === 'subGroup');
          for (const sg of sgs) {
            const sx = num(((sg as any)?.position?.x), 0);
            const sy = num(((sg as any)?.position?.y), 0);
            const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            for (const cid of ch) {
              const c = idm.get(cid);
              if (!c) continue;
              const cx = num(((c as any)?.position?.x), 0);
              const cy = num(((c as any)?.position?.y), 0);
              (((c as any).data || ((c as any).data = {})).__rel = { x: Math.round(cx - sx), y: Math.round(cy - sy) } as any);
            }
          }
          return list;
        };
        updatedNodes = snapshotChildrenRel(updatedNodes);
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
          const padX = Math.max(12, hGapDet);
          const padY = Math.max(8, nodeV);
          for (const sg of sgs) {
            const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            const list = ch
              .map(id => idm.get(id))
              .filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
            if (!list.length) continue;
            if (nodeLayoutName === 'vertical') {
              const reflowed = reflowSubGroupChildrenVertical(sg as any, list as any, padX, padY) as any;
              const mapReflow = new Map<string, ReactFlowNode>((reflowed as ReactFlowNode[]).map(n => [n.id, n] as const));
              for (const n of list) {
                const p = mapReflow.get(n.id) as any;
                if (p?.position) (n as any).position = { x: Math.round(p.position.x), y: Math.round(p.position.y) } as any;
              }
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
                    const w = numLocal(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), numLocal((diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH, 120));
                    const y = numLocal(((n as any)?.position?.y), 0);
                    const desired = Math.round(centerXDom - w / 2);
                    const clamped = Math.min(Math.max(desired, innerLeft), Math.max(innerLeft, innerRight - w));
                    (n as any).position = { x: clamped, y } as any;
                  }
                }
              } catch {
                // ignore
              }
            } else if (nodeLayoutName === 'grid') {
              const reflowed = reflowSubGroupChildrenGrid(sg as any, list as any, padX, padY) as any;
              const mapReflow = new Map<string, ReactFlowNode>((reflowed as ReactFlowNode[]).map(n => [n.id, n] as const));
              for (const n of list) {
                const p = mapReflow.get(n.id) as any;
                if (p?.position) (n as any).position = { x: Math.round(p.position.x), y: Math.round(p.position.y) } as any;
              }
            } else {
              // horizontal/centered：保持线性横排，不做折行（内联实现，避免前置调用）
              const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
              const SAFE_W = numLocal((diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH, 120);
              const SAFE_H = numLocal((diagramConfigManager.getConfig() as any)?.node?.height, 80);
              const getW = (n: ReactFlowNode) => {
                const mw = numLocal(((n as any)?.measured?.width), SAFE_W);
                const sw = numLocal(((n as any)?.style?.width ?? (n as any)?.width), SAFE_W);
                return Math.max(mw, sw, SAFE_W);
              };
              const getH = (n: ReactFlowNode) => numLocal((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), SAFE_H);
              const leftBound = Math.round((sg as any)?.position?.x || 0) + Math.max(subPadH, 0);
              const startY = Math.round((sg as any)?.position?.y || 0) + effectiveTopPad();
              let x = leftBound; const y = startY; let rowMaxH = 0;
              for (const n of list) {
                (n as any).position = { x: Math.round(x), y: Math.round(y) } as any;
                x += getW(n) + Math.max(12, hGapDet);
                rowMaxH = Math.max(rowMaxH, getH(n));
              }
              void rowMaxH;
            }
          }
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
          updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as any;
          updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
          {
            const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
            for (const dc of tgs) {
              const dId = String((((dc as any).data?.domain || '')));
              if (!dId) continue;
              const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
              if (sgs.length < 2) continue;
              const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), subTitleH + subTitleV + subPadTop + subBottomSafe);
              const maxH = Math.max(...sgs.map(getH));
              for (const sg of sgs) {
                const curW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
                ((sg as any).style || ((sg as any).style = {})).width = curW;
                ((sg as any).style || ((sg as any).style = {})).height = maxH;
                (sg as any).measured = { width: curW, height: maxH } as any;
                (sg as any).width = curW;
                (sg as any).height = maxH;
              }
            }
          }
        }
      }

      /** 函数级注释：阶段停靠（phase1）
       * - 依据配置或 options.stopAfterPhase，可在阶段一结束时提前返回，便于对齐水平策略的调试体验
       */
      {
        const stopAfterPhaseRaw = String(((options as any)?.stopAfterPhase ?? layeredCfg.get<string>('diagram.layout.stopAfterPhase', 'none')) || 'none').toLowerCase().replace(/\s+/g, '');
        const stopAfterPhase: 'none' | 'phase1' | 'phase2' = (stopAfterPhaseRaw === 'phase1' || stopAfterPhaseRaw === 'phase2') ? (stopAfterPhaseRaw as any) : 'none';
        if (stopAfterPhase === 'phase1') return { nodes: updatedNodes, edges } as any;
        (options as any).__stopAfterPhase = stopAfterPhase;
      }
      /** 函数级注释：严格流水线开关
       * - 与水平策略一致：strictPipeline=true 时采用“先刚体、再重排”的严格时序；否则允许在部分阶段提前纵向堆叠/重排
       */

      /**
       * 函数级注释：DomainVerticalLayout 钳制开关
       * - 配置键：diagram.layout.domainVertical.clampEnabled，默认关闭
       * - 目的：该策略已通过“扩域/统一宽/推开/居中”保证严格包含，通常不需要再做位置钳制
       */



      const layoutHorizontal = (list: ReactFlowNode[], left: number, right: number, startY: number) => {
        let x = left; const y = startY;
        const SAFE_W = num((diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH, 120);
        const SAFE_H = num((diagramConfigManager.getConfig() as any)?.node?.height, 80);
        const getW = (n: ReactFlowNode) => {
          const mw = num(((n as any)?.measured?.width), SAFE_W);
          const sw = num(((n as any)?.style?.width ?? (n as any)?.width), SAFE_W);
          return Math.max(mw, sw, SAFE_W);
        };
        const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), SAFE_H);

        // Compute total width and max height for centering
        let totalW = 0;
        let rowMaxH = 0;
        for (const n of list) {
          totalW += getW(n) + hGapDet;
          rowMaxH = Math.max(rowMaxH, getH(n));
        }
        if (list.length > 0) totalW -= hGapDet; // remove last gap

        const availW = Math.max(0, right - left);
        let startX = left;
        // Center if we have space, otherwise start at left
        if (availW > totalW) {
          startX = left + Math.round((availW - totalW) / 2);
        }
        x = startX;

        for (const n of list) {
          const nh = getH(n);
          // Vertically align directly to the middle of the row
          const ny = Math.round(y + (rowMaxH - nh) / 2);
          (n as any).position = { x: Math.round(x), y: ny } as any;
          x += getW(n) + hGapDet;
        }
        return { endY: y + rowMaxH };
      };
      const layoutVertical = (list: ReactFlowNode[], left: number, _right: number, startY: number) => {
        let cy = startY; const SAFE_H = num((diagramConfigManager.getConfig() as any)?.node?.height, 80);
        const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), SAFE_H);
        for (const n of list) { (n as any).position = { x: left, y: cy } as any; cy += getH(n) + nodeV; }
        return { endY: cy };
      };
      /**
       * 函数级注释：子域内部重叠消解（按策略）
       * - horizontal/centered：按 x 升序，保证后一个节点的 x 不小于“前一个右缘 + hGapDet”
       * - vertical：按 y 升序，保证后一个节点的 y 不小于“前一个下缘 + nodeV”
       * - grid：不处理（由网格布局负责）
       */
      const fixChildOverlaps = (list: ReactFlowNode[], layout: 'horizontal' | 'vertical' | 'grid' | 'centered' | 'dagre') => {
        // dagre 布局虽然有算法保证，但仍可能因尺寸估算发生重叠，这里不再跳过，允许进行轻微调整
        // if (layout === 'dagre') return;
        const SAFE_W = num((diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH, 120);
        const SAFE_H = num((diagramConfigManager.getConfig() as any)?.node?.height, 80);
        const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), SAFE_W);
        const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), SAFE_H);
        if (layout === 'grid') {
          // 针对网格：按行分组后，确保行内 x 单调递增且最小间距为 hGapDet
          const rows: ReactFlowNode[][] = [];
          const sorted = list.slice().sort((a, b) => num(((a as any)?.position?.y), 0) - num(((b as any)?.position?.y), 0));
          const avgH = sorted.length ? (sorted.reduce((s, m) => s + getH(m), 0) / sorted.length) : SAFE_H;
          const ROW_TOL_DYNAMIC = Math.max(6, Math.floor(Math.min(nodeV * 0.35, avgH * 0.5)));
          for (const n of sorted) {
            const cy = num(((n as any)?.position?.y), 0);
            let placed = false;
            for (const row of rows) {
              const rCy = row.reduce((s, m) => s + num(((m as any)?.position?.y), 0), 0) / Math.max(1, row.length);
              if (Math.abs(cy - rCy) <= ROW_TOL_DYNAMIC) { row.push(n); placed = true; break; }
            }
            if (!placed) rows.push([n]);
          }
          for (const row of rows) {
            const byX = row.slice().sort((a, b) => num(((a as any)?.position?.x), 0) - num(((b as any)?.position?.x), 0));
            let prev: ReactFlowNode | null = null;
            for (const n of byX) {
              if (!prev) { prev = n; continue; }
              const px = num(((prev as any)?.position?.x), 0);
              const pw = getW(prev);
              const nx = num(((n as any)?.position?.x), 0);
              const desiredX = px + pw + Math.max(12, hGapDet);
              if (nx < desiredX) {
                (n as any).position = { x: desiredX, y: num(((n as any)?.position?.y), 0) } as any;
              }
              prev = n;
            }
          }
          return;
        }
        const maxIter = 10;
        if (layout === 'vertical') {
          let iter = 0;
          while (iter < maxIter) {
            let changed = false;
            const byY = list.slice().sort((a, b) => num(((a as any)?.position?.y), 0) - num(((b as any)?.position?.y), 0));
            let prev: ReactFlowNode | null = null;
            for (const n of byY) {
              if (!prev) { prev = n; continue; }
              const py = num(((prev as any)?.position?.y), 0);
              const ph = getH(prev);
              const ny = num(((n as any)?.position?.y), 0);
              const desiredY = py + ph + nodeV;
              if (ny < desiredY) { (n as any).position = { x: num(((n as any)?.position?.x), 0), y: desiredY } as any; changed = true; }
              prev = n;
            }
            if (!changed) break;
            iter++;
          }
          return;
        }
        let iter = 0;
        while (iter < maxIter) {
          let changed = false;
          const byX = list.slice().sort((a, b) => num(((a as any)?.position?.x), 0) - num(((b as any)?.position?.x), 0));
          let prev: ReactFlowNode | null = null;
          for (const n of byX) {
            if (!prev) { prev = n; continue; }
            const px = num(((prev as any)?.position?.x), 0);
            const pw = getW(prev);
            const nx = num(((n as any)?.position?.x), 0);
            const desiredX = px + pw + hGapDet;
            if (nx < desiredX) { (n as any).position = { x: desiredX, y: num(((n as any)?.position?.y), 0) } as any; changed = true; }
            prev = n;
          }
          if (!changed) break;
          iter++;
        }
      };
      /**
       * 函数级注释：网格布局（允许换行）
       * 仅当节点布局策略明确为 grid 时使用；非 grid 场景一律禁止换行。
       */
      /**
       * Grid 摆放（函数级注释）
       * - 采用“可变列宽 + 最小列距”的方式：列距来源 hGapDet；列宽取节点自身宽度，避免统一列宽导致行宽估算偏差
       * - 支持动态列数：当传入 colsOverride 时，行内最多放置该数量的节点；否则按可用宽度自动换行
       * - 返回 endY 供后续管线使用，并额外保留 rows/rowWidths 以便容器尺寸回收更精准
       */
      const layoutGrid = (list: ReactFlowNode[], left: number, right: number, startY: number, colsOverride?: number) => {
        const colGap = Math.max(12, hGapDet);
        const rowGap = Math.max(8, nodeV);
        const getW = (n: ReactFlowNode) => {
          const mw = num(((n as any)?.measured?.width), Math.max(120, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120));
          const sw = num(((n as any)?.style?.width ?? (n as any)?.width), Math.max(120, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120));
          return Math.max(mw, sw);
        };
        const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), (diagramConfigManager.getConfig() as any)?.node?.height || 80);
        const widths = list.map(getW);
        const heights = list.map(getH);
        const availW = Math.max(1, right - left);
        let x = left, y = startY, c = 0, rowMaxH = 0, rowUsedW = 0;
        const rows: ReactFlowNode[][] = [];
        const rowWidths: number[] = [];
        const maxCols = (typeof colsOverride === 'number' && isFinite(colsOverride)) ? Math.max(1, Math.min(colsOverride, list.length)) : Infinity;
        for (let i = 0; i < list.length; i++) {
          const n = list[i]; const w = widths[i]; const h = heights[i];
          // 若传入列数覆盖，则仅按列数换行；否则按可用宽度与列数共同决定
          const wouldExceed = (maxCols === Infinity) ? ((c > 0) && (rowUsedW + colGap + w > availW)) : false;
          if (c >= maxCols || wouldExceed) {
            rowWidths.push(rowUsedW);
            rows.push([]);
            x = left; y += rowMaxH + rowGap; c = 0; rowMaxH = 0; rowUsedW = 0;
          }
          (n as any).position = { x, y } as any;
          rowMaxH = Math.max(rowMaxH, h);
          rowUsedW = (c === 0 ? w : rowUsedW + colGap + w);
          c++;
          x += w + colGap;
          if (!rows.length) rows.push([]);
          rows[rows.length - 1].push(n);
        }
        if (rowMaxH > 0) rowWidths.push(rowUsedW);
        return { endY: y + rowMaxH, rows, rowWidths } as any;
      };
      // 检测是否所有域容器都隐藏（或没有域容器）- 如果是则跳过域行布局，保留紧凑堆叠结果
      // 注意：与 dagre 分支的 allDomainsHidden 条件保持一致
      const titleGroupsForCheck = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
      const allTitleGroupsHidden = titleGroupsForCheck.length === 0 || titleGroupsForCheck.every(tg => !!((tg as any)?.data?.hidden));

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
          let subGroups = updatedNodes.filter(n => {
            const tp = String(n.type || '');
            if (tp !== 'subGroup') return false;
            const d1 = String(((n.data as any)?.domain || '')).trim();
            return d1 === d;
          });
          // 域内子域按显式顺序 + 原始顺序稳定排序
          subGroups = subGroups.slice().sort((a, b) => orderKeyOf(a) - orderKeyOf(b));
          // 归属域校正：确保子域容器的 data.domain 与父域一致，避免统一域宽投影遗漏
          for (const sg of subGroups) {
            const dom = String((((sg as any)?.data || {}) as any)?.domain || '').trim();
            if (dom !== String(d).trim()) {
              ((sg as any).data || ((sg as any).data = {})).domain = String(d).trim();
            }
          }

          // 域内初次横排：仅对子域容器进行显式顺序摆放，避免自由节点干扰子域左右顺序
          const subGroupsOrdered = subGroups.slice().sort((a, b) => orderKeyOf(a) - orderKeyOf(b));
          // 记录每个子域容器移动前的位置
          const sgOldPositions = new Map<string, { x: number; y: number }>();
          for (const sg of subGroupsOrdered) {
            const px = num(((sg as any)?.position?.x), 0);
            const py = num(((sg as any)?.position?.y), 0);
            sgOldPositions.set(sg.id, { x: px, y: py });
          }
          const rowRes = placeRowWrap(subGroupsOrdered as any, laneLeft, laneRightLayout, innerTop);

          // dagre 布局逻辑已移除，因为此块对 dagre 模式不可达
          // 原有逻辑的剩余部分保持
          for (const sg of subGroups) {
            const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
            const childNodes = children
              .map(id => idMap.get(id))
              .filter((cn): cn is ReactFlowNode => !!cn && !(((cn as any)?.data) || {})?.hidden);
            const sgLeft = num((sg as any)?.position?.x, laneLeft) + subPadH;
            const sgWidth = num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width), 480);
            const domXCur = num(((tg as any)?.position?.x), anchorLeftGlobal);
            const domWCur = num((((tg as any)?.style?.width ?? (tg as any)?.measured?.width)), 0);
            const curDomRight = domXCur + Math.max(1, domWCur) - padH;
            const sgRight = Math.min(
              sgLeft + Math.max(240, sgWidth) - subPadH * 2,
              curDomRight
            );
            const startYChild = num((sg as any)?.position?.y, innerTop) + effectiveTopPad();
            const sgMaxRight = sgRight;
            /**
             * 函数级注释：ELK 无边回退与防重叠
             * - 当子域内部没有局部边时，ELK 层次可能将节点放置到同一点导致重叠；此时回退为横排或网格
             * - 在 ELK 模式下也进行一次轻量防重叠修正，确保最小间距
             */
            /**
             * 函数级注释：子域局部边集与层次触发
             * - 当节点布局策略选择 ELK 时，构造局部 layered 图进行分层；
             * - 其它策略按 grid/horizontal/vertical 排布。
             */
            const gridColsForDomain = (subGroups.length >= 3 ? 2 : 3);

            const workingList: ReactFlowNode[] = childNodes.slice();
            // 使用布局函数直接输出坐标，不做压缩式再处理
            // dagre 布局已在前面计算完成，跳过此处的重排
            if (nodeLayoutName === 'grid') {
              layoutGrid(workingList, sgLeft, sgMaxRight, startYChild, gridColsForDomain);
            } else if (nodeLayoutName === 'vertical') {
              layoutVertical(workingList, sgLeft, sgMaxRight, startYChild);
            } else {
              layoutHorizontal(workingList, sgLeft, sgMaxRight, startYChild);
            }
            // 对于非 dagre 布局，执行后置重排
            const padX = Math.max(12, hGapDet);
            const padY = Math.max(8, nodeV);
            const reflowed = reflowSubGroupChildrenVertical(sg as any, childNodes as any, padX, padY) as any;
            const mapReflow = new Map<string, ReactFlowNode>((reflowed as ReactFlowNode[]).map(n => [n.id, n] as const));
            for (const n of childNodes) {
              const p = mapReflow.get(n.id) as any;
              if (p?.position) (n as any).position = { x: Math.round(p.position.x), y: Math.round(p.position.y) } as any;
            }
            const packed = packSubGroupChildrenRigid(sg as any, childNodes as any, padX, padY) as any;
            const mapPacked = new Map<string, ReactFlowNode>((packed as ReactFlowNode[]).map(n => [n.id, n] as const));
            for (const n of childNodes) {
              const p = mapPacked.get(n.id) as any;
              if (p?.position) (n as any).position = { x: Math.round(p.position.x), y: Math.round(p.position.y) } as any;
            }
            scatterNodesAtSamePoint(childNodes as any, 'x', Math.max(12, hGapDet), 2);
            fixChildOverlaps(childNodes as any, nodeLayoutName as any);








            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
            for (const n of childNodes) {
              const x = num(((n as any)?.position?.x), laneLeft);
              const y = num(((n as any)?.position?.y), innerTop);
              minX = Math.min(minX, x); minY = Math.min(minY, y);
              maxX = Math.max(maxX, x + getW(n)); maxY = Math.max(maxY, y + getH(n));
            }
            if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
              (sg as any).position = { x: Math.round(minX - subPadH), y: Math.round(minY - effectiveTopPad()) } as any;
              const curW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
              const curH = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
              const newW = (maxX - minX) + subPadH * 2; const newH = (maxY - minY) + effectiveTopPad() + subBottomSafe;
              const finalW = Math.max(curW, newW);
              const finalH = Math.max(curH, newH);
              ((sg as any).style || ((sg as any).style = {})).width = finalW;
              ((sg as any).style || ((sg as any).style = {})).height = finalH;
              (sg as any).measured = { width: finalW, height: finalH } as any;
              (sg as any).width = finalW;
              (sg as any).height = finalH;
              const innerLeft = Math.round(num(((sg as any)?.position?.x), 0) + subPadH);
              const innerTop = Math.round(num(((sg as any)?.position?.y), 0) + effectiveTopPad());
              const innerRight = Math.round(innerLeft + Math.max(0, finalW - subPadH * 2));
              const innerBottom = Math.round(num(((sg as any)?.position?.y), 0) + finalH - subBottomSafe);
              for (const n of childNodes) {
                const px = num(((n as any)?.position?.x), innerLeft);
                const py = num(((n as any)?.position?.y), innerTop);
                const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 120);
                const nh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
                const nx = Math.max(innerLeft, Math.min(px, innerRight - nw));
                const ny = Math.max(innerTop, Math.min(py, innerBottom - nh));
                (n as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
              }
              (sg as any).zIndex = typeof (sg as any).zIndex === 'number' ? (sg as any).zIndex : -5;
              const curChildren = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
              const keyRaw = String((((sg as any)?.data?.description || (sg as any)?.data?.subDomain || sg.id) || '')).trim();
              const addCandidates = updatedNodes.filter(n => {
                const tp = String(n.type || '');
                if (tp === 'titleGroup' || tp === 'subGroup') return false;
                const nd = String(((n.data as any)?.domain || '')).trim();
                const sd = String((((n.data as any)?.subDomain ?? (n.data as any)?.subdomain) ?? (n.data as any)?.metadata?.subDomain) ?? '').trim();
                return nd === String(d).trim() && (!!keyRaw && sd === keyRaw);
              });
              const toAdd = addCandidates.map(n => n.id).filter(id => !curChildren.includes(id));
              if (toAdd.length) {
                const next = [...curChildren, ...toAdd];
                ((sg as any).data || ((sg as any).data = {})).children = next;
              }
            }

          }
          cursorYGlobal = Math.max(cursorYGlobal, rowRes.endY + domainGapEff);
          {
            const padX = Math.max(12, hGapDet);
            const padY = Math.max(8, nodeV);
            /**
             * 函数级注释：刚体同步前快照（子域容器位置）
             * - 目的：记录当前子域容器的 position，用于后续可能的位移（重叠消解/尺寸回收）后将 children 做刚体同步
             */
            const prevPos = new Map<string, { x: number; y: number }>();
            for (const sg of updatedNodes.filter(n => String(n.type || '') === 'subGroup')) {
              const x0 = num(((sg as any)?.position?.x), 0);
              const y0 = num(((sg as any)?.position?.y), 0);
              prevPos.set(String((sg as any)?.id || ''), { x: x0, y: y0 });
            }
            // 对于 dagre 布局，跳过通用的子域重叠处理和容器重计算，因为 dagre 分支已独立处理
            if ((nodeLayoutName as any) !== 'dagre') {
              updatedNodes = resolveSubGroupChildrenOverlapsStrict(updatedNodes as any, padX, padY) as any;
              updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
            }
            /**
             * 函数级注释：同域子域容器重叠消解（条件触发，阶段一后）
             * - 仅在检测到重叠时执行一次，避免前段不必要位移
             */
            if ((nodeLayoutName as any) !== 'dagre') {
              const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
              const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
              let hasOverlap = false;
              outer: for (const dc of domainsList) {
                const dId = String((((dc as any).data?.domain || '')));
                const sgs = updatedNodes
                  .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId);
                for (let i = 0; i < sgs.length; i++) {
                  const a: any = sgs[i];
                  const ax = numLocal((a?.position?.x), 0);
                  const ay = numLocal((a?.position?.y), 0);
                  const aw = numLocal(((a?.measured?.width ?? a?.style?.width)), 0);
                  const ah = numLocal(((a?.measured?.height ?? a?.style?.height)), 0);
                  for (let j = i + 1; j < sgs.length; j++) {
                    const b: any = sgs[j];
                    const bx = numLocal((b?.position?.x), 0);
                    const by = numLocal((b?.position?.y), 0);
                    const bw = numLocal(((b?.measured?.width ?? b?.style?.width)), 0);
                    const bh = numLocal(((b?.measured?.height ?? b?.style?.height)), 0);
                    const disjoint = ax >= bx + bw || ax + aw <= bx || ay >= by + bh || ay + ah <= by;
                    if (!disjoint) { hasOverlap = true; break outer; }
                  }
                }
              }
              if (hasOverlap) {
                const gapEff = (nodeLayoutName === 'grid') ? Math.max(12, Math.floor(hGapDet * 0.4)) : Math.max(12, hGapDet);
                updatedNodes = resolveSubGroupOverlaps(updatedNodes, gapEff, subGroupVGapCompact) as any;
              }
            }
            /**
             * 函数级注释：子域容器位移后的刚体同步（应用 dx/dy）
             * - 目标：若子域容器在上述步骤发生了位移，则对子域 children 统一应用同样的 dx/dy，确保“容器+children”作为整体移动
             */
            {
              const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
              for (const sg of updatedNodes.filter(n => String(n.type || '') === 'subGroup')) {
                const id = String((sg as any)?.id || '');
                const before = prevPos.get(id);
                if (!before) continue;
                const afterX = num(((sg as any)?.position?.x), before.x);
                const afterY = num(((sg as any)?.position?.y), before.y);
                const dx = Math.round(afterX - before.x);
                const dy = Math.round(afterY - before.y);
                if (dx === 0 && dy === 0) continue;
                const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
                for (const cid of children) {
                  const c = idm.get(cid);
                  if (!c) continue;
                  const cx = num(((c as any)?.position?.x), 0) + dx;
                  const cy = num(((c as any)?.position?.y), 0) + dy;
                  (c as any).position = { x: Math.round(cx), y: Math.round(cy) } as any;
                }
              }
              updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
            }
            /**
             * 函数级注释：同域子域水平推开（刚体同步）
             * - 目标：保证同域子域容器在单行内不相互覆盖；按前一容器右缘 + hGapDet 推开当前容器，并将 children 一并平移
             */
            {
              const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
              const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
              const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
              for (const dc of domainsList) {
                const dId = String((((dc as any).data?.domain || '')));
                const domX = numLocal(((dc as any)?.position?.x), 0);
                const innerLeft = domX + padH;
                const sgs = updatedNodes
                  .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId)
                  .slice().sort((a, b) => numLocal(((a as any)?.position?.x), 0) - numLocal(((b as any)?.position?.x), 0));
                const gapRightEff = (nodeLayoutName === 'grid') ? Math.max(12, Math.floor(hGapDet * 0.4)) : Math.max(12, hGapDet);
                let prevRight = innerLeft - subPadH;
                for (const sg of sgs) {
                  const sx = numLocal(((sg as any)?.position?.x), prevRight);
                  const sy = numLocal(((sg as any)?.position?.y), 0);
                  const sw = numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), Math.max(240, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120));
                  const desiredX = Math.max(sx, prevRight);
                  const dx = Math.round(desiredX - sx);
                  if (dx !== 0) {
                    (sg as any).position = { x: Math.round(desiredX), y: sy } as any;
                    const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
                    for (const cid of children) {
                      const c = idm.get(cid);
                      if (!c) continue;
                      const cx = numLocal(((c as any)?.position?.x), 0) + dx;
                      const cy = numLocal(((c as any)?.position?.y), 0);
                      (c as any).position = { x: Math.round(cx), y: Math.round(cy) } as any;
                    }
                  }
                  prevRight = desiredX + sw + gapRightEff;
                }
              }
            }
          }

          // 回收域容器尺寸并对齐到当前 cursorYGlobal
          let minXDom = Infinity, minYDom = Infinity, maxXDom = -Infinity, maxYDom = -Infinity;
          let maxRightDom = -Infinity;
          /**
           * 函数级注释：域高度成员筛选（排除隐藏）
           * - 仅根据域归属聚合业务节点与子域容器；排除 titleGroup 自身；
           * - 过滤 data.hidden 的成员，避免隐藏对象参与高度投影导致域间距异常增大。
           */
          const members = updatedNodes.filter(n => {
            const belongs = String(((n.data as any)?.domain || '')) === d;
            const tp = String(n.type || '');
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            return belongs && tp !== 'titleGroup' && !hidden;
          });
          const getWm = (n: ReactFlowNode) => {
            const mw = num(((n as any)?.measured?.width), 240);
            const sw = num(((n as any)?.style?.width), 240);
            return Math.max(mw, sw);
          };
          const getHm = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
          for (const n of members) {
            const x = num(((n as any)?.position?.x), laneLeft);
            const y = num(((n as any)?.position?.y), innerTop);
            minXDom = Math.min(minXDom, x); minYDom = Math.min(minYDom, y);
            const right = x + getWm(n);
            maxXDom = Math.max(maxXDom, right); maxYDom = Math.max(maxYDom, y + getHm(n));
            maxRightDom = Math.max(maxRightDom, right);
          }
          const newWDom = Math.max(0, (maxXDom - minXDom) + padH * 2 + sideSafeGap * 2) * widthCompensation;
          const domainPadTop = num((cfg?.domain?.padding?.vertical), 0);
          const newHDom = Math.max(titleH + titleV + titleSafe, (maxYDom - innerTop) + titleH + titleV + titleSafe + bottomSafe + domainPadTop + bottomSafeGap);
          (tg as any).position = { x: anchorLeftGlobal, y: Math.round(posY) } as any;
          ((tg as any).style || ((tg as any).style = {})).height = Math.round(newHDom);
          // 保留统一域宽，视图层不在此阶段写回宽度，仅更新高度
          const currentWDom = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
          const finalWDom = Math.max(currentWDom, newWDom);
          (tg as any).measured = { width: Math.round(finalWDom), height: Math.round(newHDom) } as any;
          (tg as any).width = Math.round(finalWDom);
          (tg as any).height = Math.round(newHDom);
          cursorYGlobal = posY + newHDom + domainGapEff;
        }
      } else {
        // 所有域隐藏时（非 dagre 模式）：对所有可见子域进行全局紧凑垂直堆叠
        // 与 dagre 模式下 allDomainsHidden 分支保持一致
        const allSgs = updatedNodes.filter(n =>
          String(n.type || '') === 'subGroup' && !((n as any)?.data)?.hidden
        );

        if (allSgs.length >= 1) {
          // 先对每个子域内部进行布局
          const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
          for (const sg of allSgs) {
            const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            const childNodes = children
              .map(id => idm.get(id))
              .filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
            if (!childNodes.length) continue;

            // 根据节点布局策略进行子域内部节点布局
            const sgX = num(((sg as any)?.position?.x), anchorLeftGlobal);
            const sgY = num(((sg as any)?.position?.y), cursorYGlobal);
            const innerLeft = sgX + subPadH;
            const sgW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 480);
            const innerRight = sgX + Math.max(240, sgW) - subPadH;
            const innerTop = sgY + effectiveTopPad();

            if (nodeLayoutName === 'grid') {
              layoutGrid(childNodes, innerLeft, innerRight, innerTop, 3);
            } else if (nodeLayoutName === 'vertical') {
              layoutVertical(childNodes, innerLeft, innerRight, innerTop);
            } else {
              layoutHorizontal(childNodes, innerLeft, innerRight, innerTop);
            }

            // 回收子域容器尺寸
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
            for (const n of childNodes) {
              const x = num(((n as any)?.position?.x), innerLeft);
              const y = num(((n as any)?.position?.y), innerTop);
              minX = Math.min(minX, x); minY = Math.min(minY, y);
              maxX = Math.max(maxX, x + getW(n)); maxY = Math.max(maxY, y + getH(n));
            }
            if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
              (sg as any).position = { x: Math.round(minX - subPadH), y: Math.round(minY - effectiveTopPad()) };
              const newW = (maxX - minX) + subPadH * 2;
              const newH = (maxY - minY) + effectiveTopPad() + subBottomSafe;
              ((sg as any).style || ((sg as any).style = {})).width = newW;
              ((sg as any).style || ((sg as any).style = {})).height = newH;
              (sg as any).measured = { width: newW, height: newH };
              (sg as any).width = newW;
              (sg as any).height = newH;
            }
          }

          // 全局垂直堆叠：按 y 排序后，确保子域之间不重叠
          const sortedSgs = allSgs.slice().sort((a, b) => num((a as any)?.position?.y, 0) - num((b as any)?.position?.y, 0));
          const subGap = 48; // 紧凑模式间隔
          let cursorY = num((options as any)?.padding?.top, 80);

          for (const sg of sortedSgs) {
            const sgX = num((sg as any)?.position?.x, anchorLeftGlobal);
            const oldY = num((sg as any)?.position?.y, 0);
            const sgH = num((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height, 100);
            const deltaY = cursorY - oldY;

            (sg as any).position = { x: sgX, y: Math.round(cursorY) };

            // 同步子节点位置
            const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            for (const childId of children) {
              const child = idm.get(childId);
              if (child) {
                const cx = num((child as any)?.position?.x, 0);
                const cy = num((child as any)?.position?.y, 0);
                (child as any).position = { x: cx, y: Math.round(cy + deltaY) };
              }
            }

            cursorY += sgH + subGap;
          }
        }
      } // end else - 所有域隐藏时的全局子域紧凑垂直堆叠



      // 统一域宽（保持左边界不变，函数级注释）
      // - 目标：将所有顶层域容器宽度统一为最大域宽，以获得横向列边界对齐效果
      // - 行为：若 measured/style 宽度不足，则按“域内容投影 + 左右 padding”计算；将较小者扩展到最大值；不改动 position.x
      /**
       * 函数级注释：统一域宽（含多个子域容器）
       * - 目标：当一个域内部存在多个子域容器与自由节点时，域宽需要按“所有成员（含 subGroup）水平投影”计算
       * - 行为：仅排除标题容器 titleGroup，其余容器与业务节点一并参与宽度投影；然后统一所有域的宽为最大值
       */
      {
        const tgsAll = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        type Bounds = { d: string; left: number; right: number };
        const boundsByDomain: Record<string, Bounds> = {} as any;
        for (const tg of tgsAll) {
          const d = String(((tg.data as any)?.domain || ''));
          let minX = Infinity, maxX = -Infinity;
          for (const n of updatedNodes) {
            const tp = String(n.type || '');
            const nd = String(((n.data as any)?.domain || '')).trim();
            const belongs = nd === String(d).trim() && tp !== 'titleGroup';
            if (!belongs) continue;
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            if (hidden) continue;
            const x = num(((n as any)?.position?.x), 0);
            const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + w);
          }
          if (isFinite(minX) && isFinite(maxX)) boundsByDomain[d] = { d, left: minX, right: maxX };
        }
        const getMeasuredOrStyleW = (n: any) => num(((n?.measured?.width ?? n?.style?.width)), 0);
        const widths: number[] = tgsAll.map(tg => {
          const d = String(((tg.data as any)?.domain || ''));
          const proj = boundsByDomain[d];
          /**
           * 函数级注释：统一域宽（确定性并排子域宽度 与 投影宽度 取最大）
           */
          const leftAnchor = num(((tg as any)?.position?.x), anchorLeftGlobal);
          const safeEdgeW = Math.max(4, Math.floor(padH * 0.25));
          const subGroupsForD = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d);
          const sumSubW = subGroupsForD.reduce((s, sg) => s + num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0), 0);
          const contentW = proj ? Math.max(0, proj.right - leftAnchor) + padH * 2 + safeEdgeW : 0;
          const deterministicW = (sumSubW > 0 ? sumSubW + padH * 2 + safeEdgeW : 0);
          // 自由节点的确定性宽度（保守）：所有业务节点总宽 + 间隙 + 两侧内边距
          const freeNodesForD = updatedNodes.filter(n => {
            const tp = String(n.type || '');
            const nd = String(((n.data as any)?.domain || ''));
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            return nd === d && tp !== 'titleGroup' && tp !== 'subGroup' && !hidden;
          });
          const freeSumW = freeNodesForD.reduce((s, fn) => s + num((((fn as any)?.measured?.width ?? (fn as any)?.style?.width)), 0), 0);
          const freeExtraGap = Math.max(0, freeNodesForD.length - 1) * Math.min(hGapDet, Math.max(nodeH, hGapDet));
          const freeDeterministicW = freeNodesForD.length ? (freeSumW + freeExtraGap + padH * 2 + Math.max(16, Math.floor(hGapDet * 0.65))) : 0;
          const currentW = getMeasuredOrStyleW(tg);
          return Math.max(currentW, contentW, deterministicW, freeDeterministicW);
        });
        const maxW = widths.length ? Math.max(...widths) : 0;
        if (isFinite(maxW) && maxW > 0) {
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            if (!CONTAINER_TYPES.has(String(n.type || ''))) continue;
            const targetW = maxW;
            ((updatedNodes[i] as any).style || ((updatedNodes[i] as any).style = {})).width = targetW;
            const curH = num((((updatedNodes[i] as any)?.measured?.height ?? (updatedNodes[i] as any)?.style?.height)), titleH + titleV + titleSafe + bottomSafe);
            (updatedNodes[i] as any).measured = { width: targetW, height: curH } as any;
            (updatedNodes[i] as any).width = targetW;
          }
        }
      }

      // 统一域左边界坐标（增强版对齐列左边，函数级注释）
      // - 目标：所有域容器的左边界 x 严格对齐为统一值（anchorLeftGlobal），避免任何残差；同步平移该域的所有成员，包括子域和节点
      // - 增强：添加强制校正检查，如果任何域的 position.x 不等于 anchorLeftGlobal，则递归平移；这确保在布局切换或尺寸变化后左对齐生效
      // - 兼容布局管道：此步骤在统一域宽后执行，不干扰节点布局 → 子域投影 → 域投影 → 单次包含/钳制顺序
      {
        const tgsAll = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        if (tgsAll.length) {
          const anchorLeft = anchorLeftGlobal;
          for (const tg of tgsAll) {
            const dId = String(((tg.data as any)?.domain || ''));
            const curLeft = num(((tg as any)?.position?.x), 0);
            const dx = anchorLeft - curLeft;
            // 强制校正：即使 dx 为 0，也检查并确保锚定
            for (let j = 0; j < updatedNodes.length; j++) {
              const n = updatedNodes[j];
              const belongs = String(((n.data as any)?.domain || '')) === dId;
              if (!belongs) continue;
              const x = Math.round(num(((n as any)?.position?.x), 0) + dx);
              const y = num(((n as any)?.position?.y), 0);
              (updatedNodes[j] as any).position = { x, y } as any;
            }
            // 最终验证：确保域容器左边界等于锚点
            if (num(((tg as any)?.position?.x), 0) !== anchorLeft) {
              (tg as any).position.x = Math.round(anchorLeft);
            }
          }
        }
      }

      // 终态内部重排（函数级注释）
      // 目的：在统一域宽与左对齐后，按域内部可用宽度对该域的子域容器与自由业务节点进行水平换行重排；同时对子域内部 children 进行一次基于子域宽度的换行重排；随后即时回收域高度，为后续垂直堆叠提供准确高度
      {
        /**
         * 函数级注释：终态内部重排（包含隐藏容器）
         * - 目的：不论显示与否，统一计算域与子域的宽高与内部排布，保证统一域宽/高度回收的准确性
         * - 参与：titleGroup/domain/group 三类容器全部参与（不筛选 hidden）
         */
        const tgsAll = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        for (const tg of tgsAll) {
          const dId = String(((tg.data as any)?.domain || ''));
          const x = num(((tg as any)?.position?.x), anchorLeftGlobal);
          const y = num(((tg as any)?.position?.y), 0);
          const w = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
          const innerLeft = x + padH;
          const innerRight = x + w - padH;
          const innerTop = y + titleH + titleV + titleSafe;

          let subGroups = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId);
          subGroups = subGroups.slice().sort((a, b) => orderKeyOf(a) - orderKeyOf(b));

          if (subGroups.length) {
            const domXCur = num(((tg as any)?.position?.x), anchorLeftGlobal);
            const domWCur = num((((tg as any)?.style?.width ?? (tg as any)?.measured?.width)), 0);
            const curDomRight = domXCur + Math.max(1, domWCur) - padH;
            void curDomRight;
          }

          for (const sg of subGroups) {
            const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            if (!children.length) continue;
            const sgX = num(((sg as any)?.position?.x), innerLeft - subPadH);
            const sgY = num(((sg as any)?.position?.y), innerTop - subTitleH - subTitleV - subPadTop);
            const sgW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 480);
            const childLeft = sgX + subPadH;
            let childRight = childLeft + Math.max(240, Math.round(sgW)) - subPadH;
            const startYChild = sgY + subTitleH + subTitleV + subPadTop;
            const childNodes = children.map(id => idMap.get(id)).filter((cn): cn is ReactFlowNode => !!cn);
            {
              const widthsSum = childNodes.reduce((sum, n) => sum + num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240), 0);
              const gapsSum = Math.max(0, childNodes.length - 1) * nodeH;
              childRight = childLeft + widthsSum + gapsSum;
            }
            /**
             * 函数级注释：终态阶段的 ELK 无边回退与防重叠
             * - 若子域内部局部边为空，ELK 可能造成同点重叠；此处回退为网格/横排以确保可视无重叠
             * - 即使使用 ELK，也执行一次轻量防重叠修正
             */
            {
              /** 函数级注释：终态阶段对子域 children 不再重布局（ELK 保持原位） */
              // dagre 布局已在前面计算完成，跳过此处的重排
              if (nodeLayoutName === 'dagre') {
                // dagre 布局已计算位置，保留层次结构
              } else if (nodeLayoutName === 'grid') {
                const gridColsForDomain3 = (subGroups.length >= 3 ? 2 : 3);
                layoutGrid(childNodes, childLeft, childRight, startYChild, gridColsForDomain3);
                fixChildOverlaps(childNodes as any, nodeLayoutName as any);
              } else if (nodeLayoutName === 'vertical') {
                layoutVertical(childNodes, childLeft, childRight, startYChild);
                fixChildOverlaps(childNodes as any, nodeLayoutName as any);
              } else if (nodeLayoutName === 'horizontal' || nodeLayoutName === 'centered') {
                layoutHorizontal(childNodes, childLeft, childRight, startYChild);
                fixChildOverlaps(childNodes as any, nodeLayoutName as any);
              }
            }
            // 子域内部按策略消解可能的重叠，避免上游数据异常导致的碰撞

            if (nodeLayoutName !== 'dagre') {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              const getWc = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
              const getHc = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
              for (const n of childNodes) {
                const cx = num(((n as any)?.position?.x), childLeft);
                const cy = num(((n as any)?.position?.y), startYChild);
                minX = Math.min(minX, cx); minY = Math.min(minY, cy);
                maxX = Math.max(maxX, cx + getWc(n)); maxY = Math.max(maxY, cy + getHc(n));
              }
              if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
                // 行宽/行高合成：按已放置坐标分行，行高取行内最大节点高度，行宽为该行节点宽度之和 + 间隙
                const sorted = [...childNodes].sort((a, b) => num(((a as any)?.position?.y), 0) - num(((b as any)?.position?.y), 0));
                const rows: ReactFlowNode[][] = [];
                const avgHc = childNodes.length ? Math.floor(childNodes.reduce((s, n) => s + getHc(n), 0) / childNodes.length) : 0;
                const rowThreshold = Math.max(8, Math.floor(Math.min(nodeV, Math.max(8, Math.floor(avgHc * 0.4)))));
                for (const n of sorted) {
                  const ny = num(((n as any)?.position?.y), 0);
                  if (!rows.length) { rows.push([n]); continue; }
                  const lastRow = rows[rows.length - 1];
                  const lastY = num(((lastRow[0] as any)?.position?.y), 0);
                  if (Math.abs(ny - lastY) <= rowThreshold) lastRow.push(n); else rows.push([n]);
                }
                const rowHeights = rows.map(r => Math.max(...r.map(getHc)));
                const rowWidths = rows.map(r => r.reduce((s, n) => s + getWc(n), 0) + Math.max(0, r.length - 1) * nodeH);
                const contentHRows = (rowHeights.length ? rowHeights.reduce((s, h) => s + h, 0) : 0) + Math.max(0, (rowHeights.length - 1)) * nodeV;
                const rowsMaxW = rowWidths.length ? Math.max(...rowWidths) : 0;
                const spanW = Math.max(0, maxX - minX);
                const contentWRows = Math.max(rowsMaxW, spanW);
                const safeEdge = 0;
                const newW = contentWRows + subPadH * 2 + safeEdge;
                const newH = contentHRows + subTitleH + subTitleV + subPadTop + subBottomSafe;
                (sg as any).position = { x: minX - subPadH, y: minY - subTitleH - subTitleV - subPadTop } as any;
                const finalW = Math.round(newW);
                const finalH = Math.round(newH);
                ((sg as any).style || ((sg as any).style = {})).width = finalW;
                ((sg as any).style || ((sg as any).style = {})).height = finalH;
                (sg as any).measured = { width: finalW, height: finalH } as any;
                (sg as any).width = finalW;
                (sg as any).height = finalH;
              }
            }
          }

          // 单子域容器水平居中（不改变 children 相对布局）
          if (subGroups.length === 1) {
            const sg = subGroups[0] as any;
            const sgX = num((sg?.position?.x), innerLeft - subPadH);
            const sgW = num(((sg?.measured?.width ?? sg?.style?.width)), 0);
            const availW = Math.max(0, innerRight - innerLeft);
            if (sgW > 0 && availW > sgW) {
              const targetX = Math.round(innerLeft + (availW - sgW) / 2) - subPadH;
              const dx = targetX - sgX;
              (sg as any).position = { x: targetX, y: num(((sg as any)?.position?.y), innerTop - subTitleH - subTitleV - subPadTop) } as any;
              const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
              for (const cid of children) {
                const child = idMap.get(cid);
                if (!child) continue;
                const cx = num(((child as any)?.position?.x), 0) + dx;
                const cy = num(((child as any)?.position?.y), 0);
                (child as any).position = { x: cx, y: cy } as any;
              }
            }
            const curDomW = num((((tg as any)?.style?.width ?? (tg as any)?.measured?.width)), 0);
            const safeEdge = Math.max(12, Math.floor(hGapDet * 0.6));
            const requiredDomW = Math.max(curDomW, sgW + padH * 2 + safeEdge);
            ((tg as any).style || ((tg as any).style = {})).width = requiredDomW;
            (tg as any).measured = { width: requiredDomW, height: num((((tg as any)?.measured?.height ?? (tg as any)?.style?.height)), titleH + titleV + titleSafe) } as any;
            (tg as any).width = requiredDomW;
          }

          // 基于子域并排的确定性宽度，先行扩展当前域宽，确保后续自由节点水平布局不受临时右界限制
          {
            const curDomW = num((((tg as any)?.style?.width ?? (tg as any)?.measured?.width)), 0);
            // 按动态列数估算“每行最大宽度”，避免将所有子域宽度直接相加导致过度扩展
            const widthsArr = subGroups.map(sg => num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0));
            const hGapEff = Math.max(12, hGapDet);
            const totalWDet = (widthsArr.length ? widthsArr.reduce((s, w) => s + w, 0) : 0) + Math.max(0, widthsArr.length - 1) * hGapEff;
            const safeEdge = Math.max(12, Math.floor(hGapEff * 0.6));
            const requiredDomW = (totalWDet > 0 ? totalWDet + padH * 2 + safeEdge : 0);
            const domWFinal = Math.max(curDomW, Math.ceil(requiredDomW));
            ((tg as any).style || ((tg as any).style = {})).width = domWFinal;
            (tg as any).measured = { width: domWFinal, height: num((((tg as any)?.measured?.height ?? (tg as any)?.style?.height)), titleH + titleV + titleSafe) } as any;
            (tg as any).width = domWFinal;
          }

          // 自由业务节点保持混排结果，不进行二次布局

          let minY = Infinity, maxY = -Infinity;
          let minXDom = Infinity, maxXDom = -Infinity;
          for (const n of updatedNodes) {
            const belongs = String(((n.data as any)?.domain || '')) === dId;
            if (!belongs) continue;
            const tp = String(n.type || '');
            if (tp === 'titleGroup') continue;
            const ny = num(((n as any)?.position?.y), innerTop);
            const nh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
            const nx = num(((n as any)?.position?.x), anchorLeftGlobal + padH);
            const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            minY = Math.min(minY, ny);
            maxY = Math.max(maxY, ny + nh);
            minXDom = Math.min(minXDom, nx);
            maxXDom = Math.max(maxXDom, nx + nw);
          }
          const contentH = isFinite(minY) && isFinite(maxY) ? Math.max(0, maxY - innerTop) : 0;
          const domainPadTop2 = num((cfg?.domain?.padding?.vertical), 0);
          const newH = titleH + titleV + titleSafe + contentH + bottomSafe + domainPadTop2;
          ((tg as any).style || ((tg as any).style = {})).height = newH;
          const innerLeftDom = num(((tg as any)?.position?.x), anchorLeftGlobal) + padH;
          const safeEdgeW2 = Math.max(4, Math.floor(padH * 0.25));
          const contentWComputed = isFinite(minXDom) && isFinite(maxXDom)
            ? Math.max(0, maxXDom - innerLeftDom) + padH + safeEdgeW2
            : 0;
          const curWFinal = Math.max(
            num((((tg as any)?.style?.width ?? (tg as any)?.measured?.width)), 0),
            contentWComputed
          );
          ((tg as any).style || ((tg as any).style = {})).width = curWFinal;
          (tg as any).measured = { width: curWFinal, height: newH } as any;
          (tg as any).width = curWFinal;
          (tg as any).height = newH;


        }
      }

      /**
       * 函数级注释：将域内自由业务节点下推到子域横排之下
       * - 目的：在“子域与自由节点混排横排”后，确保同域内的普通业务节点位于子域行的下方，避免与子域容器发生垂直重叠
       * - 时机：终态内部重排与域宽统一后，进行一次全域遍历下推，再进入后续的垂直防重叠与堆叠收敛
       */
      updatedNodes = pushFreeNodesBelowSubGroupRow(updatedNodes) as any;
      updatedNodes = resolveFreeNodeOverlapsInDomain(updatedNodes, Math.max(12, subPadH), Math.max(8, nodeV)) as any;

      // 二次垂直防重叠确认（函数级注释）
      // - 统一域宽后再执行一次垂直防重叠，确保最终高度与间隙满足要求（包含阴影安全）
      {
        const tgs = updatedNodes
          .filter(n => CONTAINER_TYPES.has(String(n.type || '')))
          .sort((a, b) => orderIndexOfDomainContainer(a) - orderIndexOfDomainContainer(b));
        const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), titleH + titleV + titleSafe + bottomSafe);
        for (let i = 1; i < tgs.length; i++) {
          const prev = tgs[i - 1];
          const curr = tgs[i];
          const prevBottom = num(((prev as any)?.position?.y), 0) + getH(prev);
          const minTop = prevBottom + domainGapEff;
          const curTop = num(((curr as any)?.position?.y), 0);
          if (curTop < minTop) {
            const dy = minTop - curTop;
            const dId = String(((curr.data as any)?.domain || ''));
            for (let j = 0; j < updatedNodes.length; j++) {
              const n = updatedNodes[j];
              const belongs = String(((n.data as any)?.domain || '')) === dId;
              if (!belongs) continue;
              const x = num(((n as any)?.position?.x), 0);
              const y = num(((n as any)?.position?.y), 0) + dy;
              (updatedNodes[j] as any).position = { x, y } as any;
            }
          }
        }
      }

      // 最终域垂直堆叠收敛（函数级注释）
      // - 目标：无条件按顺序使域容器顶部单调递增，保证最小间隙（domainGap + shadowPad），彻底消除轻微贴边
      // - 方法：按 y 升序遍历域容器，赋值当前域的目标 top = max(当前 top, 上一域 bottom + domainGap + shadowPad)，并同步平移域成员
      {
        const tgs = updatedNodes
          .filter(n => CONTAINER_TYPES.has(String(n.type || '')))
          .sort((a, b) => orderIndexOfDomainContainer(a) - orderIndexOfDomainContainer(b));
        const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), titleH + titleV + titleSafe + bottomSafe);
        let cursorTop = num((options as any)?.padding?.top, 0);
        for (let i = 0; i < tgs.length; i++) {
          const tg = tgs[i];
          const curTop = num(((tg as any)?.position?.y), 0);
          // 统一域间距：无论当前 top 大小，强制放置到 cursorTop，实现固定间隔
          const targetTop = cursorTop;
          const dy = targetTop - curTop;
          if (dy !== 0) {
            const dId = String(((tg.data as any)?.domain || ''));
            for (let j = 0; j < updatedNodes.length; j++) {
              const n = updatedNodes[j];
              const belongs = String(((n.data as any)?.domain || '')) === dId;
              if (!belongs) continue;
              const x = num(((n as any)?.position?.x), 0);
              const y = num(((n as any)?.position?.y), 0) + dy;
              (updatedNodes[j] as any).position = { x, y } as any;
            }
          }
          cursorTop = targetTop + getH(tg) + domainGapFinal;
        }
      }

      // 终态钳制一次，确保高度内的所有成员被严格包含（不改变节点内部相对布局）




      // 居中对齐（函数级注释）
      // 目的：尽可能让子域内的节点、以及域内未归属子域的节点在各自可用水平范围内居中显示
      // 行为：
      // 1) 子域 children 在其内部宽度内水平居中；若超过可用宽度则不平移，只做边界钳制
      // 2) 子域容器在域内部宽度内水平居中；若子域宽度超过域内部宽度，则贴左并保持钳制宽度
      // 3) 域内未归属子域的业务节点在域内部宽度内水平居中；随后统一钳制
      {
        // 1) 子域 children 居中
        const subGroups = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
        for (const sg of subGroups) {
          const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
          if (!children.length) continue;
          const sgX = num(((sg as any)?.position?.x), 0);
          const _sgW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
          const innerLeft = sgX + subPadH;
          let minX = Infinity, maxX = -Infinity;
          for (const n of updatedNodes) {
            if (!children.includes(n.id)) continue;
            const nx = num(((n as any)?.position?.x), innerLeft);
            const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            minX = Math.min(minX, nx);
            maxX = Math.max(maxX, nx + nw);
          }
          // 行业绝对左起：取消居中，仅在后续钳制中贴左到 innerLeft
          // 此处不进行水平平移，保持前一步排布结果
          if (isFinite(minX) && isFinite(maxX)) {
            // no-op for centering
          }
        }

        // 2) 子域容器水平钳制（保留已排布的横向位置，不重置为贴左）
        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');

        // 3) 域内未归属子域的节点在域内部居中
        for (const dc of domainsList) {
          const dId = String((((dc as any).data?.domain || '')));
          const x = num(((dc as any)?.position?.x), 0);
          const _y = num(((dc as any)?.position?.y), 0);
          const _w = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const innerLeft = x + padH;

          let minX = Infinity, maxX = -Infinity;
          const list: number[] = [];
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            const tp = String(n.type || '');
            const belongs = String(((n.data as any)?.domain || '')) === dId;
            if (!belongs || tp === 'titleGroup' || tp === 'subGroup') continue;
            const nx = num(((n as any)?.position?.x), innerLeft);
            const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            minX = Math.min(minX, nx);
            maxX = Math.max(maxX, nx + nw);
            list.push(i);
          }
          // 行业绝对左起：域内未归属子域的节点不再居中，保持贴左
          if (isFinite(minX) && isFinite(maxX) && list.length) {
            // no centering move; rely on后续钳制贴左
          }
        }
      }

      // 终态域尺寸回收（函数级注释）
      // 目的：左对齐/统一宽/堆叠与钳制之后，按最终成员投影回收各域容器高度，确保“严格包含 + 呼吸感”
      // Dagre 模式跳过：已经精确计算，防止误重置
      if (nodeLayoutName !== 'dagre') {
        const domainContainers = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        for (let i = 0; i < domainContainers.length; i++) {
          const dc = domainContainers[i];
          const dId = String((((dc as any).data?.domain || '')));
          const x = anchorLeftGlobal;
          const titleTop = num(((dc as any)?.position?.y), 0);
          const innerTop = titleTop + titleH + titleV + titleSafe;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const n of updatedNodes) {
            const belongs = String(((n.data as any)?.domain || '')) === dId;
            if (!belongs) continue;
            const tp = String(n.type || '');
            if (tp === 'titleGroup') continue;
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            if (hidden) continue;
            const ny = num(((n as any)?.position?.y), innerTop);
            const nh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
            minY = Math.min(minY, ny);
            maxY = Math.max(maxY, ny + nh);
          }
          const contentH = isFinite(minY) && isFinite(maxY) ? Math.max(0, maxY - innerTop) : 0;
          const domainPadTop3 = num((cfg?.domain?.padding?.vertical), 0);
          const newH = titleH + titleV + titleSafe + contentH + bottomSafe + domainPadTop3;
          const w = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          (domainContainers[i] as any).position = { x, y: titleTop } as any;
          ((domainContainers[i] as any).style || ((domainContainers[i] as any).style = {})).width = w;
          ((domainContainers[i] as any).style || ((domainContainers[i] as any).style = {})).height = newH;
          (domainContainers[i] as any).measured = { width: w, height: newH } as any;
          (domainContainers[i] as any).width = w;
          (domainContainers[i] as any).height = newH;
        }
      }

      // 域内整体水平居中（函数级注释）
      // 目的：在统一域宽且左对齐后，保证域内所有成员（子域与未归属子域的节点）在域内部水平范围内整体居中，减少偏向一侧导致的溢出
      // 行为：计算域内部成员的最终水平投影，按域内部允许宽度做整体 dx 平移
      {
        const domainContainersCenter = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        for (const dc of domainContainersCenter) {
          const dId = String(((dc as any).data?.domain || '')).trim();
          const dcX = num(((dc as any)?.position?.x), 0);
          const dcW = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const innerLeftDc = dcX + padH;
          const availWDc = Math.max(0, dcW - padH * 2);
          // 收集域内所有非 titleGroup 可见成员的水平投影
          let minXDc = Infinity, maxXDc = -Infinity;
          for (const n of updatedNodes) {
            const nd = String(((n.data as any)?.domain || '')).trim();
            const tp = String(n.type || '');
            if (nd !== dId || tp === 'titleGroup') continue;
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            if (hidden) continue;
            const nx = num(((n as any)?.position?.x), 0);
            const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            minXDc = Math.min(minXDc, nx);
            maxXDc = Math.max(maxXDc, nx + nw);
          }
          if (!isFinite(minXDc) || !isFinite(maxXDc)) continue;
          const contentWDc = maxXDc - minXDc;
          if (contentWDc <= 0 || availWDc <= contentWDc) continue;
          const dxCenter = Math.round(innerLeftDc + (availWDc - contentWDc) / 2 - minXDc);
          if (dxCenter === 0) continue;
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            const nd = String(((n.data as any)?.domain || '')).trim();
            const tp = String(n.type || '');
            if (nd !== dId || tp === 'titleGroup') continue;
            const nx = num(((n as any)?.position?.x), 0) + dxCenter;
            const ny = num(((n as any)?.position?.y), 0);
            (updatedNodes[i] as any).position = { x: Math.round(nx), y: ny } as any;
          }
        }
      }


      // 最终严格包含收敛（函数级注释）
      // 目的：在整体居中后，对子域容器与其 children 进行垂直/水平再次钳制，确保完全落在域内部边界；随后再按最终投影回收域高度


      // 终态垂直单调堆叠（函数级注释）
      // 目的：在终态域尺寸回收后，再次确保所有域容器按“上一域 bottom + 有效间隙 + 阴影安全”单调堆叠，彻底统一对齐与呼吸感
      // Dagre 模式跳过：Phase 1 已完成堆叠
      if (nodeLayoutName !== 'dagre') {
        // [FIX] 堆叠前必须再次确认域高度，确保使用最新的投影高度进行堆叠计算
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;

        const tgs = updatedNodes
          .filter(n => String(n.type || '') === 'titleGroup')
          .sort((a, b) => num(((a as any)?.position?.y), 0) - num(((b as any)?.position?.y), 0));
        const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), titleH + titleV + titleSafe + bottomSafe);
        let cursorTop = num((options as any)?.padding?.top, 0);
        for (let i = 0; i < tgs.length; i++) {
          const tg = tgs[i];
          const curTop = num(((tg as any)?.position?.y), 0);
          const targetTop = cursorTop;
          const dy = targetTop - curTop;
          if (dy !== 0) {
            const dId = String(((tg.data as any)?.domain || ''));
            for (let j = 0; j < updatedNodes.length; j++) {
              const n = updatedNodes[j];
              const belongs = String(((n.data as any)?.domain || '')) === dId;
              if (!belongs) continue;
              const x = num(((n as any)?.position?.x), 0);
              const y = num(((n as any)?.position?.y), 0) + dy;
              (updatedNodes[j] as any).position = { x, y } as any;
            }
          }
          cursorTop = targetTop + getH(tg) + domainGapEff;
        }
      }

      // 终态左锚强制确认（函数级注释）
      // 目的：在全部收敛之后，以“当前最小左边界”为统一锚点，确保所有域容器左边界严格一致；同步平移该域成员与子域 children
      {
        const tgsAll = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        if (tgsAll.length) {
          const anchorLeft = Math.round(anchorLeftGlobal);
          for (const tg of tgsAll) {
            const dId = String(((tg.data as any)?.domain || ''));
            const curLeft = num(((tg as any)?.position?.x), 0);
            const dx = anchorLeft - curLeft;
            if (dx !== 0) {
              for (let i = 0; i < updatedNodes.length; i++) {
                const n = updatedNodes[i];
                const belongs = String(((n.data as any)?.domain || '')) === dId;
                if (!belongs) continue;
                const x = Math.round(num(((n as any)?.position?.x), 0) + dx);
                const y = num(((n as any)?.position?.y), 0);
                (updatedNodes[i] as any).position = { x, y } as any;
                if (String(n.type || '') === 'subGroup') {
                  const children = Array.isArray((n.data as any)?.children) ? (n.data as any).children as string[] : [];
                  for (const cid of children) {
                    const child = idMap.get(cid);
                    if (child) {
                      const cx = num(((child as any)?.position?.x), 0) + dx;
                      const cy = num(((child as any)?.position?.y), 0);
                      (child as any).position = { x: cx, y: cy } as any;
                    }
                  }
                }
              }
            }
            (tg as any).position.x = Math.round(anchorLeft);
          }
        }
      }

      {
        /**
         * 函数级注释：域容器投影回收（严格几何）
         * - 宽度：依据域内成员（子域容器与自由节点）的最大右缘与域内部左锚的跨度 + 左右内边距
         * - 高度：依据域内成员的最大下缘与域标题底部锚的跨度 + 底部安全留白
         * - 不使用行宽估算，不引入额外扩展；只做“投影包含”，避免过度扩张或右缘低估
         */
        const domainContainers = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        const requiredByDomain: Record<string, { w: number; h: number }> = {} as any;
        for (const dc of domainContainers) {
          const dId = String((((dc as any).data?.domain || ''))).trim();
          const dx = num(((dc as any)?.position?.x), 0);
          const dy = num(((dc as any)?.position?.y), 0);
          const innerLeft = dx + padH;
          const innerTop = dy + titleH + titleV + titleSafe;
          let maxRight = -Infinity;
          let maxBottom = -Infinity;
          for (const n of updatedNodes) {
            const nd = String(((n.data as any)?.domain || '')).trim();
            const tp = String(n.type || '');
            if (nd !== dId || tp === 'titleGroup') continue;
            const nx = num(((n as any)?.position?.x), 0);
            const ny = num(((n as any)?.position?.y), 0);
            const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            const nh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 80);
            maxRight = Math.max(maxRight, nx + nw);
            maxBottom = Math.max(maxBottom, ny + nh);
          }
          const projW = isFinite(maxRight) ? Math.max(0, maxRight - innerLeft) + padH * 2 : num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const contentH = isFinite(maxBottom) ? Math.max(0, maxBottom - innerTop) : 0;
          const projH = (titleH + titleV + titleSafe) + contentH + bottomSafe;
          requiredByDomain[dId] = { w: Math.ceil(projW), h: Math.ceil(projH) };
        }
        const maxUnifiedW = Object.values(requiredByDomain).length ? Math.max(...Object.values(requiredByDomain).map(v => v.w)) : 0;
        if (isFinite(maxUnifiedW) && maxUnifiedW > 0) {
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            if (!CONTAINER_TYPES.has(String(n.type || ''))) continue;
            const dId = String((((n as any).data?.domain || ''))).trim();
            const need = requiredByDomain[dId];
            const targetH = need ? need.h : num((((updatedNodes[i] as any)?.measured?.height ?? (updatedNodes[i] as any)?.style?.height)), titleH + titleV + titleSafe + bottomSafe);
            ((updatedNodes[i] as any).style || ((updatedNodes[i] as any).style = {})).width = maxUnifiedW;
            ((updatedNodes[i] as any).style || ((updatedNodes[i] as any).style = {})).height = targetH;
            (updatedNodes[i] as any).measured = { width: maxUnifiedW, height: targetH } as any;
            (updatedNodes[i] as any).width = maxUnifiedW;
            (updatedNodes[i] as any).height = targetH;
          }
        }
      }

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
      {
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        const maxIter = Math.max(1, numLocal(layeredCfg.get<number>('diagram.layout.subGroupPush.iterations' as any, 5) as any, 5));
        const gapRightEffPush = (nodeLayoutName === 'grid') ? Math.max(12, Math.floor(hGapDet * 0.4)) : Math.max(12, hGapDet);
        const safeEdgeBase = (nodeLayoutName === 'grid') ? Math.max(4, Math.floor(hGapDet * 0.2)) : Math.max(12, hGapDet);
        const safeEdge = Math.max(0, numLocal(layeredCfg.get<number>('diagram.layout.subGroupPush.safeEdge' as any, safeEdgeBase) as any, safeEdgeBase));
        for (const dc of domainsList) {
          const dId = String((((dc as any).data?.domain || '')));
          if (!dId) continue;
          const domX = numLocal(((dc as any)?.position?.x), 0);
          const innerLeft = domX + padH;
          let iter = 0;
          while (iter < maxIter) {
            let moved = false;
            updatedNodes = ensureMeasuredForNodes(updatedNodes);
            updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as any;
            updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
            const sgs = updatedNodes
              .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden)
              .slice().sort((a, b) => numLocal(((a as any)?.position?.x), 0) - numLocal(((b as any)?.position?.x), 0));
            let prevRight = innerLeft - subPadH + safeEdge;
            for (const sg of sgs) {
              const sx = numLocal(((sg as any)?.position?.x), prevRight);
              const sy = numLocal(((sg as any)?.position?.y), 0);
              const sw = numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), Math.max(240, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120));
              /**
               * 函数级注释：推开不受右界钳制限制
               * - 说明：此处不以 innerRight 作为上限，先按“前一右缘 + hGapDet + safeEdge”整体推开；
               *        随后通过域水平投影扩展域宽来容纳推开结果，避免“右界限制导致再次重叠”。
               */
              const desiredX = Math.max(sx, prevRight);
              const dx = Math.round(desiredX - sx);
              if (dx !== 0) {
                (sg as any).position = { x: Math.round(desiredX), y: sy } as any;
                const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
                for (const cid of children) {
                  const c = idm.get(cid);
                  if (!c) continue;
                  const cx = numLocal(((c as any)?.position?.x), 0) + dx;
                  const cy = numLocal(((c as any)?.position?.y), 0);
                  (c as any).position = { x: Math.round(cx), y: Math.round(cy) } as any;
                }
                moved = true;
              }
              prevRight = desiredX + sw + gapRightEffPush + safeEdge;
            }
            if (!moved) break;
            updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;

            iter++;
          }
          /**
           * 函数级注释：推开后按投影扩展域宽（单域）
           * - 目标：以当前域成员的最大右缘为准，计算所需域宽并写回；随后再统一域宽
           */
          {
            let maxRight = -Infinity;
            for (const n of updatedNodes) {
              const nd = String(((n.data as any)?.domain || '')).trim();
              const tp = String(n.type || '');
              if (nd !== dId || tp === 'titleGroup') continue;
              const nx = numLocal(((n as any)?.position?.x), 0);
              const nw = numLocal((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
              maxRight = Math.max(maxRight, nx + nw);
            }
            if (isFinite(maxRight)) {
              const requiredW = Math.max(0, maxRight - domX) + padH * 2 + Math.max(16, Math.floor(Math.max(12, hGapDet) * 0.65));
              ((dc as any).style || ((dc as any).style = {})).width = requiredW;
              (dc as any).measured = { width: requiredW, height: numLocal((((dc as any)?.measured?.height ?? (dc as any)?.style?.height)), 0) } as any;
              (dc as any).width = requiredW;
            }
          }
        }
      }
      updatedNodes = resolveDomainContainerOverlaps(updatedNodes, domainGapFinal) as any;


      // Grid 容器二次“域宽感知”回收：按域的可用内宽计算子域的列容量并重排 children，再回收容器
      if (nodeLayoutName === 'grid') {
        const cfgFull = diagramConfigManager.getConfig() as any;
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const padH = numLocal(cfgFull?.domain?.padding?.horizontal, 24);
        const subPadH = numLocal((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.H), Math.max(16, Math.floor(padH * 0.8)));
        const subPadTop = numLocal((cfgFull?.subDomain?.padding?.top ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subGroup?.padding?.top ?? cfgFull?.subGroup?.padding?.vertical), Math.max(12, Math.floor(padH * 0.8)));
        const subTitleH = numLocal(cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height, 28);
        const subTitleV = numLocal(cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical, 8);
        const bottomSafe = numLocal((cfgFull?.subDomain?.padding?.bottom ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.V_BOTTOM_SAFE ?? cfgFull?.subGroup?.padding?.bottom ?? cfgFull?.subGroup?.padding?.vertical), 12);

        const idMapLocal = new Map<string, ReactFlowNode>();
        for (const n of updatedNodes) idMapLocal.set(String(n.id), n);

        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of domainsList) {
          const dId = String((((dc as any).data?.domain || '')));
          const x = numLocal(((dc as any)?.position?.x), 0);
          const y = numLocal(((dc as any)?.position?.y), 0);
          const w = numLocal((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const innerLeft = x + padH;
          const _innerRight = innerLeft + Math.max(0, w - padH * 2);
          const sgs = updatedNodes
            .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden)
            .slice().sort((a, b) => orderKeyOf(a) - orderKeyOf(b));
          const desiredCols = (sgs.length >= 3 ? 2 : 3);
          for (const sg of sgs) {
            const sgX = numLocal(((sg as any)?.position?.x), innerLeft - subPadH);
            const sgY = numLocal(((sg as any)?.position?.y), y + subTitleH + subTitleV);
            const startY = sgY + subTitleH + subTitleV + subPadTop;
            const leftBound = sgX + subPadH;
            const childrenIds = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
            const childNodes = childrenIds.map(cid => idMapLocal.get(cid)).filter(Boolean) as ReactFlowNode[];
            if (!childNodes.length) continue;
            const widthsArr = childNodes.map(c => numLocal((((c as any)?.measured?.width ?? (c as any)?.style?.width ?? (c as any)?.width)), 120));
            const hGapEff = Math.max(12, hGapDet);
            const colsPre = Math.max(1, Math.min(desiredCols, childNodes.length));
            let predictedRowMaxW = 0;
            for (let i = 0; i < widthsArr.length; i += colsPre) {
              const slice = widthsArr.slice(i, i + colsPre);
              const sumW = slice.reduce((s, w) => s + w, 0);
              const gaps = Math.max(0, slice.length - 1) * hGapEff;
              predictedRowMaxW = Math.max(predictedRowMaxW, sumW + gaps);
            }
            const virtRightBound = leftBound + predictedRowMaxW;
            const colsFinal = colsPre;
            const res: any = layoutGrid(childNodes, leftBound, virtRightBound, startY, colsFinal);
            const rowHeights = (res?.rows || []).map((r: ReactFlowNode[]) => Math.max(...r.map((n: ReactFlowNode) => numLocal(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 80))));
            const maxX = Math.max(...childNodes.map(c => numLocal(((c as any)?.position?.x), 0) + numLocal(((c as any)?.measured?.width ?? (c as any)?.style?.width ?? (c as any)?.width), 120)));
            const minX = Math.min(...childNodes.map(c => numLocal(((c as any)?.position?.x), 0)));
            const rowsMaxW = Array.isArray(res?.rowWidths) && res.rowWidths.length ? Math.max(...res.rowWidths) : 0;
            const spanW = Math.max(0, maxX - minX);
            const contentWRows = Math.max(rowsMaxW, spanW);
            const contentHRows = (rowHeights.length ? rowHeights.reduce((sum: number, h: number) => sum + h, 0) : 0) + Math.max(0, (rowHeights.length - 1)) * Math.max(8, nodeV);
            const finalW = Math.round(contentWRows + subPadH * 2);
            const finalH = Math.round(contentHRows + subTitleH + subTitleV + subPadTop + bottomSafe);
            (sg as any).position = { x: Math.round(minX - subPadH), y: Math.round(sgY) } as any;
            ((sg as any).style || ((sg as any).style = {})).width = finalW;
            ((sg as any).style || ((sg as any).style = {})).height = finalH;
            (sg as any).measured = { width: finalW, height: finalH } as any;
            (sg as any).width = finalW;
            (sg as any).height = finalH;
          }
        }
      }

      /**
       * 函数级注释：严格包含后处理管线
       * - 子域容器尺寸回收：按 children 最终位置与尺寸重算 subGroup 的 position/style/measured
       * - 域容器严格包含：依据域内成员（业务节点与子域容器）重算 titleGroup 的位置与尺寸
       * - 边界钳制：将所有成员钳制到其所属容器的内边界，杜绝任何溢出
       */
      /**
       * 函数级注释：严格包含后处理管线
       * - 子域容器尺寸回收：按 children 最终位置与尺寸重算 subGroup 的 position/style/measured
       * - 域容器严格包含：依据域内成员（业务节点与子域容器）重算 titleGroup 的位置与尺寸
       * - 边界钳制：将所有成员钳制到其所属容器的内边界，杜绝任何溢出
       */
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = purgeSubGroupChildrenBySemantic(updatedNodes) as any;
        // 二次语义同步：根据节点的 subDomain 重新分配 children，避免首次映射遗漏导致容器不包含成员
        updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes) as any;
      }
      /**
       * 函数级注释：阶段二子域专用重排（按布局类型，无折行）
       * - 目标：在统一域宽后，保持 horizontal/centered 的线性横排，不进行可用区域折行；
       * - 行为：vertical→reflowSubGroupChildrenVertical；grid→reflowSubGroupChildrenGrid；horizontal/centered→layoutHorizontal；随后按投影回收子域尺寸。
       */
      {
        const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
        const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
        const padX = Math.max(12, hGapDet);
        const padY = Math.max(8, nodeV);
        for (const sg of sgs) {
          const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
          const list = ch
            .map(id => idm.get(id))
            .filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
          if (!list.length) continue;
          if (nodeLayoutName === 'vertical') {
            const reflowed = reflowSubGroupChildrenVertical(sg as any, list as any, padX, padY) as any;
            const mapReflow = new Map<string, ReactFlowNode>((reflowed as ReactFlowNode[]).map(n => [n.id, n] as const));
            for (const n of list) {
              const p = mapReflow.get(n.id) as any;
              if (p?.position) (n as any).position = { x: Math.round(p.position.x), y: Math.round(p.position.y) } as any;
            }
          } else if (nodeLayoutName === 'grid') {
            const reflowed = reflowSubGroupChildrenGrid(sg as any, list as any, padX, padY) as any;
            const mapReflow = new Map<string, ReactFlowNode>((reflowed as ReactFlowNode[]).map(n => [n.id, n] as const));
            for (const n of list) {
              const p = mapReflow.get(n.id) as any;
              if (p?.position) (n as any).position = { x: Math.round(p.position.x), y: Math.round(p.position.y) } as any;
            }
          } else if (nodeLayoutName === 'dagre') {
            // dagre 布局已在前面计算完成，此处跳过重排以保留层次结构
          } else {
            // horizontal/centered：保持线性横排，不做折行（内联实现，避免前置调用）
            const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
            const SAFE_W = numLocal((diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH, 120);
            const SAFE_H = numLocal((diagramConfigManager.getConfig() as any)?.node?.height, 80);
            const getW = (n: ReactFlowNode) => {
              const mw = numLocal(((n as any)?.measured?.width), SAFE_W);
              const sw = numLocal(((n as any)?.style?.width ?? (n as any)?.width), SAFE_W);
              return Math.max(mw, sw, SAFE_W);
            };
            const getH = (n: ReactFlowNode) => numLocal((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), SAFE_H);
            const leftBound = Math.round((sg as any)?.position?.x || 0) + Math.max(subPadH, 0);
            const startY = Math.round((sg as any)?.position?.y || 0) + subTitleH + subTitleV + subPadTop;
            let x = leftBound; const y = startY; let rowMaxH = 0;
            for (const n of list) {
              (n as any).position = { x: Math.round(x), y: Math.round(y) } as any;
              x += getW(n) + Math.max(12, hGapDet);
              rowMaxH = Math.max(rowMaxH, getH(n));
            }
            void rowMaxH;
          }
        }
        updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
        updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as any;
        updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
      }

      updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;

      // 阶段二子域重排后：域宽重投影
      // 目的：recomputeSubGroupContainersBasic 可能改变子域位置/宽度，通过几何包含重投影确保域宽包含所有成员
      {
        const titleGroups = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const tg of titleGroups) {
          const tgX = num(((tg as any)?.position?.x), 0);
          const tgY = num(((tg as any)?.position?.y), 0);
          const tgH = num(((tg as any)?.measured?.height ?? (tg as any)?.style?.height), 0);
          const tgBottom = tgY + tgH;
          let maxRight = -Infinity;

          // 几何包含匹配：遍历所有非 titleGroup 节点，通过 Y 中心是否在域容器纵向范围内判定归属
          for (const n of updatedNodes) {
            if (n === tg) continue;
            const tp = String(n.type || '');
            if (tp === 'titleGroup') continue;
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            if (hidden) continue;
            const nx = num(((n as any)?.position?.x), 0);
            const ny = num(((n as any)?.position?.y), 0);
            const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 0);
            const nh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 0);
            const nCenterY = ny + nh / 2;
            // 节点 Y 中心在域纵向范围内且 X 在域左边界附近
            if (nCenterY >= tgY && nCenterY <= tgBottom && nx >= tgX - 10) {
              maxRight = Math.max(maxRight, nx + nw);
            }
          }

          if (isFinite(maxRight)) {
            const requiredW = Math.max(0, maxRight - tgX) + padH;
            const currentW = num(((tg as any)?.measured?.width ?? (tg as any)?.style?.width), 0);
            if (requiredW > currentW) {
              ((tg as any).style || ((tg as any).style = {})).width = requiredW;
              (tg as any).measured = { width: requiredW, height: tgH } as any;
              (tg as any).width = requiredW;
            }
          }
        }
      }

      // 终态二次统一域宽：以所有域的最终需求宽度最大值统一
      {
        const domains = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const maxW = domains.length ? Math.max(...domains.map(dc => numLocal((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0))) : 0;
        if (isFinite(maxW) && maxW > 0) {
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            if (String(n.type || '') !== 'titleGroup') continue;
            ((updatedNodes[i] as any).style || ((updatedNodes[i] as any).style = {})).width = maxW;
            const curH = numLocal((((updatedNodes[i] as any)?.measured?.height ?? (updatedNodes[i] as any)?.style?.height)), titleH + titleV + titleSafe + bottomSafe);
            (updatedNodes[i] as any).measured = { width: maxW, height: curH } as any;
            (updatedNodes[i] as any).width = maxW;
            (updatedNodes[i] as any).height = curH;
          }
        }
      }

      // 统一域宽后，保证域间垂直间距：按最终高度计算，逐域下推到最少间距
      {
        const domainsOrdered = updatedNodes.filter(n => String(n.type || '') === 'titleGroup')
          .slice().sort((a, b) => orderIndexOfDomainContainer(a) - orderIndexOfDomainContainer(b));
        const desiredGap = domainGapFinal;
        for (let i = 1; i < domainsOrdered.length; i++) {
          const prev = domainsOrdered[i - 1] as any;
          const curr = domainsOrdered[i] as any;
          const prevTop = num((prev.position?.y), 0);
          const prevH = num(((prev.measured?.height ?? prev.style?.height)), (titleH + titleV + titleSafe));
          const prevBottom = prevTop + prevH;
          const currTop = num((curr.position?.y), 0);
          const neededTop = prevBottom + desiredGap;
          if (currTop < neededTop) {
            const dy = neededTop - currTop;
            const dId = String(((curr.data as any)?.domain || ''));
            for (let k = 0; k < updatedNodes.length; k++) {
              const n = updatedNodes[k] as any;
              const nd = String(((n.data || {})?.domain || ''));
              if (nd !== dId) continue;
              const nx = num((n.position?.x), 0);
              const ny = num((n.position?.y), 0) + dy;
              n.position = { x: nx, y: ny } as any;
            }
          }
        }
      }

      // 终态域顶端对齐与纵向堆叠：以第一个域的顶端为锚，逐域按最终高度与最小间距堆叠，从而消除顶端偏差
      {
        const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup')
          .slice().sort((a, b) => orderIndexOfDomainContainer(a) - orderIndexOfDomainContainer(b));
        if (tgs.length) {
          const baseTop = num(((tgs[0] as any)?.position?.y), 0);
          const gapV = domainGapFinal;
          let cursorY = baseTop;
          for (const tg of tgs) {
            const dId = String((((tg as any).data?.domain || '')));
            const oldTop = num(((tg as any)?.position?.y), 0);
            const h = num((((tg as any)?.measured?.height ?? (tg as any)?.style?.height)), titleH + titleV + titleSafe);
            const dy = cursorY - oldTop;
            if (dy !== 0) {
              for (let i = 0; i < updatedNodes.length; i++) {
                const n = updatedNodes[i] as any;
                const nd = String(((n.data || {})?.domain || ''));
                if (nd !== dId) continue;
                const nx = num((n.position?.x), 0);
                const ny = num((n.position?.y), 0) + dy;
                n.position = { x: nx, y: ny } as any;
              }
            }
            (tg as any).data = { ...(((tg as any).data) || {}), finalizedDomain: true } as any;
            cursorY += h + gapV;
          }
        }
      }
      // 保持混排列，不进行“同域子域宽度统一并左锚对齐”的再排
      // 保持混排顺序：不执行子域行打包再排
      // dagre 模式跳过：保留 dagre 精确计算的子域尺寸
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
      }

      updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;
      updatedNodes = expandSubGroupContainersBySemantic(updatedNodes) as any;
      // 子域容器几何重叠消解（仅在检测到重叠时执行）
      /**
       * 函数级注释：同域子域容器重叠消解（条件触发）
       * - 检测：按域聚合子域容器，计算 bbox，若任意两容器出现交叠则触发一次消解
       * - 行为：仅在检测为 true 时执行 resolveSubGroupOverlaps，避免不必要的位移
       */
      {
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        const safeEdge = Math.max(12, hGapDet);
        const hasOverlap = (() => {
          for (const dc of domainsList) {
            const dId = String((((dc as any).data?.domain || '')));
            const sgs = updatedNodes
              .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
            for (let i = 0; i < sgs.length; i++) {
              const a: any = sgs[i];
              const ax = numLocal((a?.position?.x), 0);
              const ay = numLocal((a?.position?.y), 0);
              const aw = numLocal(((a?.measured?.width ?? a?.style?.width)), 0);
              const ah = numLocal(((a?.measured?.height ?? a?.style?.height)), 0);
              for (let j = i + 1; j < sgs.length; j++) {
                const b: any = sgs[j];
                const bx = numLocal((b?.position?.x), 0);
                const by = numLocal((b?.position?.y), 0);
                const bw = numLocal(((b?.measured?.width ?? b?.style?.width)), 0);
                const bh = numLocal(((b?.measured?.height ?? b?.style?.height)), 0);
                const disjoint = ax >= bx + bw + safeEdge || ax + aw + safeEdge <= bx || ay >= by + bh || ay + ah <= by;
                if (!disjoint) return true;
              }
            }
          }
          return false;
        })();
        if (hasOverlap) {
          const gapEff = (nodeLayoutName === 'grid') ? Math.max(12, Math.floor(hGapDet * 0.4)) : hGapDet;
          updatedNodes = resolveSubGroupOverlaps(updatedNodes, gapEff, subGroupVGapCompact) as any;
        }
      }
      updatedNodes = enforceDomainContainerStrictContainment(updatedNodes) as any;
      // 域内自由节点与子域 children 的重叠最终消解
      updatedNodes = resolveFreeNodeOverlapsInDomain(updatedNodes, Math.max(12, subPadH), Math.max(8, nodeV)) as any;


      // dagre 模式跳过：子域尺寸已在 reflowSubGroupChildrenDagre 中精确计算
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
      }
      updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
      // dagre 模式跳过：避免覆盖 dagre 计算的精确尺寸
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
      }
      updatedNodes = unifySubGroupWidthsByDomain(updatedNodes) as any;
      const gapHUnified = Math.max(8, Math.floor(hGapDet * 0.6));
      const gapVUnified = Math.max(6, Math.floor(nodeV * 0.6));
      updatedNodes = unifySubGroupGapsInDomain(updatedNodes, gapHUnified, gapVUnified, (a, b) => orderKeyOf(a) - orderKeyOf(b)) as any;
      // dagre 模式跳过：保留 dagre 精确计算的子域高度
      if (nodeLayoutName !== 'dagre') {
        updatedNodes = unifySubGroupHeightsByDomain(updatedNodes) as any;
      }
      updatedNodes = resolveSubGroupOverlaps(updatedNodes, gapHUnified, gapVUnified) as any;
      updatedNodes = clampDomainHeightsToSubGroups(updatedNodes) as any;

      /**
       * 函数级注释：终态子域水平推开验证与纠偏
       * - 目标：在统一域宽与钳制之后，确保同域子域容器在单行内不贴合或交叠；如发现，则按“前一右缘 + hGapDet”整体右移并同步 children
       */
      {
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        const safeEdge = Math.max(12, hGapDet);
        for (const dc of domainsList) {
          const dId = String((((dc as any).data?.domain || '')));
          const domX = numLocal(((dc as any)?.position?.x), 0);
          const innerLeft = domX + padH;
          const sgs = updatedNodes
            .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden)
            .slice().sort((a, b) => numLocal(((a as any)?.position?.x), 0) - numLocal(((b as any)?.position?.x), 0));
          const gapRightEff = (nodeLayoutName === 'grid') ? Math.max(12, Math.floor(hGapDet * 0.4)) : Math.max(12, hGapDet);
          // Fix: 第一个子域不应前置偏移，prevRight 初始值修正为域内容左边界
          let prevRight = innerLeft;
          let moved = false;
          for (const sg of sgs) {
            const sx = numLocal(((sg as any)?.position?.x), prevRight);
            const sy = numLocal(((sg as any)?.position?.y), 0);
            const sw = numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), Math.max(240, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120));
            const desiredX = Math.max(sx, prevRight);
            const dx = Math.round(desiredX - sx);
            if (dx > 0) {
              (sg as any).position = { x: Math.round(desiredX), y: sy } as any;
              const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
              for (const cid of children) {
                const c = idm.get(cid);
                if (!c) continue;
                const cx = numLocal(((c as any)?.position?.x), 0) + dx;
                const cy = numLocal(((c as any)?.position?.y), 0);
                (c as any).position = { x: Math.round(cx), y: Math.round(cy) } as any;
              }
              moved = true;
            }
            prevRight = desiredX + sw + gapRightEff + safeEdge;
          }
          if (moved && nodeLayoutName !== 'dagre') {
            // dagre 模式跳过：避免覆盖精确尺寸
            updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
          }
        }
      }

      // 已取消终态“子域水平行打包再排”，保留前序推开与扩域结果

      // 终态再次统一域宽（函数级注释：严格包含与钳制后，按最终成员水平投影扩展域宽）
      {
        const domainContainers = updatedNodes.filter(n => CONTAINER_TYPES.has(String(n.type || '')));
        const requiredByDomain: Record<string, number> = {} as any;
        for (const dc of domainContainers) {
          const dId = String((((dc as any).data?.domain || ''))).trim();
          const x = num(((dc as any)?.position?.x), 0);
          let maxRight = -Infinity;
          for (const n of updatedNodes) {
            const nd = String(((n.data as any)?.domain || '')).trim();
            const tp = String(n.type || '');
            if (nd !== dId || tp === 'titleGroup') continue;
            const nx = num(((n as any)?.position?.x), 0);
            const nw = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 240);
            maxRight = Math.max(maxRight, nx + nw);
          }
          const currentW = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const requiredW = isFinite(maxRight) ? Math.max(currentW, Math.max(0, maxRight - x) + padH * 2 + Math.max(16, Math.floor(hGapDet * 0.65))) : currentW;
          requiredByDomain[dId] = Math.max(requiredByDomain[dId] || 0, requiredW);
        }
        const maxUnifiedW = Object.values(requiredByDomain).length ? Math.max(...Object.values(requiredByDomain)) : 0;
        if (isFinite(maxUnifiedW) && maxUnifiedW > 0) {
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            if (!CONTAINER_TYPES.has(String(n.type || ''))) continue;
            ((updatedNodes[i] as any).style || ((updatedNodes[i] as any).style = {})).width = maxUnifiedW;
            const curH = num((((updatedNodes[i] as any)?.measured?.height ?? (updatedNodes[i] as any)?.style?.height)), titleH + titleV + titleSafe + bottomSafe);
            (updatedNodes[i] as any).measured = { width: maxUnifiedW, height: curH } as any;
            (updatedNodes[i] as any).width = maxUnifiedW;
          }
        }
      }
      // 函数级注释：在节点布局为 vertical 时禁用域内容水平缩放（不适配水平拉伸）
      if ((options as any)?.fitDomainContent !== false && nodeLayoutName !== 'vertical') {
        // 单子域域不做等比铺满，避免拉伸导致视觉异常与误判重叠
        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        const hasMultipleSubGroups = domainsList.some(dc => {
          const dId = String((((dc as any).data?.domain || '')));
          const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
          return sgs.length >= 2;
        });
        // 函数级注释：vertical 模式禁用域内容水平缩放（多子域分支）
        // - 目的：避免在垂直节点布局下对子域与孩子进行水平等比缩放，导致孩子 x 发生整体漂移
        if (!constantGapMode && hasMultipleSubGroups && (options as any)?.fitDomainContent !== false) {
          try {
            const { scaleDomainContentToFitWidthAll } = await import('../utils/layoutUtils');
            updatedNodes = scaleDomainContentToFitWidthAll(updatedNodes) as any;
          } catch {
            // ignore
          }
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
        const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
        const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
        for (const sg of sgs) {
          const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
          const childrenNodes = ch
            .map(id => idm.get(id))
            .filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
          if (!childrenNodes.length) continue;

          // Inline Horizontal Layout with Vertical Centering (Refactored)
          const layoutConfig = diagramConfigManager.getLayoutConfig() as any;
          const cfgFull = diagramConfigManager.getConfig() as any;
          if (nodeLayoutName === 'horizontal') {
            layoutSubGroupChildrenInRow(childrenNodes, sg, layoutConfig, cfgFull);
          } else if (nodeLayoutName === 'vertical') {
            // Vertical: Scatter if overlap + Align Center
            const hGapEff = Math.max(12, Math.floor((layoutConfig?.NODE_H_GAP) || 120));
            scatterNodesAtSamePoint(childrenNodes as any, 'x', hGapEff, 2);
            alignSubGroupStack(childrenNodes);
          } else {
            // Grid or Centered (fallback): Scatter + Row Vertical Center
            const hGapEff = Math.max(12, Math.floor((layoutConfig?.NODE_H_GAP) || 120));
            scatterNodesAtSamePoint(childrenNodes as any, 'x', hGapEff, 2);
            alignSubGroupGridRows(childrenNodes);
          }

        }


        // dagre 模式跳过：避免覆盖精确计算的子域尺寸
        if (nodeLayoutName !== 'dagre') {
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
          updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
        }
        // dagre 模式跳过：子域高度统一，因为 dagre 子域是垂直堆叠的
        if (nodeLayoutName !== 'dagre') {
          const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
          for (const dc of tgs) {
            const dId = String((((dc as any).data?.domain || '')));
            if (!dId) continue;
            const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
            if (sgs.length < 2) continue;
            const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), subTitleH + subTitleV + subPadTop + subBottomSafe);
            const maxH = Math.max(...sgs.map(getH));
            for (const sg of sgs) {
              const curW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
              ((sg as any).style || ((sg as any).style = {})).width = curW;
              ((sg as any).style || ((sg as any).style = {})).height = maxH;
              (sg as any).measured = { width: curW, height: maxH } as any;
              (sg as any).width = curW;
              (sg as any).height = maxH;
            }
          }
        }
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;
      }


      {
        /**
         * 函数级注释：最终域垂直堆叠强制收敛
         * - 目标：在所有“严格包含/钳制/统一宽”之后，保证各域容器之间至少保留 `domainGapEff` 的留白；
         * - 行为：按 y 升序遍历所有域容器，将当前域顶部设置为“上一域底部 + domainGapEff”，并同步平移该域的所有成员；
         */
        const tgs = updatedNodes
          .filter(n => String(n.type || '') === 'titleGroup')
          .slice().sort((a, b) => orderIndexOfDomainContainer(a) - orderIndexOfDomainContainer(b));
        const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height), titleH + titleV + titleSafe + bottomSafe);
        if (tgs.length) {
          let cursorTop = num(((tgs[0] as any)?.position?.y), num((options as any)?.padding?.top, 0));
          for (let i = 0; i < tgs.length; i++) {
            const tg = tgs[i] as any;
            const curTop = num((tg.position?.y), 0);
            const targetTop = cursorTop;
            const dy = targetTop - curTop;
            if (dy !== 0) {
              const dId = String(((tg.data as any)?.domain || ''));
              for (let j = 0; j < updatedNodes.length; j++) {
                const n = updatedNodes[j] as any;
                const belongs = String(((n.data || {})?.domain || '')) === dId;
                if (!belongs) continue;
                const nx = num((n.position?.x), 0);
                const ny = num((n.position?.y), 0) + dy;
                n.position = { x: nx, y: ny } as any;
              }
            }
            cursorTop = targetTop + getH(tg) + domainGapEff;
          }
        }
      }
      /** 函数级注释：阶段停靠（phase2）
       * - 若配置为在阶段二结束时提前返回，则此处直接返回当前稳定结果
       */
      if (((options as any).__stopAfterPhase as any) === 'phase2') return { nodes: updatedNodes, edges } as any;
      {
        /**
         * 函数级注释：最终基于投影精确回收域高度（硬回写）
         * - 目标：以域内部成员（子域容器 + 普通节点）的最大下缘为准，精确计算域高度；不保留中间阶段的扩高痕迹；
         * - 行为：按每个域的 `innerTop = titleH + titleV + titleSafe` 作为参考，contentH = maxBottom - innerTop，height = titleH+titleV+titleSafe + contentH + bottomSafe；
         */
        const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of tgs) {
          const dId = String((((dc as any).data?.domain || '')));
          if (!dId) continue;
          const dy = num(((dc as any)?.position?.y), 0);
          const innerTop = dy + titleH + titleV + titleSafe;
          let maxBottom = innerTop;
          for (const n of updatedNodes) {
            const nd = String(((n.data as any)?.domain || ''));
            const tp = String(n.type || '');
            if (nd !== dId || tp === 'titleGroup') continue;
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            if (hidden) continue;
            const ny = num(((n as any)?.position?.y), innerTop);
            const nh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
            maxBottom = Math.max(maxBottom, ny + nh);
          }
          const contentH = Math.max(0, maxBottom - innerTop);
          const newH = titleH + titleV + titleSafe + contentH + bottomSafe;
          const wKeep = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          (dc as any).style = { ...((dc as any).style || {}), width: wKeep, height: newH } as any;
          (dc as any).measured = { width: wKeep, height: newH } as any;
          (dc as any).height = newH;
        }
      }
      // 子域容器高度最终按投影精确回收，随后再回收域高度
      try {
        await import('../utils/layoutUtils');
        updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
      } catch {
        // ignore
      }
      // 钳制一次，确保子域 children 与域内部边界都严格包含（按需）

      {
        /**
         * 函数级注释：域←→子域左侧留白统一保障
         * - 目标：保证每个域内部的子域容器左侧相对域内部左锚至少保留可见留白；同时保持子域内部 children 的左内边距不小于 subPadH；
         * - 行为：对每个域计算 requiredLeft = domain.x + padH + leftBlank；若某子域左缘 < requiredLeft - subPadH，则整体右移 dx，并同步 children 的 x。
         */
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of domainsList) {
          const dId = String((((dc as any).data?.domain || '')));
          const dxDom = numLocal(((dc as any)?.position?.x), 0);
          const wDom = numLocal((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const innerLeftDom = dxDom + padH;
          const innerRightDom = dxDom + Math.max(1, wDom) - padH;
          const leftBlank = Math.max(subPadH, Math.floor((nodeLayoutName === 'grid' ? hGapDet * 0.2 : hGapDet * 0.35)));
          const requiredLeft = innerLeftDom + leftBlank;
          const sgs = updatedNodes
            .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId)
            .slice().sort((a, b) => orderKeyOf(a) - orderKeyOf(b));
          for (const sg of sgs) {
            const sx0 = numLocal(((sg as any)?.position?.x), innerLeftDom - subPadH);
            const sgW = numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
            const minXAllowed = Math.max(innerLeftDom - subPadH, requiredLeft - subPadH);
            const maxXAllowed = Math.max(innerLeftDom - subPadH, innerRightDom - subPadH - sgW);
            const sx = Math.min(Math.max(sx0, minXAllowed), maxXAllowed);
            const dx = sx - sx0;
            if (dx !== 0) {
              (sg as any).position = { x: sx, y: numLocal(((sg as any)?.position?.y), 0) } as any;
              const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
              for (const cid of children) {
                const child = idMap.get(cid);
                if (!child) continue;
                const cx = numLocal(((child as any)?.position?.x), 0) + dx;
                const cy = numLocal(((child as any)?.position?.y), 0);
                (child as any).position = { x: cx, y: cy } as any;
              }
            }
          }
        }
        // 再钳制一次，吸收可能的边界误差（按需）

      }
      {
        const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of tgs) {
          const dId = String((((dc as any).data?.domain || '')));
          if (!dId) continue;
          const dy = num(((dc as any)?.position?.y), 0);
          const innerTop = dy + titleH + titleV + titleSafe;
          let maxBottom = innerTop;
          for (const n of updatedNodes) {
            const nd = String(((n.data as any)?.domain || ''));
            const tp = String(n.type || '');
            if (nd !== dId || tp === 'titleGroup') continue;
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            if (hidden) continue;
            const ny = num(((n as any)?.position?.y), innerTop);
            const nh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
            maxBottom = Math.max(maxBottom, ny + nh);
          }
          const contentH = Math.max(0, maxBottom - innerTop);
          const newH = titleH + titleV + titleSafe + contentH + bottomSafe;
          const wKeep = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          (dc as any).style = { ...((dc as any).style || {}), width: wKeep, height: newH } as any;
          (dc as any).measured = { width: wKeep, height: newH } as any;
          (dc as any).height = newH;
        }
      }
      // 域宽度最终按投影精确回收（保留左锚）
      // 警告：finalizeDomainWidthsByProjection 仅基于 maxRight - minLeft 计算，
      // 如果子域偏离了左边界，会导致域宽收缩而不包括左空白。
      // 因此此处禁用，改用前文的 maxRight - domX 投影。
      /*
      try {
        const { finalizeDomainWidthsByProjection } = await import('../utils/layoutUtils');
        updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
      } catch {
        // ignore
      }
      */
      // 最终统一域宽（函数级注释：按所有域的最大需求宽度统一，保留左锚）
      {
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const domains = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
        const maxW = domains.length ? Math.max(...domains.map(dc => numLocal((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0))) : 0;
        if (isFinite(maxW) && maxW > 0) {
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            if (String(n.type || '') !== 'titleGroup') continue;
            ((updatedNodes[i] as any).style || ((updatedNodes[i] as any).style = {})).width = maxW;
            const curH = numLocal((((updatedNodes[i] as any)?.measured?.height ?? (updatedNodes[i] as any)?.style?.height)), titleH + titleV + titleSafe + bottomSafe);
            (updatedNodes[i] as any).measured = { width: maxW, height: curH } as any;
            (updatedNodes[i] as any).width = maxW;
          }
          // 保持域内节点结构不变：仅统一域容器宽度，不平移或扩展子域/节点
        }
      }
      // 统一域宽后再次进行“域内容等比缩放”，确保铺满最终容器宽度
      // 函数级注释：在节点布局为 vertical 时禁用域内容水平缩放（不适配水平拉伸）
      if ((options as any)?.fitDomainContent !== false && nodeLayoutName !== 'vertical') {
        try {
          if (!constantGapMode) {
            const { scaleDomainContentToFitWidthAll } = await import('../utils/layoutUtils');
            updatedNodes = scaleDomainContentToFitWidthAll(updatedNodes) as any;
          }
        } catch {
          // ignore
        }
      }

      // 终态仅回收容器尺寸（不做钳制）：保持“自内而外”的布局收敛
      try {
        if (nodeLayoutName !== 'dagre') {
          const { recomputeSubGroupContainersBasic } = await import('../utils/layoutUtils');
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
        }
      } catch {
        // ignore
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
        {
          const { recomputeSubGroupContainersBasic, stackSubGroupsVertically } = await import('../utils/layoutUtils');
          // 1. 根据 sync 后的子节点位置，重新计算子域容器的最小包围盒（measured.width/height）
          updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
          // 2. Based on NEW horizontal layout, we MUST NOT stack vertically.
          // updatedNodes = stackSubGroupsVertically(updatedNodes) as any;
        }




        // 重新计算域容器尺寸（基于子域边界框）
        updatedNodes = enforceDomainContainerStrictContainment(updatedNodes)          // [FIX] Dagre 模式下必须手动触发域尺寸投影，否则后续的垂直堆叠无法感知正确高度
        updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
        updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;

        // [FIX] 最终域垂直堆叠修正 (Final Re-Stacking)
        // `finalizeDomainHeightsByProjection` 可能增大了域高度，导致后续域被遮挡。
        // 必须基于最终高度重新计算所有域的 Y 坐标，并同步移动域内所有内容。
        {
          const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
          tgs.sort((a, b) => String((a.data as any)?.domain || '').localeCompare(String((b.data as any)?.domain || '')));

          let cursorY = num((options as any)?.padding?.top, 80);
          const domainGap = 48;

          for (const tg of tgs) {
            const currentY = num((tg as any)?.position?.y, 0);
            const dy = cursorY - currentY;

            // 1. Move Domain
            (tg as any).position = { x: num((tg as any)?.position?.x, 0), y: Math.round(cursorY) };

            // 2. Move Content (SubGroups + Orphans)
            if (dy !== 0) {
              const dId = String((tg.data as any)?.domain || '');
              for (const n of updatedNodes) {
                if (n.id === tg.id) continue;
                const nDomain = String((n.data as any)?.domain || '');
                if (nDomain === dId) {
                  const ny = num((n as any)?.position?.y, 0);
                  (n as any).position = { ...n.position, y: Math.round(ny + dy) };
                }
              }
            }

            // 3. Advance Cursor based on FINAL height
            const h = num(((tg as any)?.measured?.height ?? (tg as any)?.style?.height), 100);
            cursorY += h + domainGap;
          }
        }
      }   // 垂直布局：强力统一域宽并对齐
      if (false && nodeLayoutName === 'vertical') {
        const domainContainers = updatedNodes.filter(n =>
          ['titleGroup', 'domain', 'group'].includes(String(n.type || '')) &&
          !(n.data as any)?.hidden
        );

        if (domainContainers.length > 0) {
          // 1. 重新计算每个域的最小所需宽度（基于子域内容）
          // 这一步确保 maxW 足够大，能容纳最宽的子域
          let maxContentW = 0;
          for (const dc of domainContainers) {
            const requiredW = num(((dc as any)?.measured?.width ?? (dc as any)?.style?.width), 0);
            maxContentW = Math.max(maxContentW, requiredW);
          }

          // 2. 统一使用最大宽度
          const unifyW = maxContentW;

          // 3. 计算统一的左对齐坐标 (minX)
          const minX = Math.min(...domainContainers.map(dc => num(((dc as any)?.position?.x), 0)));

          // 4. 应用变更

          for (const dc of domainContainers) {
            const oldX = num(((dc as any)?.position?.x), 0);
            const moveX = minX - oldX;

            // 设置位置和尺寸
            (dc as any).position = { x: minX, y: num(((dc as any)?.position?.y), 0) };

            // 强制更新所有宽度属性
            ((dc as any).style || ((dc as any).style = {})).width = unifyW;
            (dc as any).measured = {
              width: unifyW,
              height: num(((dc as any)?.measured?.height ?? (dc as any)?.style?.height), 0)
            };
            (dc as any).width = unifyW;

            // 移动子域以保持相对位置 (或者在此选择左对齐子域?)
            // 用户要求坐标对齐，且图示显示是整体移动。
            // 这里我们整域移动了，所以子域必须跟着移动。
            if (Math.abs(moveX) > 0.5) {
              const dId = String((((dc as any)?.data?.domain || '')));
              const subGroups = updatedNodes.filter(n =>
                String(n.type || '') === 'subGroup' &&
                String(((n.data as any)?.domain || '')) === dId
              );
              for (const sg of subGroups) {
                const sgX = num(((sg as any)?.position?.x), 0);
                (sg as any).position = { x: Math.round(sgX + moveX), y: num(((sg as any)?.position?.y), 0) };

                // [FIX] 对于 Vertical 布局，必须手动同步子节点位置
                // syncDagreChildPositions 依赖 __dagreRel，而 vertical 布局没有该数据。
                // 这里的位移是刚体平移，直接将 delta (moveX) 应用于 children。
                const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
                for (const cid of children) {
                  const child = updatedNodes.find(n => n.id === cid);
                  if (child) {
                    const cx = num(((child as any)?.position?.x), 0);
                    (child as any).position = { x: Math.round(cx + moveX), y: num(((child as any)?.position?.y), 0) };
                  }
                }
              }
            }

            // [FIX] 同时移动 Orphan Nodes (域内未归属子域的节点)
            const orphans = updatedNodes.filter(n => {
              const belongs = String((n.data as any)?.domain || '') === String((dc.data as any)?.domain || '');
              const type = String(n.type || '');
              return belongs && type !== 'titleGroup' && type !== 'subGroup' && type !== 'group';
            });
            for (const orphan of orphans) {
              // 检查是否已经在 subGroups 中被处理过 (防止重复移动)
              let isChild = false;
              for (const sg of updatedNodes) {
                if (String(sg.type) === 'subGroup' && (sg.data as any)?.children?.includes(orphan.id)) {
                  isChild = true;
                  break;
                }
              }
              if (!isChild) {
                const ox = num(((orphan as any)?.position?.x), 0);
                (orphan as any).position = { x: Math.round(ox + moveX), y: num(((orphan as any)?.position?.y), 0) };
              }
            }
          }

          // [FIX] Removed syncDagreChildPositions call as it is invalid for Vertical layout loop.
          // updatedNodes = syncDagreChildPositions(updatedNodes) as any;

          // dagre 模式跳过：reflowSubGroupChildrenDagre 已精确计算容器尺寸
          // updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;

          // 7. 重新计算域容器尺寸（基于子域包围盒）
          updatedNodes = enforceDomainContainerStrictContainment(updatedNodes) as any;

          // 8. 垂直方向重新堆叠：防止因高度变化导致的重叠
          // 这一步至关重要，因为 enforceDomainContainerStrictContainment 可能会增加域高度
          {
            // 仅针对顶层域容器进行重排
            const sortedDomains = domainContainers.slice().sort((a, b) => num((a as any).position?.y, 0) - num((b as any).position?.y, 0));
            let currentY = num((sortedDomains[0] as any)?.position?.y, 0);
            const gaps = (diagramConfigManager.getLayoutConfig() as any)?.DOMAIN_V_GAP || 80; // 读取配置或默认值

            for (let i = 0; i < sortedDomains.length; i++) {
              const dc = sortedDomains[i];
              const h = num(((dc as any).measured?.height ?? (dc as any).style?.height), 0);

              // 记录旧 Y（必须在修改前）
              const oldY = num((dc as any).position?.y, 0);
              const deltaY = currentY - oldY;

              // 设置域容器新 Y
              (dc as any).position = { x: num((dc as any).position?.x, 0), y: currentY };

              // **关键修复**：将 Y 偏移传递给该域内的所有子域和子节点
              // Dagre 模式跳过：垂直堆叠已经在 Deep Layout 中精确处理，不需要此处的额外偏移
              if (Math.abs(deltaY) > 0.5) {
                const dId = String((((dc as any)?.data?.domain || '')));
                const subGroups = updatedNodes.filter((n: any) =>
                  String(n.type || '') === 'subGroup' &&
                  String(((n.data as any)?.domain || '')) === dId
                );

                for (const sg of subGroups) {
                  // 移动子域
                  const sgOldY = num(((sg as any)?.position?.y), 0);
                  (sg as any).position = { x: num(((sg as any)?.position?.x), 0), y: Math.round(sgOldY + deltaY) };

                  // 移动子域内的所有子节点
                  const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
                  for (const cid of children) {
                    const child = updatedNodes.find((n: any) => n.id === cid);
                    if (child) {
                      const childOldY = num(((child as any)?.position?.y), 0);
                      (child as any).position = { x: num(((child as any)?.position?.x), 0), y: Math.round(childOldY + deltaY) };
                    }
                  }
                }
              }

              currentY += h + gaps;
            }

            // 9. 再次同步子节点，确保它们跟随容器的新 Y 坐标
            updatedNodes = syncDagreChildPositions(updatedNodes) as any;

            // dagre 模式跳过：reflowSubGroupChildrenDagre 已精确计算容器尺寸
            // updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;
          }
        }
      }
    }

    // [CHECKPOINT 3] 布局策略最终返回前 - 检查最终位置
    const sgsCheck3 = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
    for (const sg of sgsCheck3) {
      const sgDesc = String((sg.data as any)?.description || sg.id);
      const sgX = (sg.position as any)?.x || 0;
      const sgY = (sg.position as any)?.y || 0;
      const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
      children.slice(0, 5).forEach(cid => {
        const child = updatedNodes.find(n => n.id === cid);
        if (child) {
          const cx = (child.position as any)?.x || 0;
          const cy = (child.position as any)?.y || 0;
          const relX = cx - sgX;
          const relY = cy - sgY;
          const dagreRel = (child.data as any)?.__dagreRel;
        }
      });
    }

    // ===== 边路由管线（已提取至 shared/edgeRoutingPipeline.ts）=====
    const finalRoutedEdges = await runEdgeRoutingPipeline(updatedNodes, edges, { layoutDirection: 'TB' });

    // ===== 最终几何包含保障（已提取至 shared/geometryGuard.ts）=====
    ensureDomainContainment(updatedNodes, 30);


    return { nodes: updatedNodes, edges: finalRoutedEdges } as any;
  }
}


export default DomainVerticalLayoutStrategy;

