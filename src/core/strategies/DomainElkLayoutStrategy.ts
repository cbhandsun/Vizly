import type { Node as ReactFlowNode, Edge } from '@xyflow/react'
import type { LayoutOptions } from '../types/layout'
import { diagramConfigManager } from '../components/config/DiagramConfig'
import { LayeredConfigManager } from '../config/LayeredConfigManager';
import { ILayoutStrategy } from './LayoutStrategyManager'
import {
  _applyDomainGrouping,
  _applySubGrouping,
  _assignChildrenToSubGroupsBySemantic,
  _normalizeMissingNodeSubDomainByDomain,
  _normalizeSubGroupDomainByChildren,
  ensureMeasuredForNodes,
  _resolveSubGroupChildrenOverlapsStrict,
  recomputeSubGroupContainersBasic,
  _enforceSubGroupTitleClearance,
  _resolveFreeNodeOverlapsInDomain,
  _resolveSubGroupOverlaps,
  _enforceDomainContainerStrictContainment,
  finalizeDomainWidthsByProjection,
  finalizeDomainHeightsByProjection,
  _clampNodesToContainers,
  resolveDomainContainerOverlaps,
  _centerSubGroupsInDomain,

  scatterNodesAtSamePoint,
  resolveAllNodeOverlapsGlobal,
} from '../utils/layoutUtils'
import { decideEdgeRouting, separateParallelEdges, globalOptimizeEdgeRouting, distributePortConnections, bundleEdges, layerBasedEdgeRouting, optimizeEdgeLabelPositions, beautifyOrthogonalEdges, optimizeTreeBusRouting } from '../utils/HandlePicker'
import { expandHandle } from '../routing/utils/handleUtils'

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
   * - 2) 使用 Cytoscape 或 ELK 对普通节点分层定位；
   * - 3) 子域容器尺寸回收 + 子域/自由节点重叠消解；
   * - 4) 若存在域容器：严格包含、统一域宽/高投影、子域居中与钳制；
   * - 5) 域容器间重叠消解，确保“统一域宽/严格包含/不重叠”。
   */
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
    const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb
    let updatedNodes: ReactFlowNode[] = ensureMeasuredForNodes(nodes as ReactFlowNode[])

    const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain'])
    const originalIndex = new Map<string, number>(updatedNodes.map((n, i) => [String(n.id), i] as const))
    const domainOf = (x: ReactFlowNode): string => {
      const dt: any = ((x as any)?.data) || {}
      return String(dt?.domain || '').trim()
    }
    const subOf = (x: ReactFlowNode): string => {
      const dt: any = ((x as any)?.data) || {}
      const s1 = String(((dt?.subDomain ?? dt?.subdomain) ?? dt?.metadata?.subDomain) || '')
      return s1.trim()
    }
    const domainOrderArr: string[] | undefined = (options as any)?.domainOrder as any
    const domainOrderIndex = new Map<string, number>((Array.isArray(domainOrderArr) && domainOrderArr.length
      ? domainOrderArr
      : updatedNodes.map(n => domainOf(n)).filter(Boolean)).map((d, i) => [String(d).trim(), i] as const))
    const subOrderOpt: any = (options as any)?.subDomainOrder
    const explicitSubIdx = (dk: string, sk: string): number => {
      const dTrim = String(dk || '').trim()
      const sTrim = String(sk || '').trim()
      if (Array.isArray(subOrderOpt)) {
        const idx = subOrderOpt.indexOf(sTrim)
        return idx >= 0 ? idx : Number.POSITIVE_INFINITY
      }
      if (subOrderOpt && typeof subOrderOpt === 'object') {
        const arr = subOrderOpt[dTrim] || subOrderOpt[String(dTrim)] || []
        if (Array.isArray(arr)) {
          const idx = arr.indexOf(sTrim)
          return idx >= 0 ? idx : Number.POSITIVE_INFINITY
        }
      }
      return Number.POSITIVE_INFINITY
    }
    const orderKeyOfNode = (n: ReactFlowNode): number => {
      const dk = domainOf(n)
      const sk = subOf(n)
      const exp = explicitSubIdx(dk, sk)
      if (isFinite(exp)) return exp
      // 查找该域该子域在原始数据中的首次出现
      for (let i = 0; i < updatedNodes.length; i++) {
        const nd: any = (updatedNodes[i] as any)?.data || {}
        const d = String(nd?.domain || '').trim()
        const s = String(((nd?.subDomain ?? nd?.subdomain) ?? nd?.metadata?.subDomain) || '').trim()
        if (d === dk && s === sk) return i
      }
      const self = originalIndex.get(String(n.id))
      return typeof self === 'number' ? self : Number.POSITIVE_INFINITY
    }
    let layoutCandidates: ReactFlowNode[] = updatedNodes.filter(n => !EXCLUDE_TYPES.has(String(n.type || '')))
    layoutCandidates = layoutCandidates.slice().sort((a, b) => {
      const da = domainOrderIndex.get(domainOf(a))
      const db = domainOrderIndex.get(domainOf(b))
      const pa = typeof da === 'number' ? da : Number.POSITIVE_INFINITY
      const pb = typeof db === 'number' ? db : Number.POSITIVE_INFINITY
      if (pa !== pb) return pa - pb
      return orderKeyOfNode(a) - orderKeyOfNode(b)
    })
    const scopedEdges = (edges || []).filter(e => layoutCandidates.some(n => n.id === e.source) && layoutCandidates.some(n => n.id === e.target))
    const left = Math.max(40, Number(((options as any)?.padding?.left)) || 40)
    const top = Math.max(40, Number(((options as any)?.padding?.top)) || 40)
    const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), Math.max(120, (diagramConfigManager.getLayoutConfig() as any)?.NODE_MIN_WIDTH || 120))
    const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), (diagramConfigManager.getConfig() as any)?.node?.height || 80)

    try {
      const nodeLayoutRaw: any = (options as any)?.nodeLayout
      const sRaw = String(nodeLayoutRaw || '').toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
      const useCytoscapeFcose = (sRaw.includes('cytoscape') || sRaw.includes('fcose'))
      const useCytoscapeConcentric = sRaw.includes('concentric')
      if (useCytoscapeFcose || useCytoscapeConcentric) {
        const cytoscapeMod: any = await import('cytoscape')
        const cytoscape = cytoscapeMod.default || cytoscapeMod
        if (useCytoscapeFcose) {
          const fcoseMod: any = await import('cytoscape-fcose')
          try { (cytoscape as any).use(fcoseMod.default || fcoseMod) } catch { }
        }
        const elements: any[] = [
          ...layoutCandidates.map(n => ({ data: { id: n.id, width: getW(n), height: getH(n) } })),
          ...scopedEdges.map(e => ({ data: { id: e.id || `${e.source}->${e.target}`, source: e.source, target: e.target } }))
        ]
        const cy = cytoscape({ headless: true, elements, style: [{ selector: 'node', style: { width: 'data(width)', height: 'data(height)' } }] })
        const layout = cy.layout(useCytoscapeFcose ? { name: 'fcose', animate: false } as any : { name: 'concentric', animate: false } as any)
        layout.run()
        for (const n of layoutCandidates) {
          const el = cy.getElementById(n.id)
          const p = el?.position?.() || { x: 0, y: 0 }
            ; (n as any).position = { x: Math.round(p.x + left), y: Math.round(p.y + top) } as any
        }
        // 统一散列：沿较小间距轴展开同点，降低初始堆叠
        try {
          const cfgLayout: any = diagramConfigManager.getLayoutConfig() || {}
          const hGap = Math.max(12, num(cfgLayout?.NODE_H_GAP, 120))
          const vGap = Math.max(8, num(cfgLayout?.NODE_V_GAP, 80))
          scatterNodesAtSamePoint(layoutCandidates, 'x' as any, hGap, 2)
          scatterNodesAtSamePoint(layoutCandidates, 'y' as any, vGap, 2)
        } catch { }
      } else {
        const { default: ELK } = await import('elkjs')
        const elk = new ELK()
        const dirRaw = String(((options as any)?.direction || (diagramConfigManager.getConfig() as any)?.diagram?.layout?.direction || '')).toUpperCase()
        const elkDirOverride = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.ELK_DIRECTION', '') || '').toUpperCase()
        const elkDir = elkDirOverride && ['RIGHT', 'DOWN', 'LEFT', 'UP'].includes(elkDirOverride)
          ? elkDirOverride
          : (dirRaw === 'LR' || dirRaw === 'RIGHT' ? 'RIGHT' : dirRaw === 'RL' || dirRaw === 'LEFT' ? 'LEFT' : dirRaw === 'BT' || dirRaw === 'UP' ? 'UP' : 'DOWN')
        const hGapCfg = num(LayeredConfigManager.getInstance().get<number>('diagram.layout.ELK_NODE_SPACING', (diagramConfigManager.getLayoutConfig() as any)?.NODE_H_GAP ?? 120), 56)
        const vGapCfg = num(LayeredConfigManager.getInstance().get<number>('diagram.layout.ELK_LAYER_SPACING', (diagramConfigManager.getConfig() as any)?.node?.gap?.vertical ?? 80), 80)
        const placement = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.ELK_NODE_PLACEMENT', 'NETWORK_SIMPLEX') || 'NETWORK_SIMPLEX').toUpperCase()
        const mergeEdges = Boolean(LayeredConfigManager.getInstance().get<boolean>('diagram.layout.ELK_MERGE_EDGES', true))
        const edgeRouting = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.ELK_EDGE_ROUTING', 'POLYLINE') || 'POLYLINE').toUpperCase()
        const layering = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.ELK_LAYERING', 'NETWORK_SIMPLEX') || 'NETWORK_SIMPLEX').toUpperCase()
        const fixedAlignment = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.ELK_FIXED_ALIGNMENT', 'NONE') || 'NONE').toUpperCase()
        const considerModelOrder = true
        const cycleBreaking = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.ELK_CYCLE_BREAKING', 'GREEDY') || 'GREEDY').toUpperCase()
        const portBorderOffset = Number(LayeredConfigManager.getInstance().get<number>('diagram.layout.ELK_PORT_BORDER_OFFSET', 4) || 4)
        const labelSpacing = Number(LayeredConfigManager.getInstance().get<number>('diagram.layout.ELK_LABEL_SPACING', 8) || 8)
        const edgeNodeSpacing = Number(LayeredConfigManager.getInstance().get<number>('diagram.layout.ELK_EDGE_NODE_SPACING', 8) || 8)
        const edgeEdgeSpacing = Number(LayeredConfigManager.getInstance().get<number>('diagram.layout.ELK_EDGE_EDGE_SPACING', 4) || 4)
        const portPortSpacing = Number(LayeredConfigManager.getInstance().get<number>('diagram.layout.ELK_PORT_PORT_SPACING', 4) || 4)
        let elkAlgorithm = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.ELK_ALGORITHM', 'layered') || 'layered').toLowerCase()

        // Map short names to full qualified names
        const algoMap: Record<string, string> = {
          'layered': 'org.eclipse.elk.layered',
          'force': 'org.eclipse.elk.force',
          'stress': 'org.eclipse.elk.stress',
          'radial': 'org.eclipse.elk.radial',
          'mrtree': 'org.eclipse.elk.mrtree',
          'disco': 'org.eclipse.elk.disco',
        };
        if (algoMap[elkAlgorithm]) elkAlgorithm = algoMap[elkAlgorithm];
        const graph: any = {
          id: 'elk-domain-layout',
          layoutOptions: {
            'elk.algorithm': elkAlgorithm,
            'elk.direction': elkDir,
            'elk.spacing.nodeNode': Math.max(24, hGapCfg),
            'elk.layered.spacing.nodeNodeBetweenLayers': Math.max(24, vGapCfg),
            'elk.spacing.edgeNode': edgeNodeSpacing,
            'elk.spacing.edgeEdge': edgeEdgeSpacing,
            'elk.spacing.portPort': portPortSpacing,
            'elk.layered.mergeEdges': String(mergeEdges),
            'elk.layered.nodePlacement.strategy': placement,
            'elk.layered.edgeRouting': edgeRouting,
            'elk.layered.layering.strategy': layering,
            'elk.layered.nodePlacement.bk.fixedAlignment': fixedAlignment,
            'elk.layered.considerModelOrder': String(considerModelOrder),
            'elk.layered.cycleBreaking.strategy': cycleBreaking,
            'elk.port.borderOffset': portBorderOffset,
            'elk.spacing.labelLabel': labelSpacing,
          },
          children: layoutCandidates.map(n => ({ id: n.id, width: getW(n), height: getH(n) })),
          edges: scopedEdges.map(e => ({ id: e.id || `${e.source}->${e.target}`, sources: [e.source], targets: [e.target] })),
        }
        const res = await elk.layout(graph)
        const idToPos: Record<string, { x: number; y: number }> = {}
        for (const c of (res.children || [])) idToPos[c.id] = { x: Math.round((c.x || 0) + left), y: Math.round((c.y || 0) + top) }
        for (const n of layoutCandidates) {
          const p = idToPos[n.id] || { x: left, y: top }
            ; (n as any).position = { x: p.x, y: p.y } as any
        }
        const axis = elkDir === 'RIGHT' ? 'y' : 'x'
        scatterNodesAtSamePoint(layoutCandidates, axis as any, axis === 'x' ? hGapCfg : vGapCfg, 2)
        // 双轴补散列，进一步避免角落聚集
        try { scatterNodesAtSamePoint(layoutCandidates, axis === 'x' ? 'y' as any : 'x' as any, axis === 'x' ? vGapCfg : hGapCfg, 2) } catch { }
      }
    } catch { }
    // 纯节点布局模式：不进行域/子域容器约束，但做自由业务节点的重叠消解
    try {
      // 1. 刷新所有节点尺寸（含 measured）
      updatedNodes = ensureMeasuredForNodes(updatedNodes);

      // 2. [新增] 强制更新子域容器尺寸（包裹内容）
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;

      // 3. [新增] 强制更新域容器尺寸（包裹内容与子域）
      updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
      updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;

      // 4. [新增] 域容器防重叠（垂直堆叠）
      const cfgLayout: any = diagramConfigManager.getLayoutConfig() || {}
      const domainVGap = Math.max(40, num(cfgLayout?.DOMAIN_V_GAP, 40));
      updatedNodes = resolveDomainContainerOverlaps(updatedNodes, domainVGap) as any;

      // 5. 全局节点防重叠（含子域内节点）
      const hGap = Math.max(12, num(cfgLayout?.NODE_H_GAP, 120))
      const vGap = Math.max(8, num(cfgLayout?.NODE_V_GAP, 80))
      updatedNodes = resolveAllNodeOverlapsGlobal(updatedNodes as any, hGap, vGap) as any

      // 6. [新增] 再次刷新容器尺寸以适应微调
      updatedNodes = recomputeSubGroupContainersBasic(updatedNodes) as any;
      updatedNodes = finalizeDomainWidthsByProjection(updatedNodes) as any;
      updatedNodes = finalizeDomainHeightsByProjection(updatedNodes) as any;

    } catch (err) {
      console.warn('[DomainElkLayout] Container update failed:', err);
    }
    // 统一智能连线决策：赋予 ELK 布局下连线端口选择的智能
    const edgeIdMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const))
    const cfgEdge = (diagramConfigManager.getConfig() as any)?.edge || {}

    // P1: Edge-Edge Avoidance - 收集已路由边的路径
    const routedPaths: Array<{ points: Array<{ x: number; y: number }> }> = []

    // 计算布局方向（在循环外一次性计算）
    const dirRaw = String(((options as any)?.direction || (diagramConfigManager.getConfig() as any)?.diagram?.layout?.direction || '')).toUpperCase()
    let layoutDir: 'TB' | 'LR' | 'RL' | 'BT' = 'TB'
    if (dirRaw === 'LR' || dirRaw === 'RIGHT') layoutDir = 'LR'
    else if (dirRaw === 'RL' || dirRaw === 'LEFT') layoutDir = 'RL'
    else if (dirRaw === 'BT' || dirRaw === 'UP') layoutDir = 'BT'

    const finalEdges = edges.map(edge => {
      const edgeType = String(edge.type || '').toLowerCase()
      const baseType = edgeType.includes('smart') ? edge.type : 'smart-step'
      const newData = {
        ...(edge.data || {}),
        intraContainerNoObstacle: true,
        obstacleScope: 'corridor',
        obstaclePadding: 24,
        pathOptions: { ...(edge.data?.pathOptions || {}), gridRatio: 1.04, borderRadius: 4 } // [FIX] Hyper-Glass V3: 4px sharp corners
      }

      const srcNode = edgeIdMap.get(edge.source)
      const tgtNode = edgeIdMap.get(edge.target)

      let finalType = baseType
      let finalSourceHandle = edge.sourceHandle
      let finalTargetHandle = edge.targetHandle

      if (srcNode && tgtNode) {
        const routingConfig = {
          mode: 'advanced-smart' as const,
          globalPath: (cfgEdge.pathType || 'step') as string,
          autoPathSelection: true,
          layoutDirection: layoutDir,
          directionalHandlePolicy: 'force' as const, // ELK 布局层级分明，强制方向效果更好
          angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
          routedPaths, // P1: 传入已路由路径
        }
        const choice = decideEdgeRouting(srcNode, tgtNode, updatedNodes, routingConfig)
        finalType = choice.type
        finalSourceHandle = choice.sourceHandle
        finalTargetHandle = choice.targetHandle

        // P1: 记录此边的完整计算路径
        if (choice.computedPath && choice.computedPath.length >= 2) {
          routedPaths.push({ points: choice.computedPath })
        } else {
          // Fallback: 使用起点终点
          const sPos = (srcNode as any).positionAbsolute ?? (srcNode as any).position ?? { x: 0, y: 0 }
          const tPos = (tgtNode as any).positionAbsolute ?? (tgtNode as any).position ?? { x: 0, y: 0 }
          const sW = (srcNode as any)?.measured?.width ?? 100
          const sH = (srcNode as any)?.measured?.height ?? 50
          const tW = (tgtNode as any)?.measured?.width ?? 100
          const tH = (tgtNode as any)?.measured?.height ?? 50

          const handleToAnchor = (pos: any, w: number, h: number, handle: string | null | undefined) => {
            switch (handle) {
              case 'l': return { x: pos.x, y: pos.y + h / 2 }
              case 'r': return { x: pos.x + w, y: pos.y + h / 2 }
              case 't': return { x: pos.x + w / 2, y: pos.y }
              case 'b': return { x: pos.x + w / 2, y: pos.y + h }
              default: return { x: pos.x + w / 2, y: pos.y + h / 2 }
            }
          }

          const startPt = handleToAnchor(sPos, sW, sH, finalSourceHandle)
          const endPt = handleToAnchor(tPos, tW, tH, finalTargetHandle)
          routedPaths.push({ points: [startPt, endPt] })
        }
      }

      return {
        ...edge,
        type: finalType,
        sourceHandle: finalSourceHandle ? expandHandle(String(finalSourceHandle)) : finalSourceHandle,
        targetHandle: finalTargetHandle ? expandHandle(String(finalTargetHandle)) : finalTargetHandle,
        data: newData
      }
    })

    // P2: 全局路由优化（可选）
    const enableGlobalOptimization = (diagramConfigManager.getConfig() as any)?.edge?.globalOptimization ?? true
    let optimizedEdges = finalEdges
    if (enableGlobalOptimization && finalEdges.length > 1) {
      optimizedEdges = globalOptimizeEdgeRouting(
        finalEdges,
        updatedNodes,
        { mode: 'advanced-smart', layoutDirection: layoutDir, directionalHandlePolicy: 'force', topK: 4 },
        3
      )
    }

    // 并行边分离：避免同节点对的多边堆叠
    const separatedEdges = separateParallelEdges(optimizedEdges, 12)

    // P3: 动态多端口分布
    const distributedEdges = distributePortConnections(separatedEdges, updatedNodes, 16)

    // P4: 高级边捆绑（默认启用）
    const bundlingEnabled = (diagramConfigManager.getConfig() as any)?.edge?.bundling ?? true
    const bundledEdges = bundleEdges(distributedEdges, updatedNodes, {
      enabled: bundlingEnabled,
      layoutDirection: layoutDir,
      regionSize: 200,
      minBundleSize: 2,
      bundleSpacing: 8
    })

    // P5: 分层边路由 (长边控制点)
    const layeredEdges = layerBasedEdgeRouting(bundledEdges, updatedNodes, {
      enabled: true,
      layerThreshold: 400,
      layoutDirection: layoutDir
    })

    // P7: 正交边美化
    const beautifiedEdges = beautifyOrthogonalEdges(layeredEdges, updatedNodes, {
      enabled: true,
      minSegmentLength: 20
    })

    // P8: 树状总线路由
    const treeEdges = optimizeTreeBusRouting(beautifiedEdges, updatedNodes, {
      enabled: true,
      minBusSize: 2,
      layoutDirection: layoutDir
    })

    // P6: 边标签智能避让 (最后执行)
    const labeledEdges = optimizeEdgeLabelPositions(treeEdges, updatedNodes, {
      enabled: true,
      labelPadding: 8
    })

    const finalEdgesExpanded = labeledEdges.map(edge => ({
      ...edge,
      sourceHandle: edge.sourceHandle ? expandHandle(String(edge.sourceHandle)) : edge.sourceHandle,
      targetHandle: edge.targetHandle ? expandHandle(String(edge.targetHandle)) : edge.targetHandle,
    }))

    return { nodes: updatedNodes, edges: finalEdgesExpanded }
  }
}

export default DomainElkLayoutStrategy
