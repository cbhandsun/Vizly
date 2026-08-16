import type { Node as ReactFlowNode, Edge, XYPosition } from '@xyflow/react'
import type { ElkNode } from 'elkjs'
import type { LayoutOptions } from '../types/layout'
import { diagramConfigManager } from '../config/DiagramConfig'
import { LayeredConfigManager } from '../config/LayeredConfigManager';
import { ILayoutStrategy } from './LayoutStrategyManager'
import {
  ensureMeasuredForNodes,
  recomputeSubGroupContainersBasic,
  finalizeDomainWidthsByProjection,
  finalizeDomainHeightsByProjection,
  resolveDomainContainerOverlaps,
} from '../utils/layoutUtils'
import { logDomainElkContainerUpdateFailure } from './layoutLogging';
import { resolveDomainNodeLayoutAlgorithm } from './domainNodeLayoutEngine';
import {
  DOMAIN_ELK_LAYERED_QUALITY_OPTIONS,
  resolveDomainElkEdgeRouting,
  resolveDomainElkSpacing,
  resolveDomainElkThoroughness,
} from './domainElkLayoutProfile';
import {
  applyDomainElkLayoutRoutes,
  collectDomainElkLayoutRoutes,
} from './domainElkLayoutRoutes';

type LayoutNode = ReactFlowNode<Record<string, unknown>> & {
  positionAbsolute?: XYPosition;
};
const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const nodeSize = (node: LayoutNode, fallbackWidth: number, fallbackHeight: number) => ({
  width: finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallbackWidth),
  height: finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallbackHeight),
});
/**
 * 域级 ELK 整体布局策略
 * 函数级注释：
 * - 仅使用 elkjs 对业务节点进行分层排布；
 * - 不生成、不处理域/子域容器，充分发挥 ELK 的分层优势；
 * - 忽略容器严格包含与堆叠逻辑，只输出业务节点坐标。
 */
export class DomainElkLayoutStrategy implements ILayoutStrategy {
  getName(): string { return 'DomainElkLayout' }
  getCategory(): 'hierarchy' | 'node' { return 'hierarchy' }
  getDescription(): string { return 'ELK整体编排：仅节点分层（不处理域/子域容器）' }
  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean { return Array.isArray(nodes) && nodes.length > 0 }

  /**
   * 计算布局
   * 函数级注释：
   * - 1) 生成域/子域容器并绑定 children；
   * - 2) 使用 ELK 对普通节点定位；旧 Cytoscape 配置映射到 ELK force/radial；
   * - 3) 子域容器尺寸回收 + 子域/自由节点重叠消解；
   * - 4) 若存在域容器：严格包含、统一域宽/高投影、子域居中与钳制；
   * - 5) 域容器间重叠消解，确保“统一域宽/严格包含/不重叠”。
   */
  async calculateLayout(nodes: LayoutNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: LayoutNode[]; edges: Edge[] }> {
    let updatedNodes: LayoutNode[] = ensureMeasuredForNodes(nodes)

    const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain'])
    const layoutCandidates = updatedNodes.filter(n => !EXCLUDE_TYPES.has(String(n.type || '')))
    const candidateIds = new Set(layoutCandidates.map(node => node.id))
    const scopedEdges = edges.filter(edge => candidateIds.has(edge.source) && candidateIds.has(edge.target))
    const left = Math.max(40, finiteNumber(options.padding?.left, 40))
    const top = Math.max(40, finiteNumber(options.padding?.top, 40))
    const layoutConfig = diagramConfigManager.getLayoutConfig()
    const fullConfig = diagramConfigManager.getConfig()
    const layeredConfig = LayeredConfigManager.getInstance()
    const dirRaw = String(options.direction ?? '').toUpperCase()
    const hGapCfg = resolveDomainElkSpacing(
      options.spacing?.horizontal,
      layeredConfig.get<number>('diagram.layout.ELK_NODE_SPACING', layoutConfig.NODE_H_GAP),
    )
    const vGapCfg = resolveDomainElkSpacing(
      options.spacing?.vertical,
      layeredConfig.get<number>('diagram.layout.ELK_LAYER_SPACING', fullConfig.node.gap.vertical),
    )
    const getW = (n: LayoutNode) => nodeSize(n, Math.max(120, layoutConfig.NODE_MIN_WIDTH), fullConfig.node.height).width
    const getH = (n: LayoutNode) => nodeSize(n, Math.max(120, layoutConfig.NODE_MIN_WIDTH), fullConfig.node.height).height

        const { default: ELK } = await import('elkjs')
        const elk = new ELK()
        const elkDirOverride = String(layeredConfig.get<string>('diagram.layout.ELK_DIRECTION', '') || '').toUpperCase()
        const elkDir = elkDirOverride && ['RIGHT', 'DOWN', 'LEFT', 'UP'].includes(elkDirOverride)
          ? elkDirOverride
          : (dirRaw === 'LR' || dirRaw === 'RIGHT' ? 'RIGHT' : dirRaw === 'RL' || dirRaw === 'LEFT' ? 'LEFT' : dirRaw === 'BT' || dirRaw === 'UP' ? 'UP' : 'DOWN')
        const placement = String(layeredConfig.get<string>('diagram.layout.ELK_NODE_PLACEMENT', 'NETWORK_SIMPLEX') || 'NETWORK_SIMPLEX').toUpperCase()
        const mergeEdges = Boolean(layeredConfig.get<boolean>('diagram.layout.ELK_MERGE_EDGES', true))
        const edgeRouting = resolveDomainElkEdgeRouting(
          options.edgeRouting,
          layeredConfig.get<string>('diagram.layout.ELK_EDGE_ROUTING', 'ORTHOGONAL'),
        )
        const layering = String(layeredConfig.get<string>('diagram.layout.ELK_LAYERING', 'NETWORK_SIMPLEX') || 'NETWORK_SIMPLEX').toUpperCase()
        const fixedAlignment = String(layeredConfig.get<string>('diagram.layout.ELK_FIXED_ALIGNMENT', 'NONE') || 'NONE').toUpperCase()
        const cycleBreaking = String(layeredConfig.get<string>('diagram.layout.ELK_CYCLE_BREAKING', 'GREEDY') || 'GREEDY').toUpperCase()
        const portBorderOffset = Number(layeredConfig.get<number>('diagram.layout.ELK_PORT_BORDER_OFFSET', 4) || 4)
        const labelSpacing = Number(layeredConfig.get<number>('diagram.layout.ELK_LABEL_SPACING', 8) || 8)
        const edgeNodeSpacing = Number(layeredConfig.get<number>('diagram.layout.ELK_EDGE_NODE_SPACING', 8) || 8)
        const edgeEdgeSpacing = Number(layeredConfig.get<number>('diagram.layout.ELK_EDGE_EDGE_SPACING', 4) || 4)
        const portPortSpacing = Number(layeredConfig.get<number>('diagram.layout.ELK_PORT_PORT_SPACING', 4) || 4)
        let elkAlgorithm = resolveDomainNodeLayoutAlgorithm(
          options.nodeLayout,
          layeredConfig.get<string>('diagram.layout.ELK_ALGORITHM', 'layered'),
        )

        if (!elkAlgorithm.startsWith('org.')) elkAlgorithm = `org.eclipse.elk.${elkAlgorithm}`
        const graph: ElkNode = {
          id: 'elk-domain-layout',
          layoutOptions: {
            'elk.algorithm': elkAlgorithm,
            'elk.direction': elkDir,
            ...DOMAIN_ELK_LAYERED_QUALITY_OPTIONS,
            'elk.layered.thoroughness': resolveDomainElkThoroughness(layoutCandidates.length),
            'elk.spacing.nodeNode': String(hGapCfg),
            'elk.layered.spacing.nodeNodeBetweenLayers': String(vGapCfg),
            'elk.layered.spacing.edgeNodeBetweenLayers': String(Math.max(24, edgeNodeSpacing)),
            'elk.spacing.edgeNode': String(edgeNodeSpacing),
            'elk.spacing.edgeEdge': String(edgeEdgeSpacing),
            'elk.spacing.portPort': String(portPortSpacing),
            'elk.layered.mergeEdges': String(mergeEdges),
            'elk.layered.nodePlacement.strategy': placement,
            'elk.edgeRouting': edgeRouting,
            'elk.layered.layering.strategy': layering,
            'elk.layered.nodePlacement.bk.fixedAlignment': fixedAlignment,
            'elk.layered.cycleBreaking.strategy': cycleBreaking,
            'elk.port.borderOffset': String(portBorderOffset),
            'elk.spacing.labelLabel': String(labelSpacing),
          },
          children: layoutCandidates.map(n => ({ id: n.id, width: getW(n), height: getH(n) })),
          edges: scopedEdges.map(e => ({ id: e.id || `${e.source}->${e.target}`, sources: [e.source], targets: [e.target] })),
        }
        const res = await elk.layout(graph)
        const routedPaths = collectDomainElkLayoutRoutes(res.edges, { x: left, y: top })
        const idToPos: Record<string, { x: number; y: number }> = {}
        for (const c of (res.children || [])) idToPos[c.id] = { x: Math.round((c.x || 0) + left), y: Math.round((c.y || 0) + top) }
        for (const n of layoutCandidates) {
          const p = idToPos[n.id] || { x: left, y: top }
          n.position = { x: p.x, y: p.y }
        }
    // 纯节点布局模式：不进行域/子域容器约束，但做自由业务节点的重叠消解
    try {
      // ELK only changed business-node coordinates, so the dimensions measured
      // before layout remain valid. Recompute the containing projections once.
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
      updatedNodes = finalizeDomainWidthsByProjection(updatedNodes);
      updatedNodes = finalizeDomainHeightsByProjection(updatedNodes);
      // Container overlap resolution only translates a domain and its members;
      // it does not change their dimensions, so a second projection scan was
      // redundant. ELK itself owns business-node non-overlap and rank spacing.
      updatedNodes = resolveDomainContainerOverlaps(updatedNodes, 40);

    } catch (err) {
      logDomainElkContainerUpdateFailure(err);
    }
    // Domain ELK owns ranking and coordinates only. All production callers
    // render through BaseReactFlow, whose Worker transaction owns the final
    // route, ports, buses and hard-quality gate.
    const routedEdges = applyDomainElkLayoutRoutes(edges, routedPaths)
    return { nodes: updatedNodes, edges: routedEdges }
  }
}

export default DomainElkLayoutStrategy
