import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../../models/DiagramModels';
import { diagramConfigManager } from '../../config/DiagramConfig';
import type { LayoutOptions } from '../../types/layout';
import { ILayoutStrategy } from '../LayoutStrategyManager';
import { calculateHorizontalLayout, applySubGrouping, assignChildrenToSubGroupsBySemantic, applyDomainGrouping, resolveSubGroupOverlaps, enforceDomainContainerStrictContainment, resolveDomainContainerOverlaps, scatterNodesAtSamePoint, resolveSubGroupChildrenOverlapsStrict, recomputeSubGroupContainersBasic, resolveFreeNodeOverlapsInDomain, finalizeDomainWidthsByProjection, finalizeDomainHeightsByProjection, clampNodesToContainers, centerSubGroupsInDomain, ensureMeasuredForNodes } from '../../utils/layoutUtils';

/**
 * 水平排列布局策略
 * 函数级注释：
 * - 按水平轴均匀排列节点，支持居中/右对齐等 Alignment；
 * - 只定位普通节点，分组容器在布局后进行严格包含调整；
 * - 使用全局 DiagramConfig 的子组内边距与标题安全值。
 */
export class HorizontalLayoutStrategy implements ILayoutStrategy {
  /** 获取策略名称 */
  getName(): string { return 'HorizontalLayout'; }
  /** 函数级注释：策略类别 */
  getCategory(): 'hierarchy' | 'node' { return 'node'; }

  /** 获取策略描述 */
  getDescription(): string { return '沿水平轴等间距排列（支持居中/右对齐）'; }

  /** 适用性检查：只要有节点即可 */
  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
    return Array.isArray(nodes) && nodes.length > 0;
  }

  /**
   * 计算布局
   * 函数级注释：
   * - 调用通用水平布局计算坐标；
   * - 应用坐标到普通节点；
   * - 调整子组容器尺寸与位置以严格包含 children。
   */
  /**
   * 函数级注释：支持 ELK 作为节点布局引擎
   * - 当 options.nodeLayout 映射为 'elk' 时，使用 elkjs layered 对普通节点进行分层排布
   * - 否则沿用通用水平布局算法
   */
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
    // 函数级注释：依据选项生成域/子域容器，并布局普通节点于水平轴
    let nodesWithGroups: ReactFlowNode[] = nodes as ReactFlowNode[];
    if (options?.generateDomainGroups) {
      const domainWhitelist = (options as any)?.domainWhitelist || (options as any)?.domainWhiteList;
      nodesWithGroups = applyDomainGrouping(nodesWithGroups, domainWhitelist);
    }
    const shouldGenSub = Boolean(options?.generateSubDomainGroups);
    const subWhitelist = (options as any)?.subDomainWhitelist as string[] | undefined;
    nodesWithGroups = shouldGenSub
      ? assignChildrenToSubGroupsBySemantic(applySubGrouping(nodesWithGroups as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist)) as ReactFlowNode[]
      : assignChildrenToSubGroupsBySemantic(nodesWithGroups) as ReactFlowNode[];
    nodesWithGroups = ensureMeasuredForNodes(nodesWithGroups);
    const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
    const layoutCandidates: ReactFlowNode[] = nodesWithGroups.filter(n => !EXCLUDE_TYPES.has(String(n.type || '')));

    /**
     * 水平布局排序规则（函数级注释）
     * - 目标：在水平节点布局下遵从域与子域排序；节点按 domain→subDomain→sequence/order→原始索引排序
     * - 来源：options.domainOrder / options.subDomainOrder；未显式提供则按首次出现顺序
     */
    const originalIndex = new Map<string, number>(nodesWithGroups.map((n, i) => [String(n.id), i] as const));
    const domainOrderArr: string[] | undefined = (options as any)?.domainOrder as any;
    const domainsByScan = (() => {
      const set = new Set<string>(); const out: string[] = [];
      for (const n of nodesWithGroups) {
        const d = String((((n as any)?.data || {}) as any)?.domain || '').trim();
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
        const dt: any = (n as any)?.data || {};
        const dKey = String((dt?.domain || '')).trim();
        const sKey = String(((dt?.subDomain ?? dt?.description) || '')).trim();
        if (!dKey && !sKey) continue; // Skip totally empty
        const compound = dKey + '::' + sKey;
        if (!seen.has(compound)) {
          seen.add(compound);
          implicitSubIndices.set(compound, counter++);
        }
      }
    }

    const subOrderOptRaw: any = (options as any)?.subDomainOrder;
    const getExplicitSubIndex = (domainKey: string, subKey: string): number => {
      const dTrim = String(domainKey || '').trim(); 
      const sTrim = String(subKey || '').trim();

      const findInArr = (list: any[]): number => {
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
        let arr = subOrderOptRaw[dTrim] || subOrderOptRaw[String(dTrim)];
        
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
        if ((dTrim.includes('作业域') || dTrim.includes('Job')) && (import.meta as any)?.env?.DEV) {
           const _idx = Array.isArray(arr) ? findInArr(arr) : 'N/A';
        }

        if (Array.isArray(arr)) { 
          const idx = findInArr(arr); 
          return idx >= 0 ? idx : Number.POSITIVE_INFINITY; 
        }
      }
      return Number.POSITIVE_INFINITY;
    };

    const orderKeyOfNode = (n: ReactFlowNode): number => {
      const dt: any = (n as any)?.data || {};
      const dKey = String((dt?.domain || '')).trim();
      const sKeyRaw = String(((dt?.subDomain ?? dt?.description) || '')).trim();
      
      const dIdx = domainOrderIndex.get(dKey);
      const dOrder = typeof dIdx === 'number' ? dIdx : Number.POSITIVE_INFINITY;
      
      let sIdx = getExplicitSubIndex(dKey, sKeyRaw);
      if (!isFinite(sIdx)) {
         // Fallback: use discovery order (offset by 10000 to be after explicit)
         const compound = dKey + '::' + sKeyRaw;
         const implicit = implicitSubIndices.get(compound);
         sIdx = (typeof implicit === 'number') ? (10000 + implicit) : 99999;
      }
      
      const seqRaw = dt?.sequence ?? dt?.order;
      const seq = typeof seqRaw === 'number' ? seqRaw : parseFloat(seqRaw);
      const seqOrder = isFinite(seq) ? seq : Number.POSITIVE_INFINITY;
      
      const orig = originalIndex.get(String(n.id));
      const origOrder = typeof orig === 'number' ? orig : Number.POSITIVE_INFINITY;
      
      // 组合键：域(优先)→子域→节点序→原始索引
      // 权重分配：Domain(1e9) > SubDomain(1e6) > Sequence(1e3) > Original(1)
      return (dOrder * 1e9) + (sIdx * 1e6) + (seqOrder * 1e3) + origOrder;
    };

    // 应用排序：直接修改 layoutCandidates 顺序
    layoutCandidates.sort((a, b) => orderKeyOfNode(a) - orderKeyOfNode(b));

    const nodeLayoutRaw: any = (options as any)?.nodeLayout;
    const s = String(nodeLayoutRaw || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
    const useElk = s.includes('elk') || String(((diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '')).toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '') === 'elk';
    let positions: { x: number; y: number }[];
    if (useElk) {
      const left = Math.max(40, Number(((options as any)?.padding?.left)) || 40);
      const top = Math.max(40, Number(((options as any)?.padding?.top)) || 40);
      const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), Math.max(120, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120));
      const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), (diagramConfigManager.getConfig() as any)?.node?.height || 80);
      const scopedEdges = (edges || []).filter(e => layoutCandidates.some(n => n.id === e.source) && layoutCandidates.some(n => n.id === e.target));
      try {
        const { default: ELK } = await import('elkjs');
        const elk = new ELK();
        const dirRaw = String(((options as any)?.direction || '')).toUpperCase();
        const elkDir = dirRaw === 'LR' ? 'RIGHT' : 'DOWN';
        const graph: any = {
          id: 'elk-hls',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': elkDir,
            'elk.spacing.nodeNode': Math.max(40, num(((diagramConfigManager.getConfig() as any)?.node?.gap?.horizontal), 80)),
            'elk.layered.spacing.nodeNodeBetweenLayers': Math.max(40, num(((diagramConfigManager.getConfig() as any)?.node?.gap?.vertical), 56)),
            
          },
          children: layoutCandidates.map(n => ({ id: n.id, width: getW(n), height: getH(n) })),
          edges: scopedEdges.map(e => ({ id: e.id || `${e.source}->${e.target}`, sources: [e.source], targets: [e.target] })),
        };
        const res = await elk.layout(graph);
        const idToPos: Record<string, { x: number; y: number }> = {};
        for (const c of (res.children || [])) idToPos[c.id] = { x: Math.round((c.x || 0) + left), y: Math.round((c.y || 0) + top) };
        positions = layoutCandidates.map(n => idToPos[n.id] || { x: left, y: top });
        
        // 统一散列：沿方向轴展开同点
        const axis = elkDir === 'RIGHT' ? 'y' : 'x';
        const hGap = Math.max(12, num(((diagramConfigManager.getLayoutConfig() as any)?.NODE_H_GAP), 120));
        const vGap = Math.max(12, num(((diagramConfigManager.getConfig() as any)?.node?.gap?.vertical), 56));
        for (let i = 0; i < layoutCandidates.length; i++) {
          const n = layoutCandidates[i] as any;
          const p = positions[i];
          n.position = { x: p.x, y: p.y } as any;
        }
        scatterNodesAtSamePoint(layoutCandidates, axis as any, axis === 'x' ? hGap : vGap, 2);
        positions = layoutCandidates.map(n => ({ x: (n as any)?.position?.x || left, y: (n as any)?.position?.y || top }));
      } catch {
        positions = calculateHorizontalLayout(layoutCandidates as any, options) as any;
      }
    } else {
      positions = calculateHorizontalLayout(layoutCandidates as any, options) as any;
    }
    let updatedNodes = nodesWithGroups.map(n => n);
    layoutCandidates.forEach((n, idx) => {
      const pos = positions[idx];
      if (!pos) return;
      n.position = { x: pos.x, y: pos.y } as any;
    });
    /** 函数级注释：按域内真实尺寸进行横向避让
     * - 背景：通用水平布局使用固定 `itemSize.width` 计算等距坐标，若节点实际 `measured.width` 更大，会出现重叠；
     * - 处理：在各域内按 x 升序扫描，将当前节点的 x 推到“前一个右侧 + 最小水平间距”位置；仅平移 x，不改变 y。
     */
    try {
      const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      const layoutCfg: any = diagramConfigManager.getLayoutConfig() || {};
      const minHGap = Math.max(12, num(layoutCfg?.NODE_H_GAP, 120));
      const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), Math.max(120, layoutCfg?.NODE_MIN_WIDTH || 120));
      const getX = (n: ReactFlowNode) => num(((n as any)?.position?.x), 0);
      const getY = (n: ReactFlowNode) => num(((n as any)?.position?.y), 0);
      const domains = Array.from(new Set(updatedNodes.map(n => String(((n as any)?.data?.domain || '')).trim()))).filter(Boolean);
      const applyForList = (list: ReactFlowNode[]) => {
        const byX = list.slice().sort((a, b) => getX(a) - getX(b));
        let prevRight = -Infinity;
        for (const m of byX) {
          const x = getX(m);
          const y = getY(m);
          const w = getW(m);
          const target = isFinite(prevRight) ? Math.max(x, Math.round(prevRight + minHGap)) : x;
          (m as any).position = { x: target, y } as any;
          prevRight = target + w;
        }
      };
      for (const d of domains) {
        const list = updatedNodes.filter(n => !new Set(['subGroup','titleGroup','group','domain']).has(String(n.type || '')) && String((((n as any)?.data || {}) as any)?.domain || '').trim() === d);
        if (list.length > 1) applyForList(list);
      }
      const withoutDomain = updatedNodes.filter(n => !new Set(['subGroup','titleGroup','group','domain']).has(String(n.type || '')) && !String((((n as any)?.data || {}) as any)?.domain || '').trim());
      if (withoutDomain.length > 1) applyForList(withoutDomain);
    } catch {}
    

    try {
      const layoutCfg = diagramConfigManager.getLayoutConfig();
      const padH = layoutCfg.SUB_GROUP_PADDING?.H ?? 30;
      const rawTop = layoutCfg.SUB_GROUP_PADDING?.V_TOP ?? 20;
      const padTop = layoutCfg.ENSURE_SUB_GROUP_TITLE_CLEARANCE
        ? Math.max(rawTop, layoutCfg.SUB_GROUP_TITLE_CLEARANCE || rawTop)
        : rawTop;
      const padBottom = layoutCfg.SUB_GROUP_PADDING?.V_BOTTOM ?? 20;

      const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
      const getW = (n: ReactFlowNode): number => (n as any)?.measured?.width ?? (n.style as any)?.width ?? 240;
      const getH = (n: ReactFlowNode): number => (n as any)?.measured?.height ?? (n.style as any)?.height ?? 120;

      updatedNodes.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
        const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
        const childNodes = children
          .map(id => idMap.get(id))
          .filter((cn): cn is ReactFlowNode => !!cn)
          .filter(cn => !EXCLUDE_TYPES.has(String(cn.type || '')));
        if (childNodes.length === 0) return;

        const minX = Math.min(...childNodes.map(c => (c.position as any).x));
        const minY = Math.min(...childNodes.map(c => (c.position as any).y));
        const maxX = Math.max(...childNodes.map(c => (c.position as any).x + getW(c)));
        const maxY = Math.max(...childNodes.map(c => (c.position as any).y + getH(c)));

        const newPos = { x: minX - padH, y: minY - padTop };
        const newW = (maxX - minX) + padH * 2;
        const newH = (maxY - minY) + padTop + padBottom;

        sg.position = newPos as any;
        (sg.style as any).width = newW;
        (sg.style as any).height = newH;
        (sg as any).measured = { width: newW, height: newH };
        sg.zIndex = typeof sg.zIndex === 'number' ? sg.zIndex : -5;
      });
    } catch {}

    // 子域 children 防重叠与容器尺寸回收
    {
      const cfgLayout: any = diagramConfigManager.getLayoutConfig() || {};
      const hGapEff = Math.max(12, (cfgLayout?.NODE_H_GAP ?? 120));
      const vGapEff = Math.max(8, (cfgLayout?.NODE_V_GAP ?? 80));
      const afterChildren = resolveSubGroupChildrenOverlapsStrict(updatedNodes as any, hGapEff, vGapEff) as any;
      const afterRecompute = recomputeSubGroupContainersBasic(afterChildren as any) as any;
      updatedNodes = afterRecompute as ReactFlowNode[];
    }
    // 域内自由节点重叠消解
    updatedNodes = resolveFreeNodeOverlapsInDomain(updatedNodes as any) as any;
    // 子域容器防重叠（增强“严格包含且不重叠”约束）
    let finalNodes = resolveSubGroupOverlaps(updatedNodes);
    // 域容器严格包含与防重叠（若存在域容器），当管线所有权为 node 或域尚未最终化时才执行
    const hasDomainContainers = finalNodes.some(n => String(n.type || '') === 'titleGroup');
    if (hasDomainContainers) {
      const cfgFull: any = diagramConfigManager.getConfig() || {};
      const policy = String(cfgFull?.layout?.domainProcessingOwner || 'hierarchy').toLowerCase();
      const tgs = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
      const needs = tgs.some(t => !(((t as any)?.data)||{})?.finalizedDomain);
      if (policy !== 'hierarchy' || needs) {
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = finalizeDomainWidthsByProjection(finalNodes);
        finalNodes = centerSubGroupsInDomain(finalNodes);
        finalNodes = finalizeDomainHeightsByProjection(finalNodes);
        finalNodes = clampNodesToContainers(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      }
    }

    return { nodes: finalNodes, edges };
  }
}

export default HorizontalLayoutStrategy;
