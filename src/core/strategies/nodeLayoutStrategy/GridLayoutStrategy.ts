import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../../models/DiagramModels';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import type { LayoutOptions } from '../../types/layout';
import { ILayoutStrategy } from '../LayoutStrategyManager';
import { calculateGridLayout, applySubGrouping, assignChildrenToSubGroupsBySemantic, applyDomainGrouping, resolveSubGroupOverlaps, enforceDomainContainerStrictContainment, resolveDomainContainerOverlaps } from '../../utils/layoutUtils';

/**
 * 网格布局策略
 * 函数级注释：
 * - 按列数均匀划分网格，逐行逐列排布节点；
 * - 自动考虑 `options.columns` 和间距/内边距，支持自适应列数默认值；
 * - 布局后更新子组容器的包围盒，确保严格包含与标题留白。
 */
export class GridLayoutStrategy implements ILayoutStrategy {
  /** 获取策略名称 */
  getName(): string { return 'GridLayout'; }
  /** 函数级注释：策略类别 */
  getCategory(): 'hierarchy' | 'node' { return 'node'; }

  /** 获取策略描述 */
  getDescription(): string { return '规则网格排列，按列数均匀分布节点'; }

  /** 适用性检查：只要存在节点即可使用 */
  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
    return Array.isArray(nodes) && nodes.length > 0;
  }

  /**
   * 计算布局
   * 函数级注释：
   * - 只对普通节点执行网格定位，保留分组/域容器；
   * - 依据通用配置更新子组的位置与尺寸，避免覆盖标题区域。
   */
  /**
   * 函数级注释：支持 ELK 作为节点布局引擎
   * - 当 options.nodeLayout 映射为 'elk' 时，使用 elkjs layered 对普通节点进行分层排布
   * - 否则沿用通用网格布局算法
   */
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
    // 函数级注释：依据选项控制域/子域容器生成，并进行网格定位
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
          id: 'elk-gls',
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
        
      } catch {
        positions = calculateGridLayout(layoutCandidates as any, options) as any;
      }
    } else {
      // 函数级注释：网格布局的实际尺寸对齐
      // - 背景：默认 calculateGridLayout 使用固定 itemSize，若节点实际 measured/width 高于默认值，会造成网格列内重叠
      // - 行为：以候选节点的最大宽/高作为网格单元尺寸，并从配置提取水平/垂直间距，避免重叠
      const cfg: any = (() => { try { return diagramConfigManager.getConfig(); } catch { return {}; } })();
      const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), Math.max(120, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120));
      const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), (cfg?.node?.height ?? 80));
      const maxW = layoutCandidates.length ? Math.max(...layoutCandidates.map(getW)) : Math.max(120, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120);
      const maxH = layoutCandidates.length ? Math.max(...layoutCandidates.map(getH)) : (cfg?.node?.height ?? 80);
      const H_GAP = num((cfg?.node?.gap?.horizontal), 80);
      const V_GAP = num((cfg?.node?.gap?.vertical), 56);
      const pad = {
        top: num(((options as any)?.padding?.top), 50),
        right: num(((options as any)?.padding?.right), 50),
        bottom: num(((options as any)?.padding?.bottom), 50),
        left: num(((options as any)?.padding?.left), 50),
      };
      const calcOpts = {
        ...options,
        itemSize: { width: maxW, height: maxH },
        spacing: { horizontal: H_GAP, vertical: V_GAP },
        padding: pad,
        columns: (options as any)?.columns ?? Math.ceil(Math.sqrt(layoutCandidates.length)),
      } as any;
      positions = calculateGridLayout(layoutCandidates as any, calcOpts) as any;
    }
    const updatedNodes = nodesWithGroups.map(n => n);
    layoutCandidates.forEach((n, idx) => {
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

    // 子域容器防重叠（增强“严格包含且不重叠”约束）
    let finalNodes = resolveSubGroupOverlaps(updatedNodes);
    // 域容器严格包含与防重叠（若存在域容器），当管线所有权为 node 或域尚未最终化时才执行
    const hasDomainContainers = (finalNodes as ReactFlowNode[]).some((n: ReactFlowNode) => String(n.type || '') === 'titleGroup');
    if (hasDomainContainers) {
      const cfgFull: any = diagramConfigManager.getConfig() || {};
      const policy = String(cfgFull?.layout?.domainProcessingOwner || 'hierarchy').toLowerCase();
      const tgs = finalNodes.filter(n => String(n.type || '') === 'titleGroup');
      const needs = tgs.some(t => !(((t as any)?.data)||{})?.finalizedDomain);
      if (policy !== 'hierarchy' || needs) {
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      }
    }

    return { nodes: finalNodes, edges };
  }
}

export default GridLayoutStrategy;
