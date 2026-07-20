import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../models/DiagramModels';
import type { LayoutOptions } from '../types/layout';
import { diagramConfigManager } from '../config/DiagramConfig';
import { LayeredConfigManager } from '../config/LayeredConfigManager';
import { ILayoutStrategy } from './LayoutStrategyManager';
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
import { logLayoutDiagnosticsSummary, logSubGroupDebugSample } from './layoutLogging';
import { runEdgeRoutingPipeline } from './shared/edgeRoutingPipeline';
import { resolveDomainHorizontalLayoutBoundary } from './domainHorizontalLayoutBoundary';
import {
  applyDomainHorizontalGroupVisibility,
  injectSemanticSubGroupsForMissingKeys,
  rebindDomainHorizontalChildren,
} from './domainHorizontalSemanticModel';

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
    nodes = Array.isArray(nodes) ? nodes : [];
    edges = Array.isArray(edges) ? edges : [];
    if (nodes.length === 0) return { nodes: [], edges };
    const cfg = diagramConfigManager.getConfig();
    const layoutCfg = diagramConfigManager.getLayoutConfig();
    const layeredCfg = LayeredConfigManager.getInstance();
    const num = (value: unknown, fallback: number) => (
      typeof value === 'number' && Number.isFinite(value) ? value : fallback
    );
    const boundary = resolveDomainHorizontalLayoutBoundary(cfg, layoutCfg, options);
    const {
      padH,
      titleH,
      titleV,
      titleSafe,
      domainGapEffH,
      sideSafe,
      subPadH,
      subTitleH,
      subTitleV,
      subPadTop,
      subBottomSafe,
      nodeV,
      baseHGap: baseHGapCfg,
      hGap: hGapDet,
      anchorTop: anchorTopGlobal,
      anchorLeft: anchorLeftGlobal,
      domainWhitelist,
      subDomainWhitelist: subWhitelist,
      showDomainGroups: showDomain,
      showSubDomainGroups: showSub,
      nodeLayout: nodeLayoutEffective,
    } = boundary;

    let updatedNodes: ReactFlowNode[] = nodes as ReactFlowNode[];
    updatedNodes = applyDomainGrouping(updatedNodes as any, domainWhitelist) as any;
    updatedNodes = normalizeMissingNodeSubDomainByDomain(updatedNodes) as any;
    updatedNodes = applySubGrouping(updatedNodes as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist) as any;
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes as any) as ReactFlowNode[];
    updatedNodes = ensureMeasuredForNodes(updatedNodes);
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);
    updatedNodes = applyDomainHorizontalGroupVisibility(updatedNodes, {
      domainWhitelist,
      subDomainWhitelist: subWhitelist,
      showDomainGroups: showDomain,
      showSubDomainGroups: showSub,
    });
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
        logLayoutDiagnosticsSummary(summary);
      } catch {
        // ignore
      }
    };

    updatedNodes = purgeSubGroupChildrenBySemantic(updatedNodes) as any;
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes) as any;
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes) as any;
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes);
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes) as any;
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes) as any;
    updatedNodes = rebindDomainHorizontalChildren(updatedNodes);
    runDiagnostics(updatedNodes);

    // 域顺序
    const originalIndex = new Map<string, number>(nodes.map((n, i) => [String(n.id), i] as const));

    /**
     * 函数级注释：域内对象排序键（支持显式子域顺序）
     * - 优先级：显式 subDomainOrder > children 最小原始索引 > 节点原始索引
     */
    const subOrderOptRaw = boundary.subDomainOrder;
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
    const orderOpt = boundary.domainOrder;
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
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes);
    updatedNodes = rebindDomainHorizontalChildren(updatedNodes);
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
    updatedNodes = rebindDomainHorizontalChildren(updatedNodes);
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

    const stopAfterPhaseRaw = String((boundary.stopAfterPhase ?? layeredCfg.get<string>('diagram.layout.stopAfterPhase', 'none')) || 'none').toLowerCase().replace(/\s+/g, '');
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
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes);
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes) as any;
    updatedNodes = rebindDomainHorizontalChildren(updatedNodes);
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
      const currentNodeById = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
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
          const _oldX = num(((sg as any)?.position?.x), innerLeft - subPadH);
          const _oldY = num(((sg as any)?.position?.y), cy);
          const newX = innerLeft - subPadH;
          const newY = cy;
          (sg as any).position = { x: newX, y: newY } as any;
          const ch = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
          // 刚体应用：依据快照重置 children 位置 = 子域新位置 + 相对偏移
          // dagre 布局优先使用 __dagreRel，非 dagre 使用 __rel
          for (const cid of ch) {
            const c = currentNodeById.get(cid);
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
            const childrenNodes = ch.map(id => currentNodeById.get(id)).filter((nn): nn is ReactFlowNode => !!nn);
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
        logSubGroupDebugSample(out);
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

    const routedEdges = await runEdgeRoutingPipeline(updatedNodes, edges, { layoutDirection: 'LR' });
    return { nodes: updatedNodes, edges: routedEdges };
  }
}

export default DomainHorizontalLayoutStrategy;
