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

type LayoutNode = ReactFlowNode<Record<string, unknown>>;

const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const nodeDomain = (node: LayoutNode | undefined): string =>
  String(node?.data.domain ?? '').trim();
const nodeChildren = (node: LayoutNode): string[] =>
  Array.isArray(node.data.children)
    ? node.data.children.filter((child): child is string => typeof child === 'string')
    : [];
const isHiddenNode = (node: LayoutNode): boolean => node.data.hidden === true;
const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const nodeX = (node: LayoutNode, fallback = 0): number =>
  finiteNumber(node.position.x, fallback);
const nodeY = (node: LayoutNode, fallback = 0): number =>
  finiteNumber(node.position.y, fallback);
const nodeWidth = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback);
const nodeHeight = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback);
const setNodePosition = (node: LayoutNode | undefined, x: number, y: number): void => {
  if (node) node.position = { x, y };
};
const setNodeDimensions = (node: LayoutNode, width: number, height: number): void => {
  node.style = { ...node.style, width, height };
  node.measured = { ...node.measured, width, height };
  node.width = width;
  node.height = height;
};
const relativePoint = (value: unknown): { x: number; y: number } | undefined => {
  const record = asRecord(value);
  if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) return undefined;
  return { x: record.x as number, y: record.y as number };
};

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
  async calculateLayout(nodes: LayoutNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: LayoutNode[]; edges: Edge[] }> {
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

    let updatedNodes: LayoutNode[] = nodes;
    updatedNodes = applyDomainGrouping(updatedNodes, domainWhitelist);
    updatedNodes = normalizeMissingNodeSubDomainByDomain(updatedNodes);
    updatedNodes = applySubGrouping(updatedNodes as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist);
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes);
    updatedNodes = ensureMeasuredForNodes(updatedNodes);
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);
    updatedNodes = applyDomainHorizontalGroupVisibility(updatedNodes, {
      domainWhitelist,
      subDomainWhitelist: subWhitelist,
      showDomainGroups: showDomain,
      showSubDomainGroups: showSub,
    });
    /** 函数级注释：诊断输出（可选） */
    const runDiagnostics = (list: LayoutNode[]) => {
      try {
        const enable = Boolean(layeredCfg.get<boolean>('diagram.layout.diagnostics', true));
        if (!enable) return;
        const isGroupType = (type: unknown) => GROUP_TYPES.has(String(type ?? ''));
        const domains = Array.from(new Set(list.map(nodeDomain).filter(Boolean)));
        const summary: Array<{ domain: string; subGroups: number; biz: number; orphanCount: number }> = [];
        for (const d of domains) {
          const sgList = list.filter(n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === d);
          const sgChildren = new Set<string>();
          sgList.forEach(sg => {
            const ch = nodeChildren(sg);
            ch.forEach(id => sgChildren.add(id));
          });
          const biz = list.filter(n => !isGroupType(n.type) && nodeDomain(n) === d && !isHiddenNode(n));
          const orphan = biz.filter(n => !sgChildren.has(n.id)).map(n => n.id);
          summary.push({ domain: d, subGroups: sgList.length, biz: biz.length, orphanCount: orphan.length });
        }
        logLayoutDiagnosticsSummary(summary);
      } catch {
        // ignore
      }
    };

    updatedNodes = purgeSubGroupChildrenBySemantic(updatedNodes);
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes);
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes);
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes);
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes);
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
        const children = nodeChildren(n);

        // 1. 显式顺序
        const dKey = nodeDomain(n);
        const sKeyRaw = String(n.data.description ?? n.data.subDomain ?? n.id).trim();
        const expIdx = getExplicitSubIndex(dKey, sKeyRaw);
        if (Number.isFinite(expIdx)) return expIdx - 200000;

        // 1.1 语义顺序 (Semantic Sequence)
        const seqRaw = n.data.sequence ?? n.data.order;
        const seq = typeof seqRaw === 'number' ? seqRaw : Number.parseFloat(String(seqRaw ?? ''));
        if (Number.isFinite(seq)) return seq - 100000;

        // 2. 默认顺序（按子节点出现）
        let idx = Number.POSITIVE_INFINITY;
        for (const cid of children) {
          const v = originalIndex.get(String(cid));
          if (typeof v === 'number') idx = Math.min(idx, v);
        }
        return Number.isFinite(idx) ? idx : Number.POSITIVE_INFINITY;
      }
      const v = originalIndex.get(String(n.id));
      return (typeof v === 'number') ? v : Number.POSITIVE_INFINITY;
    };
    const orderOpt = boundary.domainOrder;
    const domainsInData: string[] = [];
    const seenDomains = new Set<string>();
    for (const n of nodes) {
      const d = nodeDomain(n);
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
    const domainsPlaced: LayoutNode[] = [];
    for (const d of domains) {
      const tg = updatedNodes.find(n => String(n.type ?? '') === 'titleGroup' && nodeDomain(n) === d);
      if (!tg) continue;
      setNodePosition(tg, cursorX, anchorTopGlobal);
      domainsPlaced.push(tg);
      cursorX += nodeWidth(tg, 360) + domainGapEffH;
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
      const idm = new Map<string, LayoutNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        const ch = nodeChildren(sg);
        const childNodes = ch.map(id => idm.get(id)).filter((nn): nn is LayoutNode => nn !== undefined && !isHiddenNode(nn));
        if (childNodes.length === 0) continue;
        if (childNodes.length === 0) continue;
        // Determine layout direction: horizontal for "预约管理" subdomain, otherwise vertical
        const subDomainName = String(sg.data.subDomain ?? '');
        const direction: 'TB' | 'LR' = subDomainName.includes('预约管理') ? 'LR' : 'TB';
        const result = reflowSubGroupChildrenDagre(sg, childNodes, baseHGapCfg, nodeV, edges, direction);
        const resultMap = new Map(result.map(n => [n.id, n]));
        for (let i = 0; i < updatedNodes.length; i++) {
          const updated = resultMap.get(updatedNodes[i].id);
          if (updated) updatedNodes[i] = updated;
        }
      }
    } else {
      updatedNodes = enforceSubGroupChildrenLayoutStrict(updatedNodes, nodeLayoutEffective);
    }
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes);
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes);
    updatedNodes = rebindDomainHorizontalChildren(updatedNodes);
    updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes);
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes);
    {
      const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
      for (const dc of tgs) {
        const dId = nodeDomain(dc);
        const sgs = updatedNodes.filter(n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === dId && !isHiddenNode(n));
        if (!sgs.length) continue;
        const maxW = sgs.reduce((m, sg) => Math.max(m, nodeWidth(sg, 0)), 0);
        for (const sg of sgs) {
          setNodeDimensions(sg, Math.max(0, maxW), nodeHeight(sg, 0));
        }
      }
    }
    // 使用内部快照机制记录刚体相对偏移

    const stopAfterPhaseRaw = String((boundary.stopAfterPhase ?? layeredCfg.get<string>('diagram.layout.stopAfterPhase', 'none')) || 'none').toLowerCase().replace(/\s+/g, '');
    const stopAfterPhase: 'none' | 'phase1' | 'phase2' =
      stopAfterPhaseRaw === 'phase1' || stopAfterPhaseRaw === 'phase2'
        ? stopAfterPhaseRaw
        : 'none';
    if (stopAfterPhase === 'phase1') return { nodes: updatedNodes, edges };

    // 阶段二：严格流水线（先刚体再重排）
    const strictPipeline = Boolean(layeredCfg.get<boolean>('diagram.layout.strictPipeline', true));
    if (!strictPipeline) {
      updatedNodes = stackSubGroupsVertically(updatedNodes);
    }
    // 阶段二：先纵堆与刚体整体位移，重排与行打包延后至刚体应用之后
    updatedNodes = enforceSubGroupTitleClearance(updatedNodes);
    if (!strictPipeline && nodeLayoutEffective !== 'dagre') {
      updatedNodes = resolveSubGroupChildrenOverlapsStrict(updatedNodes, Math.max(12, subPadH), Math.max(8, nodeV));
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    } else if (!strictPipeline && nodeLayoutEffective === 'dagre') {
      // dagre 布局已计算层次位置，仅回收容器尺寸
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    }
    updatedNodes = resolveFreeNodeOverlapsInDomain(updatedNodes, Math.max(12, subPadH), Math.max(8, nodeV));
    updatedNodes = pushFreeNodesBelowSubGroupRow(updatedNodes);
    /**
     * 函数级注释：阶段二之后重建子域 children 映射
     * - 目标：在垂直重排/行打包/刚体移动后，确保每个子域的 children 集合与语义归属一致，以便投影计算包含全部成员。
     */
    updatedNodes = injectSemanticSubGroupsForMissingKeys(updatedNodes);
    updatedNodes = auditAndFixSubGroupChildrenBindings(updatedNodes);
    updatedNodes = rebindDomainHorizontalChildren(updatedNodes);
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes);

    /**
     * 函数级注释：由内而外的尺寸与排布时序（不收缩）
     * - 子域：严格包含 → 尺寸回收 → 重叠消解 → 再次回收 → 高度按投影（保留锚点）
     * - 域：按成员投影回收宽/高 → 钳制 → 域容器重叠消解 → 统一间距与顶边对齐
     */
    if (!strictPipeline) {
      updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes);
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
      updatedNodes = resolveSubGroupOverlaps(updatedNodes, Math.max(12, hGapDet), Math.max(8, nodeV));
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
      updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes);
    }

    // 记录子域 children 相对偏移（刚体快照）
    const snapshotChildrenRel = (list: LayoutNode[]) => {
      const idm = new Map<string, LayoutNode>(list.map(n => [n.id, n] as const));
      const sgs = list.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        // dagre 子域跳过 __rel 快照，保留已有的 __dagreRel 相对位置
        const dagreSized = asRecord(sg.data.__dagreSized);
        if (typeof dagreSized.h === 'number' && dagreSized.h > 0) {
          continue; // 保留 dagre 计算的精确相对位置
        }
        const sx = nodeX(sg);
        const sy = nodeY(sg);
        const ch = nodeChildren(sg);
        for (const cid of ch) {
          const c = idm.get(cid);
          if (!c) continue;
          c.data = { ...c.data, __rel: { x: Math.round(nodeX(c) - sx), y: Math.round(nodeY(c) - sy) } };
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
      const currentNodeById = new Map<string, LayoutNode>(updatedNodes.map(n => [n.id, n] as const));
      const tgs = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
      for (const tg of tgs) {
        const dKey = nodeDomain(tg);
        const innerLeft = nodeX(tg, anchorLeftGlobal) + padH + sideSafe;
        const innerTop = nodeY(tg, anchorTopGlobal) + titleH + titleV + titleSafe;
        const sgs = updatedNodes
          .filter(n => String(n.type || '') === 'subGroup')
          .filter(n => nodeDomain(n) === dKey)
          .slice()
          .sort((a, b) => orderKeyOf(a) - orderKeyOf(b));
        let cy = innerTop;
        for (const sg of sgs) {
          const _oldX = nodeX(sg, innerLeft - subPadH);
          const _oldY = nodeY(sg, cy);
          const newX = innerLeft - subPadH;
          const newY = cy;
          setNodePosition(sg, newX, newY);
          const ch = nodeChildren(sg);
          // 刚体应用：依据快照重置 children 位置 = 子域新位置 + 相对偏移
          // dagre 布局优先使用 __dagreRel，非 dagre 使用 __rel
          for (const cid of ch) {
            const c = currentNodeById.get(cid);
            if (!c) continue;
            const dagreRel = relativePoint(c.data.__dagreRel);
            const rel = relativePoint(c.data.__rel);
            const useRel = dagreRel ?? rel; // dagre 相对位置优先
            const rx = num(useRel?.x, nodeX(c) - newX);
            const ry = num(useRel?.y, nodeY(c) - newY);
            setNodePosition(c, Math.round(newX + rx), Math.round(newY + ry));
          }
          const keepH = nodeHeight(sg, 0);
          cy += Math.round(keepH + nodeVGapForDomainStack);

          // 刚体之后一次性垂直重排/行打包（仅在检测到重叠或行间距不足时执行）
          try {
            const childrenNodes = ch.map(id => currentNodeById.get(id)).filter((nn): nn is LayoutNode => nn !== undefined);
            const SAFE_W = num(diagramConfigManager.getLayoutConfig().NODE_MIN_WIDTH, 120);
            const SAFE_H = Math.max(24, num(diagramConfigManager.getConfig().node.height, 80));
            const getW = (n: LayoutNode) => Math.max(SAFE_W, nodeWidth(n, SAFE_W));
            const getH = (n: LayoutNode) => Math.max(24, nodeHeight(n, SAFE_H));
            const overlaps = (() => {
              for (let i = 0; i < childrenNodes.length; i++) {
                const a = childrenNodes[i]; const ax = nodeX(a); const ay = nodeY(a);
                const aw = getW(childrenNodes[i]); const ah = getH(childrenNodes[i]);
                for (let j = i + 1; j < childrenNodes.length; j++) {
                  const b = childrenNodes[j]; const bx = nodeX(b); const by = nodeY(b);
                  const bw = getW(childrenNodes[j]); const bh = getH(childrenNodes[j]);
                  const disjoint = ax >= bx + bw || ax + aw <= bx || ay >= by + bh || ay + ah <= by;
                  if (!disjoint) return true;
                }
              }
              return false;
            })();
            // dagre 布局子域跳过重叠重排 - 内部结构已由 dagre 精确计算
            const sgDagreSized = sg.data.__dagreSized;
            if (overlaps && strictPipeline && !sgDagreSized) {
              const strict = reflowSubGroupChildrenVertical(sg, childrenNodes, Math.max(12, subPadH), Math.max(8, nodeV));
              const mapStrict = new Map<string, LayoutNode>(strict.map(n => [n.id, n] as const));
              for (const id of ch) { const p = mapStrict.get(id); const j = updatedNodes.findIndex(u => u.id === id); if (p && j >= 0) setNodePosition(updatedNodes[j], Math.round(nodeX(p)), Math.round(nodeY(p))); }
              const packed = packSubGroupChildrenRigid(sg, childrenNodes, Math.max(12, subPadH), Math.max(8, nodeV));
              const mapPacked = new Map<string, LayoutNode>(packed.map(n => [n.id, n] as const));
              for (const id of ch) { const p = mapPacked.get(id); const j = updatedNodes.findIndex(u => u.id === id); if (p && j >= 0) setNodePosition(updatedNodes[j], Math.round(nodeX(p)), Math.round(nodeY(p))); }
            }
          } catch {
            // ignore
          }
        }
      }
    }
    // 严格按 children 实际包围盒再回收一次子域尺寸，避免纵堆后出现尺寸偏差
    {
      const idm = new Map<string, LayoutNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgsVisible = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgsVisible) {
        // dagre 模式跳过：保留 dagre 计算的精确尺寸
        const dagreSized = asRecord(sg.data.__dagreSized);
        if (typeof dagreSized.h === 'number' && dagreSized.h > 0) {
          continue;
        }
        const ch = nodeChildren(sg);
        const childNodes = ch.map(id => idm.get(id)).filter((cn): cn is LayoutNode => cn !== undefined);
        if (!childNodes.length) continue;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const getW = (n: LayoutNode) => nodeWidth(n, 120);
        const getH = (n: LayoutNode) => nodeHeight(n, 80);
        for (const c of childNodes) {
          const x = nodeX(c);
          const y = nodeY(c);
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + getW(c)); maxY = Math.max(maxY, y + getH(c));
        }
        if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
          const curX = nodeX(sg);
          const curY = nodeY(sg);
          const contentLeft = curX + subPadH;
          const contentTop = curY + subTitleH + subTitleV + subPadTop;
          const contentW = Math.max(0, maxX - contentLeft);
          const contentH = Math.max(0, maxY - contentTop);
          const newW = Math.max(0, contentW + subPadH * 2);
          const newH = Math.max(0, contentH + subTitleH + subTitleV + subPadTop + subBottomSafe);
          setNodeDimensions(sg, Math.round(newW), Math.round(newH));

          /**
           * 子域孩子钳制到容器内容区（函数级注释）
           * - 目标：确保所有孩子坐标都在当前子域内容矩形内，避免视觉漂移。
           */
          const innerRight = Math.round(curX + Math.max(newW, nodeWidth(sg, newW)) - subPadH);
          const innerBottom = Math.round(curY + Math.max(newH, nodeHeight(sg, newH)) - subBottomSafe);
          for (const c of childNodes) {
            const px = nodeX(c, contentLeft);
            const py = nodeY(c, contentTop);
            const cw = getW(c); const ch = getH(c);
            const nx = Math.max(contentLeft, Math.min(px, innerRight - cw));
            const ny = Math.max(contentTop, Math.min(py, innerBottom - ch));
            setNodePosition(c, Math.round(nx), Math.round(ny));
          }
          // 钳制后再次按真实包围盒微调容器尺寸
          let minX2 = Infinity, minY2 = Infinity, maxX2 = -Infinity, maxY2 = -Infinity;
          for (const c of childNodes) {
            const x2 = nodeX(c);
            const y2 = nodeY(c);
            minX2 = Math.min(minX2, x2); minY2 = Math.min(minY2, y2);
            maxX2 = Math.max(maxX2, x2 + getW(c)); maxY2 = Math.max(maxY2, y2 + getH(c));
          }
          if (Number.isFinite(minX2) && Number.isFinite(minY2) && Number.isFinite(maxX2) && Number.isFinite(maxY2)) {
            const contentW2 = Math.max(0, maxX2 - contentLeft);
            const contentH2 = Math.max(0, maxY2 - contentTop);
            const newW2 = Math.max(0, contentW2 + subPadH * 2);
            const newH2 = Math.max(0, contentH2 + subTitleH + subTitleV + subPadTop + subBottomSafe);
            setNodeDimensions(sg, Math.round(newW2), Math.round(newH2));
          }
        }
      }
    }
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes);
    updatedNodes = unifySubGroupWidthsByDomain(updatedNodes);
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes);
    {
      const enableDebug = Boolean(LayeredConfigManager.getInstance().get<boolean>('diagram.layout.debug', false));
      if (enableDebug) {
        const logItems = updatedNodes.filter(n => String(n.type || '') === 'subGroup').slice(0, 8);
        const out = logItems.map(sg => ({
          id: sg.id,
          domain: sg.data.domain,
          subDomain: sg.data.subDomain,
          pos: sg.position,
          size: { w: nodeWidth(sg, 0), h: nodeHeight(sg, 0) },
          childrenCount: nodeChildren(sg).length,
        }));
        logSubGroupDebugSample(out);
      }
    }
    // 域尺寸计算时机调整：推迟到子域纵向堆叠与统一后

    const repackDomainsWithUniformGap = (list: LayoutNode[]) => {
      const tgs = list.filter(n => String(n.type || '') === 'titleGroup')
        .slice()
        .sort((a, b) => {
          const ai = domainOrderIndex.get(nodeDomain(a));
          const bi = domainOrderIndex.get(nodeDomain(b));
          if (typeof ai === 'number' && typeof bi === 'number' && ai !== bi) return ai - bi;
          return nodeX(a) - nodeX(b);
        });
      let cx = anchorLeftGlobal;
      for (const tg of tgs) {
        const curX = nodeX(tg, anchorLeftGlobal);
        const dx = Math.round(cx - curX);
        const dId = nodeDomain(tg);
        if (dx !== 0) {
          for (let i = 0; i < list.length; i++) {
            const n = list[i];
            const belongs = nodeDomain(n) === dId;
            if (!belongs) continue;
            const nx = Math.round(nodeX(n) + dx);
            const ny = Math.round(nodeY(n));
            setNodePosition(list[i], nx, ny);
          }
        }
        setNodePosition(tg, Math.round(cx), nodeY(tg));
        cx += nodeWidth(tg, 360) + domainGapEffH;
      }
    };

    /**
     * 终态域顶端对齐（函数级注释）
     * - 目标：在所有重排与重算完成后，确保所有域容器及其成员 y 统一对齐到 `anchorTopGlobal`。
     */
    const topAlignDomains = (list: LayoutNode[]) => {
      const containers = list
        .filter(n => ['titleGroup', 'domain'].includes(String(n.type || '')))
        .sort((a, b) => nodeX(a) - nodeX(b));
      for (const ct of containers) {
        const curY = nodeY(ct, anchorTopGlobal);
        const dyAlign = Math.round(anchorTopGlobal - curY);
        const dId = nodeDomain(ct);
        if (dyAlign !== 0) {
          for (let i = 0; i < list.length; i++) {
            const n = list[i];
            const belongs = nodeDomain(n) === dId;
            if (!belongs) continue;
            setNodePosition(list[i], Math.round(nodeX(n)), Math.round(nodeY(n) + dyAlign));
          }
        }
        setNodePosition(ct, nodeX(ct), Math.round(anchorTopGlobal));
      }
    };

    /**
     * 函数级注释：按当前成员水平投影收缩域宽（允许缩小）
     * - 目标：移除历史占位造成的空白，域宽精确贴合内容；与“仅扩展不收缩”的通用回收不同，此处允许缩小。
     */
    const shrinkDomainWidthsToProjection = (list: LayoutNode[]) => {
      const domainConfig = diagramConfigManager.getConfig().domain;
      const padHLocal = finiteNumber(domainConfig.padding.horizontal, 24);
      const sideSafe = Math.max(0, finiteNumber(domainConfig.sideSafeGap, 8));
      const domainsList = list.filter(n => String(n.type || '') === 'titleGroup');
      for (const dc of domainsList) {
        const dId = nodeDomain(dc);
        if (!dId) continue;
        const x = nodeX(dc);
        const innerLeft = x + padHLocal;
        let minLeft = Infinity; let maxRight = -Infinity;
        for (const n of list) {
          const belongs = nodeDomain(n) === dId;
          const tp = String(n.type || '');
          if (!belongs || tp === 'titleGroup' || isHiddenNode(n)) continue;
          const nx = nodeX(n, innerLeft);
          const nw = nodeWidth(n, 0);
          minLeft = Math.min(minLeft, nx);
          maxRight = Math.max(maxRight, nx + nw);
        }
        if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight)) continue;
        const contentW = Math.max(0, maxRight - minLeft);
        const requiredW = Math.max(0, contentW + padHLocal * 2 + sideSafe * 2);
        setNodeDimensions(dc, requiredW, nodeHeight(dc, 0));
      }
    };

    // 函数级注释：在统一间距前先按投影收缩域宽（允许缩小）
    shrinkDomainWidthsToProjection(updatedNodes);
    repackDomainsWithUniformGap(updatedNodes);
    {
      const containers = updatedNodes
        .filter(n => ['titleGroup', 'domain'].includes(String(n.type || '')))
        .sort((a, b) => nodeX(a) - nodeX(b));
      for (const ct of containers) {
        const curY = nodeY(ct, anchorTopGlobal);
        const dyAlign = Math.round(anchorTopGlobal - curY);
        const dId = nodeDomain(ct);
        if (dyAlign !== 0) {
          for (let i = 0; i < updatedNodes.length; i++) {
            const n = updatedNodes[i];
            const belongs = nodeDomain(n) === dId;
            if (!belongs) continue;
            setNodePosition(updatedNodes[i], Math.round(nodeX(n)), Math.round(nodeY(n) + dyAlign));
          }
        }
        setNodePosition(ct, nodeX(ct), Math.round(anchorTopGlobal));
      }
    }

    /**
     * 函数级注释：终态子域内部严格布局巩固
     * - 目标：在容器堆叠与统一后，再次按所选节点布局策略重排 children，避免因整体平移造成的重叠或策略失效。
     */
    // 对于 dagre 布局，使用 reflowSubGroupChildrenDagre；其他布局使用 enforceSubGroupChildrenLayoutStrict
    if (nodeLayoutEffective === 'dagre') {
      const idm = new Map<string, LayoutNode>(updatedNodes.map(n => [n.id, n] as const));
      const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');
      for (const sg of sgs) {
        const ch = nodeChildren(sg);
        const childNodes = ch.map(id => idm.get(id)).filter((nn): nn is LayoutNode => nn !== undefined && !isHiddenNode(nn));
        if (childNodes.length === 0) continue;
        const result = reflowSubGroupChildrenDagre(sg, childNodes, baseHGapCfg, nodeV, edges);
        const resultMap = new Map(result.map(n => [n.id, n]));
        for (let i = 0; i < updatedNodes.length; i++) {
          const updated = resultMap.get(updatedNodes[i].id);
          if (updated) updatedNodes[i] = updated;
        }
      }
    } else {
      updatedNodes = enforceSubGroupChildrenLayoutStrict(updatedNodes, nodeLayoutEffective);
    }
    updatedNodes = centerSubGroupChildrenHorizontally(updatedNodes);
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = enforceSubGroupStrictContainmentByChildren(updatedNodes);
    updatedNodes = stackSubGroupsVertically(updatedNodes);
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes);
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = finalizeSubGroupHeightsByProjectionPreserveAnchor(updatedNodes);
    updatedNodes = compactDomainBlocks(updatedNodes, undefined, Math.max(8, nodeVGapForDomainStack));
    updatedNodes = finalizeDomainWidthsByProjection(updatedNodes);
    updatedNodes = finalizeSubGroupWidthsByProjectionPreserveAnchor(updatedNodes);
    updatedNodes = unifySubGroupWidthsByDomain(updatedNodes);
    updatedNodes = centerSubGroupChildrenHorizontally(updatedNodes);
    updatedNodes = unifySubGroupLeftAnchors(updatedNodes);

    updatedNodes = finalizeDomainHeightsByProjection(updatedNodes);
    updatedNodes = clampNodesToContainers(updatedNodes);
    updatedNodes = clampDomainHeightsToSubGroups(updatedNodes);
    shrinkDomainWidthsToProjection(updatedNodes);

    // 终段：统一子域宽度为域内部可用宽度
    updatedNodes = unifySubGroupWidthsByDomain(updatedNodes);

    {
      const alignPref = String(layeredCfg.get<string>('diagram.layout.subGroupAlign', 'center') || 'center').toLowerCase();
      if (alignPref === 'center') {
        updatedNodes = fitSubGroupsToDomainSymmetric(updatedNodes);
      } else {
        updatedNodes = unifySubGroupLeftAnchorsStrict(updatedNodes);
      }
    }
    // 最终确保：在容器尺寸与位置稳定后，再次执行子域内容居中，消除因容器扩展导致的左对齐偏差
    updatedNodes = centerSubGroupChildrenHorizontally(updatedNodes);
    // 回撤：不进行垂直对称打包与额外回收，仅执行既有容器与域对齐流程
    updatedNodes = resolveDomainContainerOverlaps(updatedNodes, domainGapEffH);
    repackDomainsWithUniformGap(updatedNodes);
    topAlignDomains(updatedNodes);

    // 终态：按投影均衡左右留白
    updatedNodes = equalizeSubGroupMarginsByProjection(updatedNodes);

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
      return { nodes: updatedNodes, edges: processedEdges };
    }

    const routedEdges = await runEdgeRoutingPipeline(updatedNodes, edges, { layoutDirection: 'LR' });
    return { nodes: updatedNodes, edges: routedEdges };
  }
}

export default DomainHorizontalLayoutStrategy;
