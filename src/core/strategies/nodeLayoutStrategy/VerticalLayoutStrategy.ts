import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { ElkNode } from 'elkjs';
import type { StandardNodeData } from '../../models/DiagramModels';
import { diagramConfigManager } from '../../config/DiagramConfig';
import type { LayoutOptions } from '../../types/layout';
import { ILayoutStrategy } from '../LayoutStrategyManager';
import { calculateVerticalLayout, applySubGrouping, assignChildrenToSubGroupsBySemantic, applyDomainGrouping, resolveSubGroupOverlaps, enforceDomainContainerStrictContainment, resolveDomainContainerOverlaps, clampNodesToContainers } from '../../utils/layoutUtils';

type LayoutNode = ReactFlowNode<Record<string, unknown>>;

const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nodeDomain = (node: LayoutNode): string => String(node.data.domain ?? '').trim();
const nodeX = (node: LayoutNode, fallback = 0): number => finiteNumber(node.position.x, fallback);
const nodeY = (node: LayoutNode, fallback = 0): number => finiteNumber(node.position.y, fallback);
const nodeWidth = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback);
const nodeHeight = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback);
const isHiddenNode = (node: LayoutNode): boolean => node.data.hidden === true;
const isFinalizedDomain = (node: LayoutNode): boolean => node.data.finalizedDomain === true;
const nodeChildren = (node: LayoutNode): string[] =>
  Array.isArray(node.data.children)
    ? node.data.children.filter((child): child is string => typeof child === 'string')
    : [];
const setNodePosition = (node: LayoutNode | undefined, x: number, y: number): void => {
  if (node) node.position = { x, y };
};
const setNodeDimensions = (node: LayoutNode, width: number, height: number): void => {
  node.style = { ...node.style, width, height };
  node.measured = { ...node.measured, width, height };
};
const configuredNodeStrategy = (): unknown => {
  const config = asRecord(diagramConfigManager.getConfig());
  return asRecord(asRecord(config.diagram).layout).nodeStrategy
    ?? asRecord(config.layout).nodeStrategy;
};
const isElkLayout = (options: LayoutOptions): boolean =>
  String(options.nodeLayout ?? configuredNodeStrategy() ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+_-]/g, '')
    .includes('elk');

/**
 * 垂直排列布局策略
 * 函数级注释：
 * - 按垂直轴等间距堆叠节点，支持顶部/居中/底部对齐；
 * - 仅对普通节点进行定位，并在之后更新子组容器严格包含；
 * - 结合全局 DiagramConfig 的子组内边距与标题安全间距设置。
 */
export class VerticalLayoutStrategy implements ILayoutStrategy {
  /** 获取策略名称 */
  getName(): string { return 'VerticalLayout'; }
  /** 函数级注释：策略类别 */
  getCategory(): 'hierarchy' | 'node' { return 'node'; }

  /** 获取策略描述 */
  getDescription(): string { return '沿垂直轴等间距堆叠（支持顶部/居中/底部对齐）'; }

  /** 适用性检查：有节点即可 */
  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
    return Array.isArray(nodes) && nodes.length > 0;
  }

  /**
   * 计算布局
   * 函数级注释：
   * - 调用通用垂直布局计算；
   * - 应用坐标到普通节点；
   * - 根据 children 包围盒更新子组位置与尺寸，确保严格包含与标题留白。
   */
  /**
   * 函数级注释：支持 ELK 作为节点布局引擎
   * - 当 options.nodeLayout 映射为 'elk' 时，使用 elkjs layered 对普通节点进行分层排布
   * - 否则沿用通用垂直布局算法
   */
  async calculateLayout(nodes: LayoutNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: LayoutNode[]; edges: Edge[] }> {
    // 函数级注释：按选项生成域/子域容器，并进行垂直堆叠定位
    let nodesWithGroups: LayoutNode[] = nodes;
    if (options?.generateDomainGroups) {
      const domainWhitelist = options.domainWhitelist
        ?? asRecord(options).domainWhiteList as string[] | undefined;
      nodesWithGroups = applyDomainGrouping(nodesWithGroups, domainWhitelist);
    }
    const shouldGenSub = Boolean(options?.generateSubDomainGroups);
    const subWhitelist = options.subDomainWhitelist;
    nodesWithGroups = shouldGenSub
      ? assignChildrenToSubGroupsBySemantic(applySubGrouping(nodesWithGroups as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist)) as ReactFlowNode[]
      : assignChildrenToSubGroupsBySemantic(nodesWithGroups) as ReactFlowNode[];
    const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
    const layoutCandidates: LayoutNode[] = nodesWithGroups.filter(n => !EXCLUDE_TYPES.has(String(n.type ?? '')));

    /**
     * 垂直布局排序规则（函数级注释）
     * - 目标：在垂直节点布局下遵从域与子域排序；节点按 domain→subDomain→sequence/order→原始索引排序
     * - 来源：options.domainOrder / options.subDomainOrder；未显式提供则按首次出现顺序
     */
    const originalIndex = new Map<string, number>(nodesWithGroups.map((n, i) => [String(n.id), i] as const));
    const domainOrderArr = options.domainOrder;
    const domainsByScan = (() => {
      const set = new Set<string>(); const out: string[] = [];
      for (const n of nodesWithGroups) {
        const d = nodeDomain(n);
        if (d && !set.has(d)) { set.add(d); out.push(d); }
      }
      return out;
    })();
    const domainOrderIndex = new Map<string, number>((Array.isArray(domainOrderArr) && domainOrderArr.length ? domainOrderArr : domainsByScan).map((d, i) => [String(d).trim(), i] as const));
    
    // 扫描隐式子域顺序（按出现次序），用于未显式指定子域的 fallback，避免节点混杂
    const implicitSubIndices = new Map<string, number>();
    {
      const seen = new Set<string>();
      let counter = 0;
      for (const n of nodesWithGroups) {
        const dKey = nodeDomain(n);
        const sKey = String(n.data.subDomain ?? n.data.description ?? '').trim();
        if (!dKey && !sKey) continue;
        const compound = dKey + '::' + sKey;
        if (!seen.has(compound)) {
          seen.add(compound);
          implicitSubIndices.set(compound, counter++);
        }
      }
    }

    const subOrderOptRaw = options.subDomainOrder;
    const getExplicitSubIndex = (domainKey: string, subKey: string): number => {
      const dTrim = String(domainKey || '').trim(); 
      const sTrim = String(subKey || '').trim();

      const findInArr = (list: unknown[]): number => {
         // 1. Strict match
         const idx = list.indexOf(sTrim);
         if (idx >= 0) return idx;
         // 2. Fuzzy match (contains)
         return list.findIndex(item => {
             const it = String(item).trim();
             return it && (it === sTrim || it.includes(sTrim) || sTrim.includes(it));
         });
      };
      
      // 全局子域顺序（若 subDomainOrder 是数组）
      if (Array.isArray(subOrderOptRaw)) { 
        const idx = findInArr(subOrderOptRaw); 
        return idx >= 0 ? idx : Number.POSITIVE_INFINITY; 
      }
      
      // 按域指定的子域顺序
      if (subOrderOptRaw && typeof subOrderOptRaw === 'object') {
        let arr = subOrderOptRaw[dTrim];
        
        // 容错匹配：尝试查找包含关系的键
        if (!arr) {
           const keys = Object.keys(subOrderOptRaw);
           const matchKey = keys.find(k => {
             const kt = k.trim();
             return kt === dTrim || dTrim.includes(kt) || kt.includes(dTrim);
           });
           if (matchKey) arr = subOrderOptRaw[matchKey];
        }

        // Debug log for '作业域' to help troubleshooting
        if ((dTrim.includes('作业域') || dTrim.includes('Job')) && import.meta.env.DEV) {
           const _idx = Array.isArray(arr) ? findInArr(arr) : 'N/A';
        }

        if (Array.isArray(arr)) { 
          const idx = findInArr(arr); 
          return idx >= 0 ? idx : Number.POSITIVE_INFINITY; 
        }
      }
      return Number.POSITIVE_INFINITY;
    };

    const orderKeyOfNode = (n: LayoutNode): number => {
      const dKey = nodeDomain(n);
      const sKeyRaw = String(n.data.subDomain ?? n.data.description ?? '').trim();
      
      const dIdx = domainOrderIndex.get(dKey);
      const dOrder = typeof dIdx === 'number' ? dIdx : Number.POSITIVE_INFINITY;
      
      let sIdx = getExplicitSubIndex(dKey, sKeyRaw);
      if (!Number.isFinite(sIdx)) {
         // Fallback: use discovery order (offset by 10000 to be after explicit)
         const compound = dKey + '::' + sKeyRaw;
         const implicit = implicitSubIndices.get(compound);
         sIdx = (typeof implicit === 'number') ? (10000 + implicit) : 99999;
      }
      
      const seqRaw = n.data.sequence ?? n.data.order;
      const seq = typeof seqRaw === 'number'
        ? seqRaw
        : Number.parseFloat(String(seqRaw ?? ''));
      const seqOrder = Number.isFinite(seq) ? seq : Number.POSITIVE_INFINITY;
      
      const orig = originalIndex.get(String(n.id));
      const origOrder = typeof orig === 'number' ? orig : Number.POSITIVE_INFINITY;
      
      // 组合键：域(优先)→子域→节点序→原始索引
      // 权重分配：Domain(1e9) > SubDomain(1e6) > Sequence(1e3) > Original(1)
      return (dOrder * 1e9) + (sIdx * 1e6) + (seqOrder * 1e3) + origOrder;
    };

    // 应用排序：直接修改 layoutCandidates 顺序
    layoutCandidates.sort((a, b) => orderKeyOfNode(a) - orderKeyOfNode(b));
    const sortedCandidates = layoutCandidates;

    const nodeLayoutRaw = options.nodeLayout;
    const s = String(nodeLayoutRaw || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
    const useElk = s.includes('elk') || isElkLayout(options);
    let positions: { x: number; y: number }[];
    if (useElk) {
      const left = Math.max(40, finiteNumber(options.padding?.left, 40));
      const top = Math.max(40, finiteNumber(options.padding?.top, 40));
      const layoutConfig = asRecord(diagramConfigManager.getLayoutConfig());
      const fullConfig = asRecord(diagramConfigManager.getConfig());
      const nodeConfig = asRecord(fullConfig.node);
      const nodeGap = asRecord(nodeConfig.gap);
      const getW = (n: LayoutNode) =>
        nodeWidth(n, Math.max(120, finiteNumber(layoutConfig.NODE_MIN_WIDTH, 120)));
      const getH = (n: LayoutNode) =>
        nodeHeight(n, finiteNumber(nodeConfig.height, 80));
      const scopedEdges = (edges || []).filter(e => layoutCandidates.some(n => n.id === e.source) && layoutCandidates.some(n => n.id === e.target));
      try {
        const { default: ELK } = await import('elkjs');
        const elk = new ELK();
        const dirRaw = String(options.direction ?? '').toUpperCase();
        const elkDir = dirRaw === 'LR' ? 'RIGHT' : 'DOWN';
        const graph: ElkNode = {
          id: 'elk-vls',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': elkDir,
            'elk.spacing.nodeNode': String(Math.max(40, finiteNumber(nodeGap.horizontal, 80))),
            'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.max(40, finiteNumber(nodeGap.vertical, 56))),
            'elk.layered.considerModelOrder': 'true'
            
          },
          children: sortedCandidates.map(n => ({ id: n.id, width: getW(n), height: getH(n) })),
          edges: scopedEdges.map(e => ({ id: e.id || `${e.source}->${e.target}`, sources: [e.source], targets: [e.target] })),
        };
        const res = await elk.layout(graph);
        const idToPos: Record<string, { x: number; y: number }> = {};
        for (const c of (res.children || [])) idToPos[c.id] = { x: Math.round((c.x || 0) + left), y: Math.round((c.y || 0) + top) };
        positions = sortedCandidates.map(n => idToPos[n.id] || { x: left, y: top });
      
      } catch {
        positions = calculateVerticalLayout(sortedCandidates, options);
      }
    } else {
      positions = calculateVerticalLayout(sortedCandidates, options);
    }
    const updatedNodes = nodesWithGroups.map(n => n);
    sortedCandidates.forEach((n, idx) => {
      const pos = positions[idx];
      if (!pos) return;
      n.position = { x: pos.x, y: pos.y };
    });
    

    try {
      const layoutCfg = diagramConfigManager.getLayoutConfig();
      const padH = layoutCfg.SUB_GROUP_PADDING?.H ?? 30;
      const rawTop = layoutCfg.SUB_GROUP_PADDING?.V_TOP ?? 20;
      const padTop = layoutCfg.ENSURE_SUB_GROUP_TITLE_CLEARANCE
        ? Math.max(rawTop, layoutCfg.SUB_GROUP_TITLE_CLEARANCE || rawTop)
        : rawTop;
      const padBottom = layoutCfg.SUB_GROUP_PADDING?.V_BOTTOM ?? 20;

      const idMap = new Map<string, LayoutNode>(updatedNodes.map(n => [n.id, n] as const));
      const getW = (n: LayoutNode): number => nodeWidth(n, 240);
      const getH = (n: LayoutNode): number => nodeHeight(n, 120);

      updatedNodes.filter(n => String(n.type ?? '') === 'subGroup').forEach(sg => {
        const children = nodeChildren(sg);
        const childNodes = children
          .map(id => idMap.get(id))
          .filter((cn): cn is LayoutNode => cn !== undefined)
          .filter(cn => !EXCLUDE_TYPES.has(String(cn.type ?? '')));
        if (childNodes.length === 0) return;

        const minX = Math.min(...childNodes.map(c => nodeX(c)));
        const minY = Math.min(...childNodes.map(c => nodeY(c)));
        const maxX = Math.max(...childNodes.map(c => nodeX(c) + getW(c)));
        const maxY = Math.max(...childNodes.map(c => nodeY(c) + getH(c)));

        const newPos = { x: minX - padH, y: minY - padTop };
        const newW = (maxX - minX) + padH * 2;
        const newH = (maxY - minY) + padTop + padBottom;

        sg.position = newPos;
        setNodeDimensions(sg, newW, newH);
        sg.zIndex = typeof sg.zIndex === 'number' ? sg.zIndex : -5;
      });
    } catch {}

    // 子域纵向堆叠：按域/子域排序统一 Y（保持 children 相对偏移）
    try {
      const cfgFull = asRecord(diagramConfigManager.getConfig());
      const domainConfig = asRecord(cfgFull.domain);
      const domainPadding = asRecord(domainConfig.padding);
      const domainTitle = asRecord(domainConfig.title);
      const domainTitlePadding = asRecord(domainTitle.padding);
      const layoutConfig = asRecord(diagramConfigManager.getLayoutConfig());
      const padHDomain = finiteNumber(domainPadding.horizontal, 24);
      const titleH = finiteNumber(domainTitle.height, 40);
      const titleV = finiteNumber(domainTitlePadding.vertical, 12);
      const nodeVGap = finiteNumber(layoutConfig.NODE_V_GAP, 80);
      const domainsList = updatedNodes.filter(n => String(n.type ?? '') === 'titleGroup');
      for (const dc of domainsList) {
        const dId = nodeDomain(dc);
        const innerLeft = nodeX(dc) + padHDomain;
        const innerTop = nodeY(dc) + titleH + titleV;
        const sgs = updatedNodes.filter(n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === dId && !isHiddenNode(n));
        const orderKeyOfSg = (sg: LayoutNode): number => {
          const sKey = String(sg.data.subDomain ?? sg.data.description ?? '').trim();
          const exp = getExplicitSubIndex(dId, sKey);
          if (Number.isFinite(exp)) return exp - 200000;
          const children = nodeChildren(sg);
          let minChild = Number.POSITIVE_INFINITY; for (const cid of children) { const v = originalIndex.get(String(cid)); if (typeof v === 'number') minChild = Math.min(minChild, v); }
          if (Number.isFinite(minChild)) return minChild;
          const self = originalIndex.get(String(sg.id)); return typeof self === 'number' ? self : Number.POSITIVE_INFINITY;
        };
        const sorted = sgs.slice().sort((a, b) => orderKeyOfSg(a) - orderKeyOfSg(b));
        let cy = innerTop;
        for (const sg of sorted) {
          const oldX = nodeX(sg, innerLeft);
          const oldY = nodeY(sg, innerTop);
          const keepH = nodeHeight(sg, 0);
          const newY = cy;
          const dy = Math.round(newY - oldY);
          setNodePosition(sg, oldX, newY);
          const children = nodeChildren(sg);
          if (dy !== 0 && children.length) {
            for (const cid of children) {
              const child = updatedNodes.find(n => n.id === cid);
              if (!child) continue;
              setNodePosition(child, nodeX(child, innerLeft), nodeY(child, innerTop) + dy);
            }
          }
          cy += Math.max(keepH, 0) + Math.max(8, nodeVGap);
        }
      }
    } catch {}

    // 子域容器防重叠（增强“严格包含且不重叠”约束）
    let finalNodes = resolveSubGroupOverlaps(updatedNodes);
    // 域容器严格包含与防重叠（若存在域容器）
    const hasDomainContainers = finalNodes.some(n => String(n.type || '') === 'titleGroup');
    if (hasDomainContainers) {
      const tgs = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
      const needs = tgs.some(t => !isFinalizedDomain(t));
      if (needs) {
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
        finalNodes = clampNodesToContainers(finalNodes);
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      }
      // 统一域宽（配置驱动）
      try {
        const isElkFirst = isElkLayout(options);
        if (isElkFirst) { /* ELK-first 下不做域宽统一与居中压缩 */ }
        const cfgFull = asRecord(diagramConfigManager.getConfig());
        const unify = asRecord(cfgFull.domain).unifyWidth === true;
        if (unify && !isElkFirst) {
          const tgs = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
          const maxW = tgs.length ? Math.max(...tgs.map(n => nodeWidth(n, 0))) : 0;
          if (Number.isFinite(maxW) && maxW > 0) {
            finalNodes = finalNodes.map(n => {
              if (String(n.type || '') !== 'titleGroup') return n;
              const h = nodeHeight(n, 0);
              return {
                ...n,
                position: { x: nodeX(n), y: nodeY(n) },
                style: { ...n.style, width: maxW, height: h },
                measured: { ...n.measured, width: maxW, height: h }
              };
            });
            finalNodes = resolveDomainContainerOverlaps(finalNodes);
          }
        }
      } catch {}
      // 域顶端锚定（内容上收至标题安全区）
      try {
        const isElkFirst = isElkLayout(options);
        if (isElkFirst) { /* ELK-first 下尽量保留 ELK 输出，不做居中与顶端上收 */ }
        const cfgFull = asRecord(diagramConfigManager.getConfig());
        const domainTitle = asRecord(asRecord(cfgFull.domain).title);
        const titleH = finiteNumber(domainTitle.height, 40);
        const titleV = finiteNumber(asRecord(domainTitle.padding).vertical, 12);
        const domainIds = finalNodes
          .filter(n => String(n.type ?? '') === 'titleGroup' && !isFinalizedDomain(n))
          .map(nodeDomain);
        for (const d of domainIds) {
          const dc = finalNodes.find(n => String(n.type ?? '') === 'titleGroup' && nodeDomain(n) === d);
          if (!dc) continue;
          const y = nodeY(dc);
          const innerTop = y + titleH + titleV;
          const inDomain = finalNodes.filter(n => nodeDomain(n) === d && String(n.type ?? '') !== 'titleGroup');
          let minContentY = Infinity;
          for (const n of inDomain) minContentY = Math.min(minContentY, nodeY(n, Infinity));
          if (Number.isFinite(minContentY) && minContentY > innerTop) {
            const dy = innerTop - minContentY;
            for (let i = 0; i < finalNodes.length; i++) {
              const n = finalNodes[i];
              if (nodeDomain(n) !== d) continue;
              finalNodes[i] = { ...n, position: { x: nodeX(n), y: nodeY(n) + dy } };
            }
          }
        }
        const tgs2 = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
        const needs2 = tgs2.some(t => !isFinalizedDomain(t));
        if (needs2) {
          finalNodes = enforceDomainContainerStrictContainment(finalNodes);
          finalNodes = resolveDomainContainerOverlaps(finalNodes);
          finalNodes = clampNodesToContainers(finalNodes);
          finalNodes = enforceDomainContainerStrictContainment(finalNodes);
          finalNodes = resolveDomainContainerOverlaps(finalNodes);
        }
      } catch {}

      /**
       * 函数级注释：域内内容水平居中（左右留白对称）
       * - 目标：在垂直节点布局下，统一域宽后将该域内容（子域容器与自由节点）在域内部可用宽度中居中。
       * - 行为：计算每个域的内容水平投影 minX/maxX 与可用宽度（去除左右域内边距），将所有成员整体平移到居中位置，并随后进行严格包含与钳制。
      */
      try {
        const isElkFirst = isElkLayout(options);
        if (isElkFirst) { throw new Error('skip-center-elastic-in-elk-first'); }
        const cfgFull = asRecord(diagramConfigManager.getConfig());
        const domainConfig = asRecord(cfgFull.domain);
        const domainPadding = asRecord(domainConfig.padding);
        const domainTitle = asRecord(domainConfig.title);
        const padHDomain = finiteNumber(domainPadding.horizontal, 24);
        const subPadH = finiteNumber(
          asRecord(asRecord(cfgFull.subDomain).padding).horizontal
            ?? asRecord(asRecord(cfgFull.subGroup).padding).horizontal
            ?? asRecord(cfgFull.SUB_GROUP_PADDING).H,
          Math.max(16, Math.floor(padHDomain * 0.8))
        );
        const titleH = finiteNumber(domainTitle.height, 40);
        const titleV = finiteNumber(asRecord(domainTitle.padding).vertical, 12);
        const tgs = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of tgs) {
          const dId = nodeDomain(dc);
          const x = nodeX(dc);
          const y = nodeY(dc);
          const w = nodeWidth(dc, 0);
          const innerLeft = x + padHDomain;
          const innerRight = x + w - padHDomain;
          const innerTop = y + titleH + titleV;
          let minX = Infinity, maxX = -Infinity;
          for (const n of finalNodes) {
            const tp = String(n.type ?? '');
            const belongs = nodeDomain(n) === dId;
            if (!belongs || tp === 'titleGroup') continue;
            if (isHiddenNode(n)) continue;
            const nxRaw = nodeX(n, innerLeft);
            const nw = nodeWidth(n, 0);
            const nx = tp === 'subGroup' ? nxRaw + subPadH : nxRaw;
            const nRight = tp === 'subGroup' ? (nxRaw + nw - subPadH) : (nx + nw);
            minX = Math.min(minX, nx);
            maxX = Math.max(maxX, nRight);
          }
          if (Number.isFinite(minX) && Number.isFinite(maxX)) {
            const contentW = Math.max(0, maxX - minX);
            const availW = Math.max(0, innerRight - innerLeft);
            if (availW > contentW) {
              const targetStart = innerLeft + Math.floor((availW - contentW) / 2);
              const dx = targetStart - minX;
              if (dx !== 0) {
                for (let i = 0; i < finalNodes.length; i++) {
                  const n = finalNodes[i];
                  const belongs = nodeDomain(n) === dId;
                  if (!belongs || String(n.type || '') === 'titleGroup') continue;
                  const nx0 = nodeX(n, innerLeft) + dx;
                  const ny0 = nodeY(n, innerTop);
                  const nw0 = nodeWidth(n, 0);
                  const clampedX0 = Math.min(Math.max(nx0, innerLeft), Math.max(innerLeft, innerRight - nw0));
                  finalNodes[i] = { ...n, position: { x: clampedX0, y: nodeY(n, ny0) } };
                }
              }
            }
          }
        }
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
        finalNodes = clampNodesToContainers(finalNodes);
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      } catch {}

      /**
       * 函数级注释：子域内部内容水平居中（左右留白对称）
       * - 目标：在垂直节点布局中，使每个子域容器内部的普通节点相对其内部可用宽度居中，避免内容贴左造成右侧留白过宽。
       * - 行为：按子域内部左右锚（去除水平内边距）计算 children 的水平投影并整体平移至居中，同时进行左右钳制并在之后执行严格包含与钳制。
      */
      try {
        const isElkFirst = isElkLayout(options);
        if (isElkFirst) { throw new Error('skip-subgroup-left-anchor-unify-in-elk-first'); }
        const cfgFull = asRecord(diagramConfigManager.getConfig());
        const domainPadding = asRecord(asRecord(cfgFull.domain).padding);
        const subDomain = asRecord(cfgFull.subDomain);
        const subDomainPadding = asRecord(subDomain.padding);
        const subDomainTitle = asRecord(subDomain.title);
        const legacySubGroup = asRecord(cfgFull.subGroup);
        const legacySubGroupPadding = asRecord(legacySubGroup.padding);
        const legacySubGroupTitle = asRecord(legacySubGroup.title);
        const rootSubGroupPadding = asRecord(cfgFull.SUB_GROUP_PADDING);
        const domainPadH = finiteNumber(domainPadding.horizontal, 24);
        const subPadH = finiteNumber(
          subDomainPadding.horizontal ?? legacySubGroupPadding.horizontal ?? rootSubGroupPadding.H,
          Math.max(16, Math.floor(domainPadH * 0.8))
        );
        const subTitleH = finiteNumber(subDomainTitle.height ?? legacySubGroupTitle.height, 28);
        const subTitleV = finiteNumber(
          asRecord(subDomainTitle.padding).vertical
            ?? asRecord(legacySubGroupTitle.padding).vertical,
          8
        );
        const subPadTop = finiteNumber(
          subDomainPadding.top
            ?? rootSubGroupPadding.V_TOP
            ?? legacySubGroupPadding.top
            ?? legacySubGroupPadding.vertical,
          Math.max(12, Math.floor(domainPadH * 0.8))
        );
        finalNodes.forEach((sg, _idx) => {
          if (String(sg.type || '') !== 'subGroup') return;
          if (isHiddenNode(sg)) return;
          const sgX = nodeX(sg);
          const sgY = nodeY(sg);
          const sgW = nodeWidth(sg, 0);
          const _sgH = nodeHeight(sg, 0);
          const innerLeftSg = sgX + subPadH;
          const innerRightSg = sgX + sgW - subPadH;
          const innerTopSg = sgY + subTitleH + subTitleV + subPadTop;
          const children = nodeChildren(sg);
          if (!children.length) return;
          let minX = Infinity, maxX = -Infinity;
          for (const cid of children) {
            const child = finalNodes.find(n => n.id === cid);
            if (!child) continue;
            if (GROUP_TYPES.has(String(child.type ?? ''))) continue;
            const nx = nodeX(child, innerLeftSg);
            const nw = nodeWidth(child, 0);
            minX = Math.min(minX, nx);
            maxX = Math.max(maxX, nx + nw);
          }
          if (Number.isFinite(minX) && Number.isFinite(maxX)) {
            const contentW = Math.max(0, maxX - minX);
            const availW = Math.max(0, innerRightSg - innerLeftSg);
            if (availW > contentW) {
              const targetStart = innerLeftSg + Math.floor((availW - contentW) / 2);
              const dx = targetStart - minX;
              if (dx !== 0) {
                for (let i = 0; i < finalNodes.length; i++) {
                  const child = finalNodes[i];
                  if (!children.includes(child.id)) continue;
                  if (GROUP_TYPES.has(String(child.type ?? ''))) continue;
                  const nx0 = nodeX(child, innerLeftSg) + dx;
                  const ny0 = nodeY(child, innerTopSg);
                  const nw0 = nodeWidth(child, 0);
                  const clampedX0 = Math.min(Math.max(nx0, innerLeftSg), Math.max(innerLeftSg, innerRightSg - nw0));
                  finalNodes[i] = { ...child, position: { x: clampedX0, y: nodeY(child, ny0) } };
                }
              }
            }
          }
        });
        finalNodes = clampNodesToContainers(finalNodes);
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      } catch {}

      /**
       * 函数级注释：同域子域容器左锚统一并宽度统一（仅扩展不收缩）
       * - 目标：同一域内的可见子域容器在 X 方向对齐到一致的锚点，避免左缘参差；宽度统一为该域子域的最大宽度。
       * - 行为：计算域内部左右锚与 maxSubW，若可用宽度允许，则将所有子域 position.x 设为“居中左锚 = innerLeft + (availW - maxSubW)/2 - subPadH”，并在 curW < maxSubW 时扩展。
      */
      try {
        const cfgFull = asRecord(diagramConfigManager.getConfig());
        const domainConfig = asRecord(cfgFull.domain);
        const domainPadding = asRecord(domainConfig.padding);
        const domainTitle = asRecord(domainConfig.title);
        const subDomainPadding = asRecord(asRecord(cfgFull.subDomain).padding);
        const legacySubGroupPadding = asRecord(asRecord(cfgFull.subGroup).padding);
        const rootSubGroupPadding = asRecord(cfgFull.SUB_GROUP_PADDING);
        const padH = finiteNumber(domainPadding.horizontal, 24);
        const subPadH = finiteNumber(
          subDomainPadding.horizontal ?? legacySubGroupPadding.horizontal ?? rootSubGroupPadding.H,
          Math.max(16, Math.floor(padH * 0.8))
        );
        const titleH = finiteNumber(domainTitle.height, 40);
        const titleV = finiteNumber(asRecord(domainTitle.padding).vertical, 12);
        const domainsList = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of domainsList) {
          const dId = nodeDomain(dc);
          const x = nodeX(dc);
          const y = nodeY(dc);
          const w = nodeWidth(dc, 0);
          const innerLeft = x + padH;
          const innerRight = x + w - padH;
          const innerTop = y + titleH + titleV;
          const sgs = finalNodes
            .filter(n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === dId && !isHiddenNode(n))
            .sort((a, b) => nodeY(a) - nodeY(b));
          if (!sgs.length) continue;
          const maxSubW = sgs.reduce((m, sg) => Math.max(m, nodeWidth(sg, 0)), 0);
          const availW = Math.max(0, innerRight - innerLeft);
          const anchoredLeft = innerLeft + Math.max(0, Math.floor((availW - Math.max(0, maxSubW)) / 2)) - subPadH;
          for (const sg of sgs) {
            const oldX = nodeX(sg, innerLeft - subPadH);
            const oldY = nodeY(sg, innerTop - subPadH);
            const dx = anchoredLeft - oldX;
            const curW = nodeWidth(sg, 0);
            if (curW < maxSubW) {
              setNodeDimensions(sg, maxSubW, nodeHeight(sg, 0));
            }
            setNodePosition(sg, anchoredLeft, oldY);
            const children = nodeChildren(sg);
            if (dx !== 0 && children.length) {
              for (const cid of children) {
                const child = finalNodes.find(n => n.id === cid);
                if (!child) continue;
                setNodePosition(child, nodeX(child, innerLeft) + dx, nodeY(child, innerTop));
              }
            }
          }
        }
        finalNodes = clampNodesToContainers(finalNodes);
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      } catch {}
    }

    return { nodes: finalNodes, edges };
  }
}

export default VerticalLayoutStrategy;
