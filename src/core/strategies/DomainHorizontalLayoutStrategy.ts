// @ts-nocheck
import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../models/DiagramModels';
import type { LayoutOptions } from '../types/layout';
import { LayoutType } from '../types/layout';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import { LayeredConfigManager } from '../config/LayeredConfigManager';
import { ILayoutStrategy } from './LayoutStrategyManager';
import { decideEdgeRouting, separateParallelEdges, globalOptimizeEdgeRouting, distributePortConnections, bundleEdges, layerBasedEdgeRouting, optimizeEdgeLabelPositions, beautifyOrthogonalEdges, optimizeTreeBusRouting } from '../utils/HandlePicker';
import {
  applyDomainGrouping,
  applySubGrouping,
  assignChildrenToSubGroupsBySemantic,
  normalizeSubGroupDomainByChildren,
  purgeSubGroupChildrenBySemantic,
  auditAndFixSubGroupChildrenBindings,
  recomputeSubGroupContainersBasic,
  enforceSubGroupChildrenLayoutStrict,
  reflowSubGroupChildrenVertical,
  centerSubGroupChildrenHorizontally,
  packSubGroupChildrenRigid,
  stackSubGroupsVertically,
  enforceSubGroupTitleClearance,
  resolveSubGroupChildrenOverlapsStrict,
  resolveFreeNodeOverlapsInDomain,
  enforceSubGroupStrictContainmentByChildren,
  resolveSubGroupOverlaps,
  unifySubGroupLeftAnchors,
  unifySubGroupLeftAnchorsStrict,
  finalizeSubGroupHeightsByProjectionPreserveAnchor,
  unifySubGroupWidthsByDomain,
  normalizeMissingNodeSubDomainByDomain,
  finalizeDomainWidthsByProjection,
  finalizeDomainHeightsByProjection,
  clampDomainHeightsToSubGroups,
  resolveDomainContainerOverlaps,
  clampNodesToContainers,
  pushFreeNodesBelowSubGroupRow,
  compactDomainBlocks,
  fitSubGroupsToDomainSymmetric,
  equalizeSubGroupMarginsByProjection,

  finalizeSubGroupWidthsByProjectionPreserveAnchor,
  ensureMeasuredForNodes,
  reflowSubGroupChildrenDagre
} from '../utils/layoutUtils';

/**
 * 域水平布局策略
 * 函数级注释：
 * - 阶段一：语义绑定审计与修复 → 子域内按选定节点布局 → 子域投影回收 → 在子域尺寸统一后记录相对偏移快照
 * - 阶段二：子域纵向堆叠 → 刚体整体移动（一次性）→ 垂直专用重排/行打包（累进行高）→ 一次性避让 → 自由节点下推 → 域宽/高投影 → 域间距统一 → 顶边对齐
 */
export class DomainHorizontalLayoutStrategy implements ILayoutStrategy {
  /** 函数级注释：策略名称 */
  getName(): string { return 'DomainHorizontalLayout'; }
  /** 函数级注释：策略分类 */
  getCategory(): 'hierarchy' | 'node' { return 'hierarchy'; }
  /** 函数级注释：策略描述 */
  getDescription(): string { return '域横向并排；两阶段子域堆叠与刚体重排'; }
  /** 函数级注释：适用性判断 */
  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean { return Array.isArray(nodes) && nodes.length > 0; }

  /**
   * 计算布局
   * 函数级注释：
   * - 两阶段流水线，移除循环钳制与复杂排序，保证稳定输出
   */
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
    const cfg = diagramConfigManager.getConfig() as any;
    const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
    const layeredCfg = LayeredConfigManager.getInstance();
    const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
    const padH = num(cfg?.domain?.padding?.horizontal, 24);
    const titleH = num(cfg?.domain?.title?.height, 40);
    const titleV = num(cfg?.domain?.title?.padding?.vertical, 12);
    const titleSafe = num(cfg?.domain?.title?.safeGap, 16);
    // const bottomSafe = num((cfg?.domain?.bottomSafeGap ?? cfg?.domain?.padding?.bottom), padH);
    const domainGap = num(cfg?.domain?.gap, 40);
    const hScale = num(((cfg?.layout?.autoGapScale?.h) as any), 1);
    const domainGapEffH = Math.max(12, Math.round(domainGap * hScale));
    const sideSafe = Math.max(0, num((cfg?.domain?.sideSafeGap), 8));
    const subPadH = num((cfg?.subDomain?.padding?.horizontal ?? (cfg as any)?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), Math.max(16, Math.floor(padH * 0.8)));
    const subTitleH = num((cfg?.subDomain?.title?.height ?? (cfg as any)?.subGroup?.title?.height), 28);
    const subTitleV = num((cfg?.subDomain?.title?.padding?.vertical ?? (cfg as any)?.subGroup?.title?.padding?.vertical), 8);
    const subPadTop = num((cfg?.subDomain?.padding?.top ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? (cfg as any)?.subGroup?.padding?.top ?? (cfg as any)?.subGroup?.padding?.vertical), Math.max(12, Math.floor(padH * 0.8)));
    const subBottomSafe = num((cfg?.subDomain?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM_SAFE ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM ?? (cfg as any)?.subGroup?.padding?.bottom ?? (cfg as any)?.subGroup?.padding?.vertical), Math.max(12, Math.floor(padH * 0.8)));
    const nodeV = num((diagramConfigManager.getLayoutConfig() as any)?.NODE_V_GAP, 80);
    /** 函数级注释：横向节点间距细化值
     * - 来源：布局配置中的 `NODE_H_GAP` 以及自动缩放 `layout.autoGapScale.h`
     * - 用途：用于子域容器之间的横向避让与重叠消解
     */
    const baseHGapCfg = num((layoutCfg?.NODE_H_GAP), 120);
    const scaleHCfg = num(((cfg?.layout?.autoGapScale?.h) as any), 1);
    const hGapDet = Math.max(12, Math.floor(baseHGapCfg * Math.min(1.0, scaleHCfg)));
    const anchorTopGlobal = Math.round(num((options as any)?.padding?.top, Math.max(40, num((cfg?.diagram?.padding?.top), 40))));
    const anchorLeftGlobal = Math.round(num((options as any)?.padding?.left, Math.max(40, num((cfg?.diagram?.padding?.left), 40))));

    const domainWhitelist = (options as any)?.domainWhitelist as string[] | undefined;
    const subWhitelist = (options as any)?.subDomainWhitelist as string[] | undefined;
    const showDomain = ((options as any)?.generateDomainGroups !== undefined) ? !!(options as any)?.generateDomainGroups : true;
    const showSub = ((options as any)?.generateSubDomainGroups !== undefined) ? !!((options as any)?.generateSubDomainGroups) : true;

    let updatedNodes: ReactFlowNode[] = nodes as ReactFlowNode[];
    updatedNodes = applyDomainGrouping(updatedNodes as any, domainWhitelist) as any;
    updatedNodes = normalizeMissingNodeSubDomainByDomain(updatedNodes) as any;
    updatedNodes = applySubGrouping(updatedNodes as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist) as any;
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes as any) as ReactFlowNode[];
    updatedNodes = ensureMeasuredForNodes(updatedNodes);
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);
    updatedNodes = updatedNodes.map(n => {
      const clone: any = { ...n, data: { ...(n as any).data } };
      if (String(n.type || '') === 'subGroup') {
        const key = String((clone.data?.subDomain || '')).trim();
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
      const idMapLocal = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const hiddenSubGroups = updatedNodes.filter(n =>
        String(n.type || '') === 'subGroup' && !!((n as any)?.data?.hidden)
      );
      for (const sg of hiddenSubGroups) {
        const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        for (const cid of children) {
          const child = idMapLocal.get(cid);
          if (child) {
            (child as any).data = { ...((child as any).data || {}), hidden: true };
          }
        }
      }
    }

    const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
    /** 函数级注释：诊断输出（可选） */
    const runDiagnostics = (list: ReactFlowNode[]) => {
      try {
        const enable = Boolean(layeredCfg.get<boolean>('diagram.layout.diagnostics', true));
        if (!enable) return;
        const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
        const domains = Array.from(new Set(list.map(n => String((((n as any)?.data || {}) as any)?.domain || '').trim()).filter(Boolean)));
        const summary: any[] = [];
        for (const d of domains) {
          const sgList = list.filter(n => String(n.type || '') === 'subGroup' && String((((n as any)?.data || {}) as any)?.domain || '').trim() === d);
          const sgChildren = new Set<string>();
          sgList.forEach(sg => {
            const ch = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
            ch.forEach(id => sgChildren.add(id));
          });
          const biz = list.filter(n => !isGroupType(n.type) && String((((n as any)?.data || {}) as any)?.domain || '').trim() === d && !(((n as any)?.data) || {})?.hidden);
          const orphan = biz.filter(n => !sgChildren.has(n.id)).map(n => n.id);
          summary.push({ domain: d, subGroups: sgList.length, biz: biz.length, orphanCount: orphan.length });
        }
        console.warn('[LayoutDiagnostics] Summary', summary);
      } catch {
        // ignore
      }
    };

    // 语义补建与绑定收敛
    /**
     * 函数级注释：语义键缺失子域注入（按 domain+subDomain 建立容器）
     * - 目标：当某域存在业务节点的 subDomain 键，但没有对应子域容器时，自动创建该子域容器，随后由分配/回收流程完善 children 与尺寸。
     */
    const injectSemanticSubGroupsForMissingKeys = (list: ReactFlowNode[]): ReactFlowNode[] => {
      const out = list.map(n => ({ ...n, data: { ...(n.data as any) } }));
      const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
      const norm = (s: string) => String(s || '').toLowerCase().replace(/\u3000|\u00A0/g, '').replace(/\s+/g, '').replace(/[+_-]/g, '');
      const byDomainKeys = new Map<string, Set<string>>();
      const existingKeys = new Map<string, Set<string>>();
      for (const n of out) {
        const dt: any = (n as any).data || {};
        const d = String((dt?.domain || '')).trim();
        if (!d) continue;
        if (!byDomainKeys.has(d)) byDomainKeys.set(d, new Set<string>());
        if (String(n.type || '') === 'subGroup') {
          const sRaw = String((dt?.subDomain || '')).trim();
          const set = existingKeys.get(d) || new Set<string>();
          set.add(norm(sRaw)); existingKeys.set(d, set);
        } else if (!isGroupType(n.type)) {
          const k = norm(String(((dt?.subDomain ?? dt?.subdomain) ?? dt?.metadata?.subDomain) || '').trim());
          if (k) (byDomainKeys.get(d) as Set<string>).add(k);
        }
      }
      for (const [d, keys] of Array.from(byDomainKeys.entries())) {
        const exists = existingKeys.get(d) || new Set<string>();
        for (const k of Array.from(keys.values())) {
          if (exists.has(k)) continue;
          const sgId = `subGroup__${norm(d)}__${k}`;
          const sgNode: any = {
            id: sgId,
            type: 'subGroup',
            position: { x: 0, y: 0 },
            data: { domain: d, subDomain: k, description: k, children: [] },
            style: { width: 0, height: 0 },
            measured: { width: 0, height: 0 },
            draggable: false, // 锁定自动生成的子域
          };
          out.push(sgNode as ReactFlowNode);
        }
      }
      return out as ReactFlowNode[];
    };

    updatedNodes = purgeSubGroupChildrenBySemantic(updatedNodes) as any;
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes) as any;
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes) as any;
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes) as any;
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes) as any;
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes) as any;
    runDiagnostics(updatedNodes);

    // 域顺序
    const originalIndex = new Map<string, number>(nodes.map((n, i) => [String(n.id), i] as const));

    /**
     * 函数级注释：域内对象排序键（支持显式子域顺序）
     * - 优先级：显式 subDomainOrder > children 最小原始索引 > 节点原始索引
     */
    const subOrderOptRaw: any = (options as any)?.subDomainOrder;
    const getExplicitSubIndex = (domainKey: string, subKey: string): number => {
      try {
        const dTrim = String(domainKey || '').trim();
        const sTrim = String(subKey || '').trim();
        if (Array.isArray(subOrderOptRaw)) {
          const idx = subOrderOptRaw.indexOf(sTrim);
          return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
        }
        if (subOrderOptRaw && typeof subOrderOptRaw === 'object') {
          const arr = subOrderOptRaw[dTrim] || subOrderOptRaw[String(dTrim)] || [];
          if (Array.isArray(arr)) {
            const idx = arr.indexOf(sTrim);
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
      if (tp === 'subGroup') {
        const data: any = (n as any)?.data || {};
        const children = Array.isArray(data?.children) ? (data.children as string[]) : [];

        // 1. 显式顺序
        const dKey = String((data?.domain || '')).trim();
        const sKeyRaw = String(((data?.description || data?.subDomain || String((n as any)?.id || '')) || '')).trim();
        const expIdx = getExplicitSubIndex(dKey, sKeyRaw);
        if (isFinite(expIdx)) return expIdx - 200000;

        // 1.1 语义顺序 (Semantic Sequence)
        const seqRaw = data?.sequence ?? data?.order;
        const seq = typeof seqRaw === 'number' ? seqRaw : parseFloat(seqRaw);
        if (isFinite(seq)) return seq - 100000;

        // 2. 默认顺序（按子节点出现）
        let idx = Number.POSITIVE_INFINITY;
        for (const cid of children) {
          const v = originalIndex.get(String(cid));
          if (typeof v === 'number') idx = Math.min(idx, v);
        }
        return isFinite(idx) ? idx : Number.POSITIVE_INFINITY;
      }
      const v = originalIndex.get(String((n as any)?.id || ''));
      return (typeof v === 'number') ? v : Number.POSITIVE_INFINITY;
    };
    const orderOpt: string[] | undefined = (options as any)?.domainOrder as any;
    const domainsInData: string[] = [];
    const seenDomains = new Set<string>();
    for (const n of nodes) {
      const d = String((((n as any)?.data || {}) as any)?.domain || '').trim();
      if (d && !seenDomains.has(d)) { seenDomains.add(d); domainsInData.push(d); }
    }
    let domains: string[] = Array.isArray(orderOpt) && orderOpt.length ? orderOpt.map(d => String(d)) : domainsInData;
    if (Array.isArray(domainWhitelist) && domainWhitelist.length) {
      const white = new Set(domainWhitelist.map(k => String(k).trim()));
      domains = domains.filter(d => white.has(String(d).trim()));
    }
    const domainOrderIndex = new Map<string, number>(domains.map((d, i) => [String(d).trim(), i] as const));



    /**
     * 函数级注释：按规范化语义键重建 children（通用归一化）
     * - 目标：解决中文/英文括号、标点、空白等差异导致的子域归属遗漏；对 sg.description 与 node.subDomain 做统一规范化后重建 children。
     * - 规则：仅匹配同域；规范化移除空白、加减下划线、全/半角括号与常见中文标点。
     */
    const rebindChildrenNormalized = (list: ReactFlowNode[]): ReactFlowNode[] => {
      const out = list.map(n => ({ ...n, data: { ...(n.data as any) } }));
      const norm = (s: string) => String(s || '')
        .toLowerCase()
        .replace(/[\u3000\u00A0\s]+/g, '')
        .replace(/[+_-]/g, '')
        .replace(/[()（）【】[\]{}〈〉<>，、。：:；;．。！!？?]/g, '');
      const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
      const domainsArr = out
        .map(n => String(((n as any)?.data?.domain ?? '')).trim())
        .filter(Boolean);
      const domainKeys = Array.from(new Set(domainsArr));
      const idMapLocal = new Map<string, ReactFlowNode>(out.map(n => [n.id, n] as const));
      for (const d of domainKeys) {
        const sgList = out.filter(n => String(n.type || '') === 'subGroup' && (String(((n as any)?.data?.domain || ''))).trim() === d);
        const biz = out.filter(n => !isGroupType(n.type) && (String(((n as any)?.data?.domain || ''))).trim() === d);
        const bucket: Record<string, string[]> = {};
        for (const n of biz) {
          const nd: any = (n as any).data || {};
          const subRaw = String(((nd?.subDomain ?? nd?.subdomain) ?? nd?.metadata?.subDomain) || '').trim();
          const key = norm(subRaw);
          const k = key || norm(d);
          (bucket[k] || (bucket[k] = [])).push(n.id);
        }
        for (const sg of sgList) {
          const dt: any = (sg as any).data || {};
          const sKeyRaw = String((dt?.subDomain || '')).trim();
          const k = norm(sKeyRaw || d);
          const nextChildren = Array.from(new Set((bucket[k] || []).filter(id => !!idMapLocal.get(id)))) as string[];
          ((sg as any).data || ((sg as any).data = {})).children = nextChildren;
          // 统一写回 sg.data.domain
          const d1 = String(((dt?.domain || '') || '')).trim(); if (d1 !== d) ((sg as any).data).domain = d;
        }
      }
      return out as ReactFlowNode[];
    };

    // 初始域横排（顶边对齐）
    let cursorX = anchorLeftGlobal;
    const domainsPlaced: ReactFlowNode[] = [];
    for (const d of domains) {
      const tg = updatedNodes.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === d);
      if (!tg) continue;
      (tg as any).position = { x: cursorX, y: anchorTopGlobal } as any;
      domainsPlaced.push(tg);
      cursorX += num(((tg as any)?.measured?.width ?? (tg as any)?.style?.width), 360) + domainGapEffH;
    }

    const nodeLayoutRaw: any = (options as any)?.nodeLayout;
    const nodeLayoutName: 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre' = (() => {
      const byEnum: Record<string, 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre'> = {
        [String(LayoutType.GRID)]: 'grid',
        [String(LayoutType.HORIZONTAL)]: 'horizontal',
        [String(LayoutType.VERTICAL)]: 'vertical',
        [String(LayoutType.CENTERED)]: 'centered',
        [String(LayoutType.DAGRE)]: 'dagre',
      };
      if (typeof nodeLayoutRaw === 'number' && isFinite(nodeLayoutRaw)) return byEnum[String(nodeLayoutRaw)] || 'vertical';
      const s = String(nodeLayoutRaw || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
      const byString: Record<string, 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre'> = {
        'gridlayout': 'grid', 'grid': 'grid',
        'horizontallayout': 'horizontal', 'horizontal': 'horizontal',
        'verticallayout': 'vertical', 'vertical': 'vertical',
        'centeredlayout': 'centered', 'centered': 'centered',
        'dagrelayout': 'dagre', 'dagre': 'dagre',
      };
      if (byString[s]) return byString[s];
      try {
        const cfgNode = String((diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
        return byString[cfgNode] || 'vertical';
      } catch {
        // ignore
        return 'vertical';
      }
    })();
    const nodeLayoutEffective: 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre' = nodeLayoutName;
    /**
     * 函数级注释：子域纵向堆叠间距（按节点布局细化）
     * - 场景：在域水平布局中，同域子域按垂直方向堆叠；默认使用 `NODE_V_GAP`
     * - Grid 模式：为了避免子域之间间隔过大，将纵向间距压缩为 `NODE_V_GAP * 0.4`（下限 8）
     */
    const nodeVGapForDomainStack = ((): number => {
      const base = nodeV;
      if (nodeLayoutEffective === 'grid') return Math.max(8, Math.floor(base * 0.4));
      return base;
    })();

    // 阶段一：注入缺失子域 → 统一 children 布局 → 尺寸回收 → 子域尺寸统一 → 严格包含 → 子域高度投影 → 记录相对偏移
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes) as any;
    updatedNodes = rebindChildrenNormalized(updatedNodes) as any;
    // 对于 dagre 布局，使用 reflowSubGroupChildrenDagre；其他布局使用 enforceSubGroupChildrenLayoutStrict
    if (nodeLayoutEffective === 'dagre') {
      const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        const childNodes = ch.map(id => idm.get(id)).filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
        if (childNodes.length === 0) continue;
        if (childNodes.length === 0) continue;
        // Determine layout direction: horizontal for "预约管理" subdomain, otherwise vertical
        const subDomainName = String((sg as any)?.data?.subDomain || '');
        const direction: 'TB' | 'LR' = subDomainName.includes('预约管理') ? 'LR' : 'TB';
        const result = reflowSubGroupChildrenDagre(sg, childNodes, baseHGapCfg, nodeV, edges, direction);
        const resultMap = new Map(result.map(n => [n.id, n]));
        for (let i = 0; i < updatedNodes.length; i++) {
          const updated = resultMap.get(updatedNodes[i].id);
          if (updated) updatedNodes[i] = updated;
        }
      }
    } else {
      updatedNodes = enforceSubGroupChildrenLayoutStrict(updatedNodes, nodeLayoutEffective as any) as any;
    }
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes) as any;
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes) as any;
    updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
    {
      const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
      for (const dc of tgs) {
        const dId = String((((dc as any).data?.domain || '')));
        const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
        if (!sgs.length) continue;
        const maxW = sgs.reduce((m, sg) => Math.max(m, num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0)), 0);
        for (const sg of sgs) {
          const ch = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
          ((sg as any).style || ((sg as any).style = {})).width = Math.max(0, maxW);
          ((sg as any).style || ((sg as any).style = {})).height = ch;
          (sg as any).measured = { width: Math.max(0, maxW), height: ch } as any;
          (sg as any).width = Math.max(0, maxW);
          (sg as any).height = ch;
        }
      }
    }
    // 使用内部快照机制记录刚体相对偏移

    const stopAfterPhaseRaw = String(((options as any)?.stopAfterPhase ?? layeredCfg.get<string>('diagram.layout.stopAfterPhase', 'none')) || 'none').toLowerCase().replace(/\s+/g, '');
    const stopAfterPhase: 'none' | 'phase1' | 'phase2' = (stopAfterPhaseRaw === 'phase1' || stopAfterPhaseRaw === 'phase2') ? (stopAfterPhaseRaw as any) : 'none';
    if (stopAfterPhase === 'phase1') return { nodes: updatedNodes, edges } as any;

    // 阶段二：严格流水线（先刚体再重排）
    const strictPipeline = Boolean(layeredCfg.get<boolean>('diagram.layout.strictPipeline', true));
    if (!strictPipeline) {
      updatedNodes = stackSubGroupsVertically(updatedNodes) as any;
    }
    // 阶段二：先纵堆与刚体整体位移，重排与行打包延后至刚体应用之后
    updatedNodes = enforceSubGroupTitleClearance(updatedNodes) as any;
    if (!strictPipeline && nodeLayoutEffective !== 'dagre') {
      updatedNodes = resolveSubGroupChildrenOverlapsStrict(updatedNodes as any, Math.max(12, subPadH), Math.max(8, nodeV)) as any;
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    } else if (!strictPipeline && nodeLayoutEffective === 'dagre') {
      // dagre 布局已计算层次位置，仅回收容器尺寸
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    }
    updatedNodes = resolveFreeNodeOverlapsInDomain(updatedNodes, Math.max(12, subPadH), Math.max(8, nodeV)) as any;
    updatedNodes = pushFreeNodesBelowSubGroupRow(updatedNodes) as any;
    /**
     * 函数级注释：阶段二之后重建子域 children 映射
     * - 目标：在垂直重排/行打包/刚体移动后，确保每个子域的 children 集合与语义归属一致，以便投影计算包含全部成员。
     */
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes) as any;
    updatedNodes = rebindChildrenNormalized(updatedNodes) as any;
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes) as any;
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes) as any;

    /**
     * 函数级注释：由内而外的尺寸与排布时序（不收缩）
     * - 子域：严格包含 → 尺寸回收 → 重叠消解 → 再次回收 → 高度按投影（保留锚点）
     * - 域：按成员投影回收宽/高 → 钳制 → 域容器重叠消解 → 统一间距与顶边对齐
     */
    if (!strictPipeline) {
      updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
      updatedNodes = resolveSubGroupOverlaps(updatedNodes, Math.max(12, hGapDet), Math.max(8, nodeV)) as any;
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
      updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
    }

    // 记录子域 children 相对偏移（刚体快照）
    const snapshotChildrenRel = (list: ReactFlowNode[]) => {
      const idm = new Map<string, ReactFlowNode>(list.map(n => [n.id, n] as const));
      const sgs = list.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        // dagre 子域跳过 __rel 快照，保留已有的 __dagreRel 相对位置
        const dagreSized = (sg.data as any)?.__dagreSized;
        if (dagreSized && typeof dagreSized.h === 'number' && dagreSized.h > 0) {
          continue; // 保留 dagre 计算的精确相对位置
        }
        const sx = num(((sg as any)?.position?.x), 0);
        const sy = num(((sg as any)?.position?.y), 0);
        const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        for (const cid of ch) {
          const c = idm.get(cid);
          if (!c) continue;
          const cx = num(((c as any)?.position?.x), 0);
          const cy = num(((c as any)?.position?.y), 0);
          (((c as any).data || ((c as any).data = {})).__rel = { x: Math.round(cx - sx), y: Math.round(cy - sy) });
        }
      }
      return list;
    };
    updatedNodes = snapshotChildrenRel(updatedNodes);

    /**
     * 函数级注释：子域左锚与纵堆对齐（按域内边距）
     * - 目标：在子域尺寸稳定后，将所有可见子域的左侧对齐到域的 `innerLeft`，并按顺序自顶向下堆叠；同时把 children 随 dx/dy 进行刚体移动。
     * - 规则：innerLeft = titleGroup.position.x + domain.padding.horizontal；子域左锚 = innerLeft - subPadH；
     */
    {
      const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
      for (const tg of tgs) {
        const dKey = String(((tg as any)?.data?.domain || ''));
        const innerLeft = num(((tg as any)?.position?.x), anchorLeftGlobal) + padH + sideSafe;
        const innerTop = num(((tg as any)?.position?.y), anchorTopGlobal) + titleH + titleV + titleSafe;
        const sgs = updatedNodes
          .filter(n => String(n.type || '') === 'subGroup')
          .filter(n => String(((n as any)?.data?.domain || '')) === dKey)
          .slice()
          .sort((a, b) => orderKeyOf(a) - orderKeyOf(b));
        let cy = innerTop;
        for (const sg of sgs) {
          const oldX = num(((sg as any)?.position?.x), innerLeft - subPadH);
          const oldY = num(((sg as any)?.position?.y), cy);
          const newX = innerLeft - subPadH;
          const newY = cy;
          (sg as any).position = { x: newX, y: newY } as any;
          const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
          // 刚体应用：依据快照重置 children 位置 = 子域新位置 + 相对偏移
          // dagre 布局优先使用 __dagreRel，非 dagre 使用 __rel
          for (const cid of ch) {
            const c = idMap.get(cid);
            if (!c) continue;
            const dagreRel = (((c as any)?.data || {}) as any).__dagreRel;
            const rel = (((c as any)?.data || {}) as any).__rel;
            const useRel = dagreRel ?? rel; // dagre 相对位置优先
            const rx = num(useRel?.x, num(((c as any)?.position?.x), 0) - newX);
            const ry = num(useRel?.y, num(((c as any)?.position?.y), 0) - newY);
            (c as any).position = { x: Math.round(newX + rx), y: Math.round(newY + ry) } as any;
          }
          const keepH = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
          cy += Math.round(keepH + nodeVGapForDomainStack);

          // 刚体之后一次性垂直重排/行打包（仅在检测到重叠或行间距不足时执行）
          try {
            const childrenNodes = ch.map(id => idMap.get(id)).filter((nn): nn is ReactFlowNode => !!nn);
            const SAFE_W = num((diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH, 120);
            const SAFE_H = Math.max(24, num((diagramConfigManager.getConfig() as any)?.node?.height, 80));
            const getW = (n: ReactFlowNode) => Math.max(SAFE_W, num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), SAFE_W));
            const getH = (n: ReactFlowNode) => Math.max(24, num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), SAFE_H));
            const overlaps = (() => {
              for (let i = 0; i < childrenNodes.length; i++) {
                const a = childrenNodes[i] as any; const ax = num(a?.position?.x, 0); const ay = num(a?.position?.y, 0);
                const aw = getW(childrenNodes[i]); const ah = getH(childrenNodes[i]);
                for (let j = i + 1; j < childrenNodes.length; j++) {
                  const b = childrenNodes[j] as any; const bx = num(b?.position?.x, 0); const by = num(b?.position?.y, 0);
                  const bw = getW(childrenNodes[j]); const bh = getH(childrenNodes[j]);
                  const disjoint = ax >= bx + bw || ax + aw <= bx || ay >= by + bh || ay + ah <= by;
                  if (!disjoint) return true;
                }
              }
              return false;
            })();
            // dagre 布局子域跳过重叠重排 - 内部结构已由 dagre 精确计算
            const sgDagreSized = (sg.data as any)?.__dagreSized;
            if (overlaps && strictPipeline && !sgDagreSized) {
              const strict = reflowSubGroupChildrenVertical(sg as any, childrenNodes as any, Math.max(12, subPadH), Math.max(8, nodeV)) as any;
              const mapStrict = new Map<string, ReactFlowNode>((strict as ReactFlowNode[]).map(n => [n.id, n] as const));
              for (const id of ch) { const p = mapStrict.get(id) as any; const j = updatedNodes.findIndex(u => u.id === id); if (p && j >= 0) (updatedNodes[j] as any).position = { x: Math.round(num(p?.position?.x, 0)), y: Math.round(num(p?.position?.y, 0)) } as any; }
              const packed = packSubGroupChildrenRigid(sg as any, childrenNodes as any, Math.max(12, subPadH), Math.max(8, nodeV)) as any;
              const mapPacked = new Map<string, ReactFlowNode>((packed as ReactFlowNode[]).map(n => [n.id, n] as const));
              for (const id of ch) { const p = mapPacked.get(id) as any; const j = updatedNodes.findIndex(u => u.id === id); if (p && j >= 0) (updatedNodes[j] as any).position = { x: Math.round(num(p?.position?.x, 0)), y: Math.round(num(p?.position?.y, 0)) } as any; }
            }
          } catch {
            // ignore
          }
        }
      }
    }
    // 严格按 children 实际包围盒再回收一次子域尺寸，避免纵堆后出现尺寸偏差
    {
      const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgsVisible = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgsVisible) {
        // dagre 模式跳过：保留 dagre 计算的精确尺寸
        const dagreSized = (sg.data as any)?.__dagreSized;
        if (dagreSized && typeof dagreSized.h === 'number' && dagreSized.h > 0) {
          continue;
        }
        const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        const childNodes = ch.map(id => idm.get(id)).filter((cn): cn is ReactFlowNode => !!cn);
        if (!childNodes.length) continue;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 120);
        const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 80);
        for (const c of childNodes) {
          const x = num(((c as any)?.position?.x), 0);
          const y = num(((c as any)?.position?.y), 0);
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + getW(c)); maxY = Math.max(maxY, y + getH(c));
        }
        if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
          const curX = num(((sg as any)?.position?.x), 0);
          const curY = num(((sg as any)?.position?.y), 0);
          const contentLeft = curX + subPadH;
          const contentTop = curY + subTitleH + subTitleV + subPadTop;
          const contentW = Math.max(0, maxX - contentLeft);
          const contentH = Math.max(0, maxY - contentTop);
          const newW = Math.max(0, contentW + subPadH * 2);
          const newH = Math.max(0, contentH + subTitleH + subTitleV + subPadTop + subBottomSafe);
          ((sg as any).style || ((sg as any).style = {})).width = Math.round(newW);
          ((sg as any).style || ((sg as any).style = {})).height = Math.round(newH);
          (sg as any).measured = { width: Math.round(newW), height: Math.round(newH) } as any;
          (sg as any).width = Math.round(newW);
          (sg as any).height = Math.round(newH);

          /**
           * 子域孩子钳制到容器内容区（函数级注释）
           * - 目标：确保所有孩子坐标都在当前子域内容矩形内，避免视觉漂移。
           */
          const innerRight = Math.round(curX + Math.max(newW, (sg as any).width) - subPadH);
          const innerBottom = Math.round(curY + Math.max(newH, (sg as any).height) - subBottomSafe);
          for (const c of childNodes) {
            const px = num(((c as any)?.position?.x), contentLeft);
            const py = num(((c as any)?.position?.y), contentTop);
            const cw = getW(c); const ch = getH(c);
            const nx = Math.max(contentLeft, Math.min(px, innerRight - cw));
            const ny = Math.max(contentTop, Math.min(py, innerBottom - ch));
            (c as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
          }
          // 钳制后再次按真实包围盒微调容器尺寸
          let minX2 = Infinity, minY2 = Infinity, maxX2 = -Infinity, maxY2 = -Infinity;
          for (const c of childNodes) {
            const x2 = num(((c as any)?.position?.x), 0);
            const y2 = num(((c as any)?.position?.y), 0);
            minX2 = Math.min(minX2, x2); minY2 = Math.min(minY2, y2);
            maxX2 = Math.max(maxX2, x2 + getW(c)); maxY2 = Math.max(maxY2, y2 + getH(c));
          }
          if (isFinite(minX2) && isFinite(minY2) && isFinite(maxX2) && isFinite(maxY2)) {
            const contentW2 = Math.max(0, maxX2 - contentLeft);
            const contentH2 = Math.max(0, maxY2 - contentTop);
            const newW2 = Math.max(0, contentW2 + subPadH * 2);
            const newH2 = Math.max(0, contentH2 + subTitleH + subTitleV + subPadTop + subBottomSafe);
            ((sg as any).style || ((sg as any).style = {})).width = Math.round(newW2);
            ((sg as any).style || ((sg as any).style = {})).height = Math.round(newH2);
            (sg as any).measured = { width: Math.round(newW2), height: Math.round(newH2) } as any;
            (sg as any).width = Math.round(newW2);
            (sg as any).height = Math.round(newH2);
          }
        }
      }
    }
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as any;
    updatedNodes = unifySubGroupWidthsByDomain(updatedNodes) as any;
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes) as any;
    {
      const enableDebug = Boolean(LayeredConfigManager.getInstance().get<boolean>('diagram.layout.debug', false));
      if (enableDebug) {
        const logItems = updatedNodes.filter(n => String(n.type || '') === 'subGroup').slice(0, 8);
        const out = logItems.map(sg => ({
          id: (sg as any).id,
          domain: ((sg as any).data || {}).domain,
          subDomain: ((sg as any).data || {}).subDomain,
          pos: (sg as any).position,
          size: { w: num((((sg as any)?.style?.width ?? (sg as any)?.measured?.width)), 0), h: num((((sg as any)?.style?.height ?? (sg as any)?.measured?.height)), 0) },
          childrenCount: Array.isArray(((sg as any).data || {}).children) ? (((sg as any).data || {}).children as string[]).length : 0,
        }));
        console.info('[SubGroupDebug] sample', out);
      }
    }
    // 域尺寸计算时机调整：推迟到子域纵向堆叠与统一后

    const repackDomainsWithUniformGap = (list: ReactFlowNode[]) => {
      const tgs = list.filter(n => String(n.type || '') === 'titleGroup')
        .slice()
        .sort((a, b) => {
          const ai = domainOrderIndex.get(String(((a as any)?.data?.domain || '')));
          const bi = domainOrderIndex.get(String(((b as any)?.data?.domain || '')));
          if (typeof ai === 'number' && typeof bi === 'number' && ai !== bi) return ai - bi;
          return num(((a as any)?.position?.x), 0) - num(((b as any)?.position?.x), 0);
        });
      let cx = anchorLeftGlobal;
      for (const tg of tgs) {
        const curX = num(((tg as any)?.position?.x), anchorLeftGlobal);
        const dx = Math.round(cx - curX);
        const dId = String(((tg.data as any)?.domain || ''));
        if (dx !== 0) {
          for (let i = 0; i < list.length; i++) {
            const n = list[i];
            const belongs = String(((n.data as any)?.domain || '')) === dId;
            if (!belongs) continue;
            const nx = Math.round(num(((n as any)?.position?.x), 0) + dx);
            const ny = Math.round(num(((n as any)?.position?.y), 0));
            (list[i] as any).position = { x: nx, y: ny } as any;
          }
        }
        (tg as any).position.x = Math.round(cx);
        cx += num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 360) + domainGapEffH;
      }
    };

    /**
     * 终态域顶端对齐（函数级注释）
     * - 目标：在所有重排与重算完成后，确保所有域容器及其成员 y 统一对齐到 `anchorTopGlobal`。
     */
    const topAlignDomains = (list: ReactFlowNode[]) => {
      const containers = list
        .filter(n => ['titleGroup', 'domain'].includes(String(n.type || '')))
        .sort((a, b) => num(((a as any)?.position?.x), 0) - num(((b as any)?.position?.x), 0));
      for (const ct of containers) {
        const curY = num(((ct as any)?.position?.y), anchorTopGlobal);
        const dyAlign = Math.round(anchorTopGlobal - curY);
        const dId = String((((ct as any).data?.domain || '')));
        if (dyAlign !== 0) {
          for (let i = 0; i < list.length; i++) {
            const n = list[i];
            const belongs = String(((n.data as any)?.domain || '')) === dId;
            if (!belongs) continue;
            const nx = num(((n as any)?.position?.x), 0);
            const ny = num(((n as any)?.position?.y), 0) + dyAlign;
            (list[i] as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
          }
        }
        (ct as any).position.y = Math.round(anchorTopGlobal);
      }
    };

    /**
     * 函数级注释：按当前成员水平投影收缩域宽（允许缩小）
     * - 目标：移除历史占位造成的空白，域宽精确贴合内容；与“仅扩展不收缩”的通用回收不同，此处允许缩小。
     */
    const shrinkDomainWidthsToProjection = (list: ReactFlowNode[]) => {
      const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      const padHLocal = numLocal((diagramConfigManager.getConfig() as any)?.domain?.padding?.horizontal, 24);
      const sideSafe = Math.max(0, numLocal(((diagramConfigManager.getConfig() as any)?.domain?.sideSafeGap), 8));
      const domainsList = list.filter(n => String(n.type || '') === 'titleGroup');
      for (const dc of domainsList) {
        const dId = String((((dc as any).data?.domain || '')));
        if (!dId) continue;
        const x = numLocal(((dc as any)?.position?.x), 0);
        const innerLeft = x + padHLocal;
        let minLeft = Infinity; let maxRight = -Infinity;
        for (const n of list) {
          const belongs = String(((n as any)?.data?.domain || '')) === dId;
          const tp = String(n.type || '');
          if (!belongs || tp === 'titleGroup' || !!(((n as any)?.data) || {})?.hidden) continue;
          const nx = numLocal(((n as any)?.position?.x), innerLeft);
          const nw = numLocal((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
          minLeft = Math.min(minLeft, nx);
          maxRight = Math.max(maxRight, nx + nw);
        }
        if (!isFinite(minLeft) || !isFinite(maxRight)) continue;
        const contentW = Math.max(0, maxRight - minLeft);
        const requiredW = Math.max(0, contentW + padHLocal * 2 + sideSafe * 2);
        ((dc as any).style || ((dc as any).style = {})).width = requiredW;
        (dc as any).measured = { width: requiredW, height: numLocal((((dc as any)?.measured?.height ?? (dc as any)?.style?.height)), 0) } as any;
        (dc as any).width = requiredW;
      }
    };

    // 函数级注释：在统一间距前先按投影收缩域宽（允许缩小）
    shrinkDomainWidthsToProjection(updatedNodes);
    repackDomainsWithUniformGap(updatedNodes);
    {
      const containers = updatedNodes
        .filter(n => ['titleGroup', 'domain'].includes(String(n.type || '')))
        .sort((a, b) => num(((a as any)?.position?.x), 0) - num(((b as any)?.position?.x), 0));
      for (const ct of containers) {
        const curY = num(((ct as any)?.position?.y), anchorTopGlobal);
        const dyAlign = Math.round(anchorTopGlobal - curY);
        const dId = String((((ct as any).data?.domain || '')));
        if (dyAlign !== 0) {
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            const belongs = String(((n.data as any)?.domain || '')) === dId;
            if (!belongs) continue;
            const nx = num(((n as any)?.position?.x), 0);
            const ny = num(((n as any)?.position?.y), 0) + dyAlign;
            (updatedNodes[i] as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
          }
        }
        (ct as any).position.y = Math.round(anchorTopGlobal);
      }
    }

    /**
     * 函数级注释：终态子域内部严格布局巩固
     * - 目标：在容器堆叠与统一后，再次按所选节点布局策略重排 children，避免因整体平移造成的重叠或策略失效。
     */
    // 对于 dagre 布局，使用 reflowSubGroupChildrenDagre；其他布局使用 enforceSubGroupChildrenLayoutStrict
    if (nodeLayoutEffective === 'dagre') {
      const idm = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        const childNodes = ch.map(id => idm.get(id)).filter((nn): nn is ReactFlowNode => !!nn && !(((nn as any)?.data) || {})?.hidden);
        if (childNodes.length === 0) continue;
        const result = reflowSubGroupChildrenDagre(sg, childNodes, baseHGapCfg, nodeV, edges);
        const resultMap = new Map(result.map(n => [n.id, n]));
        for (let i = 0; i < updatedNodes.length; i++) {
          const updated = resultMap.get(updatedNodes[i].id);
          if (updated) updatedNodes[i] = updated;
        }
      }
    } else {
      updatedNodes = enforceSubGroupChildrenLayoutStrict(updatedNodes, nodeLayoutEffective as any) as any;
    }
    updatedNodes = centerSubGroupChildrenHorizontally(updatedNodes) as any;
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes) as any;
    updatedNodes = stackSubGroupsVertically(updatedNodes) as any;
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes) as any;
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes) as any;
    updatedNodes = compactDomainBlocks(updatedNodes, undefined, Math.max(8, nodeVGapForDomainStack)) as any;
    updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes) as any;
    updatedNodes = unifySubGroupWidthsByDomain(updatedNodes) as any;
    updatedNodes = centerSubGroupChildrenHorizontally(updatedNodes) as any;
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes) as any;

    updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;
    updatedNodes = clampNodesToContainers(updatedNodes) as any;
    updatedNodes = clampDomainHeightsToSubGroups(updatedNodes) as any;
    shrinkDomainWidthsToProjection(updatedNodes);

    // 终段：统一子域宽度为域内部可用宽度
    updatedNodes = unifySubGroupWidthsByDomain(updatedNodes) as any;

    {
      const alignPref = String(layeredCfg.get<string>('diagram.layout.subGroupAlign', 'center') || 'center').toLowerCase();
      if (alignPref === 'center') {
        updatedNodes = fitSubGroupsToDomainSymmetric(updatedNodes) as any;
      } else {
        updatedNodes = unifySubGroupLeftAnchorsStrict(updatedNodes) as any;
      }
    }
    // 最终确保：在容器尺寸与位置稳定后，再次执行子域内容居中，消除因容器扩展导致的左对齐偏差
    updatedNodes = centerSubGroupChildrenHorizontally(updatedNodes) as any;
    // 回撤：不进行垂直对称打包与额外回收，仅执行既有容器与域对齐流程
    updatedNodes = resolveDomainContainerOverlaps(updatedNodes, domainGapEffH) as any;
    repackDomainsWithUniformGap(updatedNodes);
    topAlignDomains(updatedNodes);

    // 终态：按投影均衡左右留白
    updatedNodes = equalizeSubGroupMarginsByProjection(updatedNodes) as any;

    if (stopAfterPhase === 'phase2') {
      const processedEdges = edges.map(edge => {
        const edgeType = String(edge.type || '').toLowerCase();
        const finalType = edgeType.includes('smart') ? edge.type : 'smart-step';
        return {
          ...edge,
          type: finalType,
          data: {
            ...(edge.data || {}),
            intraContainerNoObstacle: true,
            obstacleScope: 'corridor',
            obstaclePadding: 24,
            pathOptions: {
              ...(edge.data?.pathOptions || {}),
              gridRatio: 1.04,
              borderRadius: 4 // [FIX] Hyper-Glass V3: 4px sharp corners
            }
          }
        };
      });
      return { nodes: updatedNodes, edges: processedEdges } as any;
    }

    /**
     * 函数级注释：边配置处理（启用容器透明 + 统一智能连线决策）
     * - 调用 decideEdgeRouting 赋予横向布局统一的端口选择智能
     * - 传入 layoutDirection: 'LR' (横向布局特征)
     */
    const edgeIdMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
    const cfgEdge = (diagramConfigManager.getConfig() as any)?.edge || {};

    // [FIX] 在边路由前主动计算 positionAbsolute（对齐 DomainVerticalLayoutStrategy）
    // 初始布局时 React Flow 还没有计算这个值，导致 decideEdgeRouting 使用错误坐标
    for (const node of updatedNodes) {
      let x = (node.position as any)?.x ?? 0;
      let y = (node.position as any)?.y ?? 0;
      let current: ReactFlowNode = node;
      let depth = 0;
      while ((current as any).parentId && depth < 20) {
        const parent = edgeIdMap.get((current as any).parentId);
        if (!parent) break;
        x += (parent.position as any)?.x ?? 0;
        y += (parent.position as any)?.y ?? 0;
        current = parent;
        depth++;
      }
      (node as any).positionAbsolute = { x, y };
    }

    // P1: Edge-Edge Avoidance - 收集已路由边的路径
    const routedPaths: Array<{ points: Array<{ x: number; y: number }> }> = [];


    const processedEdges = edges.map(edge => {
      // 1. 保留原有属性
      const edgeType = String(edge.type || '').toLowerCase();
      // 如果已经是 smart 类型，保持；否则默认 smart-step
      const baseType = edgeType.includes('smart') ? edge.type : 'smart-step';

      // 2. 准备连线数据容器
      const newData = {
        ...(edge.data || {}),
        intraContainerNoObstacle: true,
        obstacleScope: 'corridor',
        obstaclePadding: 16,
        pathOptions: {
          ...(edge.data?.pathOptions || {}),
          gridRatio: 1.04,
          borderRadius: 4 // [FIX] Hyper-Glass V3: 4px sharp corners
        }
      };

      // 3. 调用统一智能决策 (decideEdgeRouting)
      const srcNode = edgeIdMap.get(edge.source);
      const tgtNode = edgeIdMap.get(edge.target);

      // 默认结果
      let finalType = baseType;
      let finalSourceHandle = edge.sourceHandle;
      let finalTargetHandle = edge.targetHandle;

      if (srcNode && tgtNode) {
        const routingConfig = {
          mode: 'advanced-smart' as const,
          globalPath: (cfgEdge.pathType || 'step') as string,
          autoPathSelection: true,
          layoutDirection: 'LR', // 横向布局主要流向为 LR
          directionalHandlePolicy: 'force' as const, // 强制遵循方向以保证横向层级清晰
          angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
          routedPaths, // P1: 传入已路由路径
        };

        const choice = decideEdgeRouting(srcNode, tgtNode, updatedNodes, routingConfig);
        finalType = choice.type;
        finalSourceHandle = choice.sourceHandle;
        finalTargetHandle = choice.targetHandle;

        // P1: 记录此边的完整计算路径
        if (choice.computedPath && choice.computedPath.length >= 2) {
          routedPaths.push({ points: choice.computedPath });
        } else {
          // Fallback: 使用起点终点
          const sPos = (srcNode as any).positionAbsolute ?? (srcNode as any).position ?? { x: 0, y: 0 };
          const tPos = (tgtNode as any).positionAbsolute ?? (tgtNode as any).position ?? { x: 0, y: 0 };
          const sW = (srcNode as any)?.measured?.width ?? 100;
          const sH = (srcNode as any)?.measured?.height ?? 50;
          const tW = (tgtNode as any)?.measured?.width ?? 100;
          const tH = (tgtNode as any)?.measured?.height ?? 50;

          const handleToAnchor = (pos: any, w: number, h: number, handle: string | null | undefined) => {
            switch (handle) {
              case 'l': case 'left': return { x: pos.x, y: pos.y + h / 2 };
              case 'r': case 'right': return { x: pos.x + w, y: pos.y + h / 2 };
              case 't': case 'top': return { x: pos.x + w / 2, y: pos.y };
              case 'b': case 'bottom': return { x: pos.x + w / 2, y: pos.y + h };
              default: return { x: pos.x + w / 2, y: pos.y + h / 2 };
            }
          };

          const startPt = handleToAnchor(sPos, sW, sH, finalSourceHandle);
          const endPt = handleToAnchor(tPos, tW, tH, finalTargetHandle);
          routedPaths.push({ points: [startPt, endPt] });
        }
      }

      return {
        ...edge,
        type: finalType,
        sourceHandle: finalSourceHandle, // 应用智能选择的 Handle
        targetHandle: finalTargetHandle,
        data: newData
      };
    });

    // P2: 全局路由优化（默认启用以支持 Bus 效果）
    const enableGlobalOptimization = (diagramConfigManager.getConfig() as any)?.edge?.globalOptimization ?? true;
    let optimizedEdges = processedEdges;
    if (enableGlobalOptimization && processedEdges.length > 1) {
      optimizedEdges = globalOptimizeEdgeRouting(
        processedEdges,
        updatedNodes,
        { mode: 'advanced-smart', layoutDirection: 'LR', directionalHandlePolicy: 'force', topK: 4 },
        3
      );
    }

    // 4. 并行边分离：避免同节点对的多边堆叠
    const finalEdges = separateParallelEdges(optimizedEdges, 12);

    // P3: 动态多端口分布
    const distributedEdges = distributePortConnections(finalEdges, updatedNodes, 16);

    // P4: 高级边捆绑（默认启用）
    const bundlingEnabled = (diagramConfigManager.getConfig() as any)?.edge?.bundling ?? true;
    const bundledEdges = bundleEdges(distributedEdges, updatedNodes, {
      enabled: bundlingEnabled,
      layoutDirection: 'LR',
      regionSize: 200,
      minBundleSize: 2,
      bundleSpacing: 8
    });

    // P5: 分层边路由 (长边控制点)
    const layeredEdges = layerBasedEdgeRouting(bundledEdges, updatedNodes, {
      enabled: true,
      layerThreshold: 400,
      layoutDirection: 'LR'
    });



    // P7: 正交边美化
    const beautifiedEdges = beautifyOrthogonalEdges(layeredEdges, updatedNodes, {
      enabled: true,
      minSegmentLength: 20
    });

    // P8: 树状总线路由 (模拟电路板)
    const treeEdges = optimizeTreeBusRouting(beautifiedEdges, updatedNodes, {
      enabled: true,
      minBusSize: 2,
      layoutDirection: 'LR'
    });

    // P6: 边标签智能避让
    const labeledEdges = optimizeEdgeLabelPositions(treeEdges, updatedNodes, {
      enabled: true,
      labelPadding: 8
    });

    return { nodes: updatedNodes, edges: labeledEdges };
  }
}

export default DomainHorizontalLayoutStrategy;
