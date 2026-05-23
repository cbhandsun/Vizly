import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { StandardNodeData } from '../../models/DiagramModels';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import type { LayoutOptions } from '../../types/layout';
import { ILayoutStrategy } from '../LayoutStrategyManager';
import { calculateCenteredLayout, applySubGrouping, assignChildrenToSubGroups, applyDomainGrouping, resolveSubGroupOverlaps, enforceDomainContainerStrictContainment, resolveDomainContainerOverlaps } from '../../utils/layoutUtils';

/**
 * 居中布局策略
 * 函数级注释：
 * - 单节点居中，多节点采用居中网格；
 * - 仅定位普通节点，更新子组容器以严格包含；
 * - 使用 DiagramConfig 的子组内边距与标题安全间隔。
 */
export class CenteredLayoutStrategy implements ILayoutStrategy {
  /** 获取策略名称 */
  getName(): string { return 'CenteredLayout'; }
  /** 函数级注释：策略类别 */
  getCategory(): 'hierarchy' | 'node' { return 'node'; }

  /** 获取策略描述 */
  getDescription(): string { return '单节点居中，多节点居中网格布局'; }

  /** 适用性检查：只要有节点即可 */
  isApplicable(nodes: ReactFlowNode[], edges: Edge[]): boolean {
    return Array.isArray(nodes) && nodes.length > 0;
  }

  /**
   * 计算布局
   * 函数级注释：
   * - 调用通用居中布局函数获取坐标；
   * - 应用坐标到普通节点；
   * - 调整子组容器尺寸与位置以严格包含 children 并保留标题安全区。
   */
  /**
   * 函数级注释：支持 ELK 作为节点布局引擎
   * - 当 options.nodeLayout 映射为 'elk' 时，使用 elkjs layered 对普通节点进行分层排布
   * - 否则沿用通居中布局算法
   */
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
    // 函数级注释：按选项生成域/子域容器，并计算居中布局坐标
    let nodesWithGroups: ReactFlowNode[] = nodes as ReactFlowNode[];
    if (options?.generateDomainGroups) {
      const domainWhitelist = (options as any)?.domainWhitelist || (options as any)?.domainWhiteList;
      nodesWithGroups = applyDomainGrouping(nodesWithGroups, domainWhitelist);
    }
    const shouldGenSub = Boolean(options?.generateSubDomainGroups);
    const subWhitelist = (options as any)?.subDomainWhitelist as string[] | undefined;
    nodesWithGroups = shouldGenSub
      ? assignChildrenToSubGroups(applySubGrouping(nodesWithGroups as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist)) as ReactFlowNode[]
      : assignChildrenToSubGroups(nodesWithGroups) as ReactFlowNode[];
    const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
    const layoutCandidates: ReactFlowNode[] = nodesWithGroups.filter(n => !EXCLUDE_TYPES.has(String(n.type || '')));

    const nodeLayoutRaw: any = (options as any)?.nodeLayout;
    const s = String(nodeLayoutRaw || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
    const useElk = s.includes('elk') || String(((diagramConfigManager.getConfig() as any)?.diagram?.layout?.nodeStrategy || '')).toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '') === 'elk';
    let positions: { x: number; y: number }[];
    const scopedEdges = (edges || []).filter(e => layoutCandidates.some(n => n.id === e.source) && layoutCandidates.some(n => n.id === e.target));
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
        const normHandle = (h: any): 'NORTH'|'SOUTH'|'WEST'|'EAST'|null => {
          const s = String(h || '').toLowerCase();
          if (!s) return null;
          if (s === 't' || s === 'top') return 'NORTH';
          if (s === 'b' || s === 'bottom') return 'SOUTH';
          if (s === 'l' || s === 'left') return 'WEST';
          if (s === 'r' || s === 'right') return 'EAST';
          return null;
        };
        const portSidesNeeded: Record<string, Set<string>> = {};
        for (const e of (scopedEdges || [])) {
          const sh = normHandle((e as any)?.sourceHandle);
          const th = normHandle((e as any)?.targetHandle);
          if (sh) { (portSidesNeeded[e.source] ||= new Set()).add(sh); }
          if (th) { (portSidesNeeded[e.target] ||= new Set()).add(th); }
        }
        const buildPorts = (id: string) => {
          const sides = Array.from(portSidesNeeded[id] || new Set(['NORTH','SOUTH','WEST','EAST']));
          return sides.map((side) => ({ id: `${id}.${side.toLowerCase()}`, properties: { 'elk.port.side': side } }));
        };
        const graph: any = {
          id: 'elk-cls',
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
        positions = calculateCenteredLayout(layoutCandidates as any, options) as any;
      }
    } else {
      positions = calculateCenteredLayout(layoutCandidates as any, options) as any;
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
    // 域容器严格包含与防重叠（若存在域容器）
    const hasDomainContainers = finalNodes.some(n => String(n.type || '') === 'titleGroup');
    if (hasDomainContainers) {
      finalNodes = enforceDomainContainerStrictContainment(finalNodes);
      finalNodes = resolveDomainContainerOverlaps(finalNodes);
      // 统一域宽（配置驱动）
      try {
        const cfgFull: any = diagramConfigManager.getConfig() || {};
        const unify = !!cfgFull?.domain?.unifyWidth;
        if (unify) {
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
        const cfgFull: any = diagramConfigManager.getConfig() || {};
        const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
        const _hPad = num(cfgFull?.domain?.padding?.horizontal, 40);
        const titleH = num(cfgFull?.domain?.title?.height, 40);
        const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
        const domainIds = finalNodes.filter(n => String(n.type || '') === 'titleGroup').map(n => String(((n.data as any)?.domain || '')));
        for (const d of domainIds) {
          const dc = finalNodes.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === d);
          if (!dc) continue;
          const _x = num(((dc as any)?.position?.x), 0);
          const y = num(((dc as any)?.position?.y), 0);
          const _w = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
          const _h = num((((dc as any)?.measured?.height ?? (dc as any)?.style?.height)), 0);
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
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      } catch {}
    }

    return { nodes: finalNodes, edges };
  }
}

export default CenteredLayoutStrategy;
