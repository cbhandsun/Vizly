import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { ElkNode } from 'elkjs';
import type { StandardNodeData } from '../../models/DiagramModels';
import { diagramConfigManager } from '../../config/DiagramConfig';
import type { LayoutOptions } from '../../types/layout';
import { ILayoutStrategy } from '../LayoutStrategyManager';
import { calculateCenteredLayout, applySubGrouping, assignChildrenToSubGroups, applyDomainGrouping, resolveSubGroupOverlaps, enforceDomainContainerStrictContainment, resolveDomainContainerOverlaps } from '../../utils/layoutUtils';

type LayoutNode = ReactFlowNode<Record<string, unknown>>;
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const nodeDomain = (node: LayoutNode): string => String(node.data.domain ?? '');
const nodeX = (node: LayoutNode, fallback = 0): number => finiteNumber(node.position.x, fallback);
const nodeY = (node: LayoutNode, fallback = 0): number => finiteNumber(node.position.y, fallback);
const nodeWidth = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback);
const nodeHeight = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback);
const nodeChildren = (node: LayoutNode): string[] =>
  Array.isArray(node.data.children)
    ? node.data.children.filter((child): child is string => typeof child === 'string')
    : [];
const setNodeDimensions = (node: LayoutNode, width: number, height: number): void => {
  node.style = { ...node.style, width, height };
  node.measured = { ...node.measured, width, height };
};
const configuredNodeStrategy = (): unknown => {
  const config = asRecord(diagramConfigManager.getConfig());
  return asRecord(asRecord(config.diagram).layout).nodeStrategy
    ?? asRecord(config.layout).nodeStrategy;
};

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
  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
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
  async calculateLayout(nodes: LayoutNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: LayoutNode[]; edges: Edge[] }> {
    // 函数级注释：按选项生成域/子域容器，并计算居中布局坐标
    let nodesWithGroups: LayoutNode[] = nodes;
    if (options?.generateDomainGroups) {
      const domainWhitelist = options.domainWhitelist
        ?? asRecord(options).domainWhiteList as string[] | undefined;
      nodesWithGroups = applyDomainGrouping(nodesWithGroups, domainWhitelist);
    }
    const shouldGenSub = Boolean(options?.generateSubDomainGroups);
    const subWhitelist = options.subDomainWhitelist;
    nodesWithGroups = shouldGenSub
      ? assignChildrenToSubGroups(applySubGrouping(nodesWithGroups as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist)) as ReactFlowNode[]
      : assignChildrenToSubGroups(nodesWithGroups) as ReactFlowNode[];
    const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
    const layoutCandidates: LayoutNode[] = nodesWithGroups.filter(n => !EXCLUDE_TYPES.has(String(n.type ?? '')));

    const nodeLayoutRaw = options.nodeLayout;
    const s = String(nodeLayoutRaw || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
    const useElk = s.includes('elk') || String(configuredNodeStrategy() ?? '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '') === 'elk';
    let positions: { x: number; y: number }[];
    if (useElk) {
      const left = Math.max(40, finiteNumber(options.padding?.left, 40));
      const top = Math.max(40, finiteNumber(options.padding?.top, 40));
      const layoutConfig = asRecord(diagramConfigManager.getLayoutConfig());
      const fullConfig = asRecord(diagramConfigManager.getConfig());
      const nodeConfig = asRecord(fullConfig.node);
      const nodeGap = asRecord(nodeConfig.gap);
      const getW = (n: LayoutNode) => nodeWidth(n, Math.max(120, finiteNumber(layoutConfig.NODE_MIN_WIDTH, 120)));
      const getH = (n: LayoutNode) => nodeHeight(n, finiteNumber(nodeConfig.height, 80));
      const scopedEdges = (edges || []).filter(e => layoutCandidates.some(n => n.id === e.source) && layoutCandidates.some(n => n.id === e.target));
      try {
        const { default: ELK } = await import('elkjs');
        const elk = new ELK();
        const dirRaw = String(options.direction ?? '').toUpperCase();
        const elkDir = dirRaw === 'LR' ? 'RIGHT' : 'DOWN';
        const graph: ElkNode = {
          id: 'elk-cls',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': elkDir,
            'elk.spacing.nodeNode': String(Math.max(40, finiteNumber(nodeGap.horizontal, 80))),
            'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.max(40, finiteNumber(nodeGap.vertical, 56))),
            
          },
          children: layoutCandidates.map(n => ({ id: n.id, width: getW(n), height: getH(n) })),
          edges: scopedEdges.map(e => ({ id: e.id || `${e.source}->${e.target}`, sources: [e.source], targets: [e.target] })),
        };
        const res = await elk.layout(graph);
        const idToPos: Record<string, { x: number; y: number }> = {};
        for (const c of (res.children || [])) idToPos[c.id] = { x: Math.round((c.x || 0) + left), y: Math.round((c.y || 0) + top) };
        positions = layoutCandidates.map(n => idToPos[n.id] || { x: left, y: top });
        
      } catch {
        positions = calculateCenteredLayout(layoutCandidates, options);
      }
    } else {
      positions = calculateCenteredLayout(layoutCandidates, options);
    }
    const updatedNodes = nodesWithGroups.map(n => n);
    layoutCandidates.forEach((n, idx) => {
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

      updatedNodes.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
        const children = nodeChildren(sg);
        const childNodes = children
          .map(id => idMap.get(id))
          .filter((cn): cn is LayoutNode => cn !== undefined)
          .filter(cn => !EXCLUDE_TYPES.has(String(cn.type || '')));
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

    // 子域容器防重叠（增强“严格包含且不重叠”约束）
    let finalNodes = resolveSubGroupOverlaps(updatedNodes);
    // 域容器严格包含与防重叠（若存在域容器）
    const hasDomainContainers = finalNodes.some(n => String(n.type || '') === 'titleGroup');
    if (hasDomainContainers) {
      finalNodes = enforceDomainContainerStrictContainment(finalNodes);
      finalNodes = resolveDomainContainerOverlaps(finalNodes);
      // 统一域宽（配置驱动）
      try {
        const cfgFull = asRecord(diagramConfigManager.getConfig());
        const unify = asRecord(cfgFull.domain).unifyWidth === true;
        if (unify) {
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
        const cfgFull = asRecord(diagramConfigManager.getConfig());
        const domainConfig = asRecord(cfgFull.domain);
        const domainTitle = asRecord(domainConfig.title);
        const _hPad = finiteNumber(asRecord(domainConfig.padding).horizontal, 40);
        const titleH = finiteNumber(domainTitle.height, 40);
        const titleV = finiteNumber(asRecord(domainTitle.padding).vertical, 12);
        const domainIds = finalNodes.filter(n => String(n.type ?? '') === 'titleGroup').map(nodeDomain);
        for (const d of domainIds) {
          const dc = finalNodes.find(n => String(n.type ?? '') === 'titleGroup' && nodeDomain(n) === d);
          if (!dc) continue;
          const _x = nodeX(dc);
          const y = nodeY(dc);
          const _w = nodeWidth(dc, 0);
          const _h = nodeHeight(dc, 0);
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
        finalNodes = enforceDomainContainerStrictContainment(finalNodes);
        finalNodes = resolveDomainContainerOverlaps(finalNodes);
      } catch {}
    }

    return { nodes: finalNodes, edges };
  }
}

export default CenteredLayoutStrategy;
