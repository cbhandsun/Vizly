import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../../models/DiagramModels';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import type { LayoutOptions } from '../../types/layout';
import { ILayoutStrategy } from '../LayoutStrategyManager';
import { calculateVerticalLayout, applySubGrouping, assignChildrenToSubGroupsBySemantic, applyDomainGrouping, resolveSubGroupOverlaps, enforceDomainContainerStrictContainment, resolveDomainContainerOverlaps, clampNodesToContainers } from '../../utils/layoutUtils';

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
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
    // 函数级注释：按选项生成域/子域容器，并进行垂直堆叠定位
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
    const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
    const layoutCandidates: ReactFlowNode[] = nodesWithGroups.filter(n => !EXCLUDE_TYPES.has(String(n.type || '')));

    /**
     * 垂直布局排序规则（函数级注释）
     * - 目标：在垂直节点布局下遵从域与子域排序；节点按 domain→subDomain→sequence/order→原始索引排序
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
        if (!dKey && !sKey) continue;
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
    const sortedCandidates = layoutCandidates;

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
          id: 'elk-vls',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': elkDir,
            'elk.spacing.nodeNode': Math.max(40, num(((diagramConfigManager.getConfig() as any)?.node?.gap?.horizontal), 80)),
            'elk.layered.spacing.nodeNodeBetweenLayers': Math.max(40, num(((diagramConfigManager.getConfig() as any)?.node?.gap?.vertical), 56)),
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
        positions = calculateVerticalLayout(sortedCandidates as any, options) as any;
      }
    } else {
      positions = calculateVerticalLayout(sortedCandidates as any, options) as any;
    }
    const updatedNodes = nodesWithGroups.map(n => n);
    sortedCandidates.forEach((n, idx) => {
      const pos = positions[idx];
      if (!pos) return;
      n.position = { x: pos.x, y: pos.y } as any;
    });
    

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

    // 子域纵向堆叠：按域/子域排序统一 Y（保持 children 相对偏移）
    try {
      const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      const cfgFull: any = diagramConfigManager.getConfig() || {};
      const padHDomain = numLocal(cfgFull?.domain?.padding?.horizontal, 24);
      const titleH = numLocal(cfgFull?.domain?.title?.height, 40);
      const titleV = numLocal(cfgFull?.domain?.title?.padding?.vertical, 12);
      const nodeVGap = numLocal((diagramConfigManager.getLayoutConfig() as any)?.NODE_V_GAP, 80);
      const domainsList = updatedNodes.filter(n => String(n.type || '') === 'titleGroup');
      for (const dc of domainsList) {
        const dId = String(((dc as any)?.data?.domain || ''));
        const innerLeft = numLocal(((dc as any)?.position?.x), 0) + padHDomain;
        const innerTop = numLocal(((dc as any)?.position?.y), 0) + titleH + titleV;
        const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data)||{})?.hidden);
        const orderKeyOfSg = (sg: ReactFlowNode): number => {
          const dt: any = (sg as any)?.data || {};
          const sKey = String(((dt?.subDomain ?? dt?.description) || '')).trim();
          const exp = getExplicitSubIndex(dId, sKey);
          if (isFinite(exp)) return exp - 200000;
          const children = Array.isArray(dt?.children) ? dt.children as string[] : [];
          let minChild = Number.POSITIVE_INFINITY; for (const cid of children) { const v = originalIndex.get(String(cid)); if (typeof v === 'number') minChild = Math.min(minChild, v); }
          if (isFinite(minChild)) return minChild;
          const self = originalIndex.get(String(sg.id)); return typeof self === 'number' ? self : Number.POSITIVE_INFINITY;
        };
        const sorted = sgs.slice().sort((a, b) => orderKeyOfSg(a) - orderKeyOfSg(b));
        let cy = innerTop;
        for (const sg of sorted) {
          const oldX = numLocal(((sg as any)?.position?.x), innerLeft);
          const oldY = numLocal(((sg as any)?.position?.y), innerTop);
          const keepH = numLocal((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
          const newY = cy;
          const dy = Math.round(newY - oldY);
          (sg as any).position = { x: oldX, y: newY } as any;
          const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
          if (dy !== 0 && children.length) {
            for (const cid of children) {
              const child = updatedNodes.find(n => n.id === cid);
              if (!child) continue;
              const cx = numLocal(((child as any)?.position?.x), innerLeft);
              const cy0 = numLocal(((child as any)?.position?.y), innerTop);
              (child as any).position = { x: cx, y: cy0 + dy } as any;
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
      const needs = tgs.some(t => !(((t as any)?.data)||{})?.finalizedDomain);
      if (needs) {
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
        finalNodes = clampNodesToContainers(finalNodes);
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      }
      // 统一域宽（配置驱动）
      try {
        const isElkFirst = String(((options as any)?.nodeLayout || (diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '')).toLowerCase().replace(/\s+/g,'').replace(/[+_-]/g,'').includes('elk');
        if (isElkFirst) { /* ELK-first 下不做域宽统一与居中压缩 */ }
        const cfgFull: any = diagramConfigManager.getConfig() || {};
        const unify = !!cfgFull?.domain?.unifyWidth;
        if (unify && !isElkFirst) {
          const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
          const tgs = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
          const maxW = tgs.length ? Math.max(...tgs.map(n => num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 0))) : 0;
          if (isFinite(maxW) && maxW > 0) {
            finalNodes = finalNodes.map(n => {
              if (String(n.type || '') !== 'titleGroup') return n;
              const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 0);
              const pos = { x: num((n as any)?.position?.x, 0), y: num((n as any)?.position?.y, 0) } as any;
              const style = { ...(n.style as any), width: maxW, height: h } as any;
              return { ...n, position: pos, style, measured: { width: maxW, height: h } as any } as any;
            });
            finalNodes = resolveDomainContainerOverlaps(finalNodes);
          }
        }
      } catch {}
      // 域顶端锚定（内容上收至标题安全区）
      try {
        const isElkFirst = String(((options as any)?.nodeLayout || (diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '')).toLowerCase().replace(/\s+/g,'').replace(/[+_-]/g,'').includes('elk');
        if (isElkFirst) { /* ELK-first 下尽量保留 ELK 输出，不做居中与顶端上收 */ }
        const cfgFull: any = diagramConfigManager.getConfig() || {};
        const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const titleH = num(cfgFull?.domain?.title?.height, 40);
        const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
        const domainIds = finalNodes.filter(n => String(n.type || '') === 'titleGroup' && !(((n as any)?.data)||{})?.finalizedDomain).map(n => String(((n.data as any)?.domain || '')));
        for (const d of domainIds) {
          const dc = finalNodes.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === d);
          if (!dc) continue;
          const y = num(((dc as any)?.position?.y), 0);
          const innerTop = y + titleH + titleV;
          const inDomain = finalNodes.filter(n => ((n.data as any)?.domain === d) && String(n.type || '') !== 'titleGroup');
          let minContentY = Infinity;
          for (const n of inDomain) minContentY = Math.min(minContentY, num(((n as any)?.position?.y), Infinity));
          if (isFinite(minContentY) && minContentY > innerTop) {
            const dy = innerTop - minContentY;
            for (let i = 0; i < finalNodes.length; i++) {
              const n = finalNodes[i];
              if (((n.data as any)?.domain !== d)) continue;
              const px = num(((n as any)?.position?.x), 0);
              const py = num(((n as any)?.position?.y), 0);
              finalNodes[i] = { ...n, position: { x: px, y: py + dy } as any } as any;
            }
          }
        }
        const tgs2 = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
        const needs2 = tgs2.some(t => !(((t as any)?.data)||{})?.finalizedDomain);
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
        const isElkFirst = String(((options as any)?.nodeLayout || (diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '')).toLowerCase().replace(/\s+/g,'').replace(/[+_-]/g,'').includes('elk');
        if (isElkFirst) { throw new Error('skip-center-elastic-in-elk-first'); }
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const cfgFull: any = diagramConfigManager.getConfig() || {};
        const padHDomain = numLocal(cfgFull?.domain?.padding?.horizontal, 24);
        const subPadH = numLocal((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? cfgFull?.SUB_GROUP_PADDING?.H), Math.max(16, Math.floor(padHDomain * 0.8)));
        const titleH = numLocal(cfgFull?.domain?.title?.height, 40);
        const titleV = numLocal(cfgFull?.domain?.title?.padding?.vertical, 12);
        const tgs = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of tgs) {
          const dId = String(((dc as any)?.data?.domain || ''));
          const x = numLocal(((dc as any)?.position?.x), 0);
          const y = numLocal(((dc as any)?.position?.y), 0);
          const w = numLocal((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const innerLeft = x + padHDomain;
          const innerRight = x + w - padHDomain;
          const innerTop = y + titleH + titleV;
          let minX = Infinity, maxX = -Infinity;
          for (const n of finalNodes) {
            const tp = String(n.type || '');
            const belongs = String(((n.data as any)?.domain || '')) === dId;
            if (!belongs || tp === 'titleGroup') continue;
            const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
            if (hidden) continue;
            const nxRaw = numLocal(((n as any)?.position?.x), innerLeft);
            const nw = numLocal((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
            const nx = tp === 'subGroup' ? nxRaw + subPadH : nxRaw;
            const nRight = tp === 'subGroup' ? (nxRaw + nw - subPadH) : (nx + nw);
            minX = Math.min(minX, nx);
            maxX = Math.max(maxX, nRight);
          }
          if (isFinite(minX) && isFinite(maxX)) {
            const contentW = Math.max(0, maxX - minX);
            const availW = Math.max(0, innerRight - innerLeft);
            if (availW > contentW) {
              const targetStart = innerLeft + Math.floor((availW - contentW) / 2);
              const dx = targetStart - minX;
              if (dx !== 0) {
                for (let i = 0; i < finalNodes.length; i++) {
                  const n = finalNodes[i];
                  const belongs = String(((n.data as any)?.domain || '')) === dId;
                  if (!belongs || String(n.type || '') === 'titleGroup') continue;
                  const nx0 = numLocal(((n as any)?.position?.x), innerLeft) + dx;
                  const ny0 = numLocal(((n as any)?.position?.y), innerTop);
                  const nw0 = numLocal((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
                  const clampedX0 = Math.min(Math.max(nx0, innerLeft), Math.max(innerLeft, innerRight - nw0));
                  finalNodes[i] = { ...n, position: { x: clampedX0, y: numLocal(((n as any)?.position?.y), ny0) } as any } as any;
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
        const isElkFirst = String(((options as any)?.nodeLayout || (diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '')).toLowerCase().replace(/\s+/g,'').replace(/[+_-]/g,'').includes('elk');
        if (isElkFirst) { throw new Error('skip-subgroup-left-anchor-unify-in-elk-first'); }
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const cfgFull: any = diagramConfigManager.getConfig() || {};
        const subPadH = numLocal((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? cfgFull?.SUB_GROUP_PADDING?.H), Math.max(16, Math.floor(numLocal(cfgFull?.domain?.padding?.horizontal, 24) * 0.8)));
        const subTitleH = numLocal((cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height), 28);
        const subTitleV = numLocal((cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical), 8);
        const subPadTop = numLocal((cfgFull?.subDomain?.padding?.top ?? cfgFull?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subGroup?.padding?.top ?? cfgFull?.subGroup?.padding?.vertical), Math.max(12, Math.floor(numLocal(cfgFull?.domain?.padding?.horizontal, 24) * 0.8)));
        finalNodes.forEach((sg, _idx) => {
          if (String(sg.type || '') !== 'subGroup') return;
          const hidden = !!((((sg as any)?.data) || {}) as any)?.hidden;
          if (hidden) return;
          const sgX = numLocal(((sg as any)?.position?.x), 0);
          const sgY = numLocal(((sg as any)?.position?.y), 0);
          const sgW = numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
          const _sgH = numLocal((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
          const innerLeftSg = sgX + subPadH;
          const innerRightSg = sgX + sgW - subPadH;
          const innerTopSg = sgY + subTitleH + subTitleV + subPadTop;
          const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
          if (!children.length) return;
          let minX = Infinity, maxX = -Infinity;
          for (const cid of children) {
            const child = finalNodes.find(n => n.id === cid);
            if (!child) continue;
            const tp = String(child.type || '');
            if (tp === 'titleGroup' || tp === 'subGroup' || tp === 'group' || tp === 'domain') continue;
            const nx = numLocal(((child as any)?.position?.x), innerLeftSg);
            const nw = numLocal((((child as any)?.measured?.width ?? (child as any)?.style?.width)), 0);
            minX = Math.min(minX, nx);
            maxX = Math.max(maxX, nx + nw);
          }
          if (isFinite(minX) && isFinite(maxX)) {
            const contentW = Math.max(0, maxX - minX);
            const availW = Math.max(0, innerRightSg - innerLeftSg);
            if (availW > contentW) {
              const targetStart = innerLeftSg + Math.floor((availW - contentW) / 2);
              const dx = targetStart - minX;
              if (dx !== 0) {
                for (let i = 0; i < finalNodes.length; i++) {
                  const child = finalNodes[i];
                  if (!children.includes(child.id)) continue;
                  const tp = String(child.type || '');
                  if (tp === 'titleGroup' || tp === 'subGroup' || tp === 'group' || tp === 'domain') continue;
                  const nx0 = numLocal(((child as any)?.position?.x), innerLeftSg) + dx;
                  const ny0 = numLocal(((child as any)?.position?.y), innerTopSg);
                  const nw0 = numLocal((((child as any)?.measured?.width ?? (child as any)?.style?.width)), 0);
                  const clampedX0 = Math.min(Math.max(nx0, innerLeftSg), Math.max(innerLeftSg, innerRightSg - nw0));
                  finalNodes[i] = { ...child, position: { x: clampedX0, y: numLocal(((child as any)?.position?.y), ny0) } as any } as any;
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
        const numLocal = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const cfgFull: any = diagramConfigManager.getConfig() || {};
        const padH = numLocal(cfgFull?.domain?.padding?.horizontal, 24);
        const subPadH = numLocal((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? cfgFull?.SUB_GROUP_PADDING?.H), Math.max(16, Math.floor(padH * 0.8)));
        const titleH = numLocal(cfgFull?.domain?.title?.height, 40);
        const titleV = numLocal(cfgFull?.domain?.title?.padding?.vertical, 12);
        const domainsList = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
        for (const dc of domainsList) {
          const dId = String(((dc as any)?.data?.domain || ''));
          const x = numLocal(((dc as any)?.position?.x), 0);
          const y = numLocal(((dc as any)?.position?.y), 0);
          const w = numLocal((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const innerLeft = x + padH;
          const innerRight = x + w - padH;
          const innerTop = y + titleH + titleV;
          const sgs = finalNodes
            .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data)||{})?.hidden)
            .sort((a, b) => numLocal(((a as any)?.position?.y), 0) - numLocal(((b as any)?.position?.y), 0));
          if (!sgs.length) continue;
          const maxSubW = sgs.reduce((m, sg) => Math.max(m, numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0)), 0);
          const availW = Math.max(0, innerRight - innerLeft);
          const anchoredLeft = innerLeft + Math.max(0, Math.floor((availW - Math.max(0, maxSubW)) / 2)) - subPadH;
          for (const sg of sgs) {
            const oldX = numLocal(((sg as any)?.position?.x), innerLeft - subPadH);
            const oldY = numLocal(((sg as any)?.position?.y), innerTop - subPadH);
            const dx = anchoredLeft - oldX;
            const curW = numLocal((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
            if (curW < maxSubW) {
              ((sg as any).style || ((sg as any).style = {})).width = maxSubW;
              (sg as any).measured = { width: maxSubW, height: numLocal((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0) } as any;
            }
            (sg as any).position = { x: anchoredLeft, y: oldY } as any;
            const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
            if (dx !== 0 && children.length) {
              for (const cid of children) {
                const child = finalNodes.find(n => n.id === cid);
                if (!child) continue;
                const cx = numLocal(((child as any)?.position?.x), innerLeft) + dx;
                const cy = numLocal(((child as any)?.position?.y), innerTop);
                (child as any).position = { x: cx, y: cy } as any;
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
