/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node, Edge } from '@xyflow/react'
import { StandardDiagramData, StandardEdgeData, LayoutMetadata } from '../models/DiagramModels'
import { OrchestrationOptions } from '../types/diagrams'
import { LayoutType, LayoutOptions } from '../types/layout'
import { ILayoutStrategy, LayoutStrategyManager } from '../strategies/LayoutStrategyManager'
import { EnhancedThemeManager as ThemeManager } from '../themes/EnhancedThemeManager'
import { getConfigIntegration } from '../config/ConfigIntegration'
import { diagramConfigManager } from '../components/config/DiagramConfig'
import { LayeredConfigManager } from '../config/LayeredConfigManager';
import { nodeFactory } from '../factories/NodeFactory'
import { edgeFactory, EdgeType, EdgeStyleType } from '../factories/EdgeFactory'

import { ThemeColorUtil } from '../themes/ThemeUtils'
import { parseColorToRgb, adjustSaturationAndLightness, toRgba } from '../utils/colorUtils'
import { deriveDomainClassFromDomain } from '../utils/domainKey'
import { EdgeDecisionService } from './EdgeDecisionService'
import type { ResolvedEdgeConfig } from '../types/diagram-components'

export interface OrchestratedData {
  nodes: Node[];
  edges: Edge[];
  resolvedEdgeConfig?: ResolvedEdgeConfig;
}

export class DiagramOrchestrator {
  private themeManager: ThemeManager
  private layoutStrategies: LayoutStrategyManager
  private configManager: LayeredConfigManager

  constructor() {
    this.configManager = LayeredConfigManager.getInstance()
    const integration = getConfigIntegration()
    this.themeManager = integration?.getThemeManager?.() ?? new ThemeManager()
    this.layoutStrategies = LayoutStrategyManager.getShared()
  }

  private resolveThemeId(raw?: string): string {
    const id = (raw || '').trim().toLowerCase()
    const aliasMap: Record<string, string> = { 'sunset-orange': 'sunset', 'tms-theme': 'tms', 'default': 'light', 'default-theme': 'light' }
    return aliasMap[id] || (raw || 'light')
  }

  private convertLayoutMetadataToOptions(metadata: LayoutMetadata): LayoutOptions {
    /**
     * 函数级注释：布局元数据到选项的转换
     * - 目的：将标准数据中的 layout 元信息完整映射到策略选项，包含方向、间距与分组参数
     */
    return {
      type: metadata.type as unknown as LayoutType,
      direction: metadata.direction,
      autoDirection: (metadata as any).autoDirection,
      spacing: metadata.spacing,
      padding: {
        top: metadata.padding.top ?? metadata.padding.vertical,
        bottom: metadata.padding.bottom ?? metadata.padding.vertical,
        left: metadata.padding.left ?? metadata.padding.horizontal,
        right: metadata.padding.right ?? metadata.padding.horizontal,
      },
      generateDomainGroups: (metadata as any).generateDomainGroups,
      generateSubDomainGroups: (metadata as any).generateSubDomainGroups,
      subDomainWhitelist: (metadata as any).subDomainWhitelist,
      domainWhitelist: (metadata as any).domainWhitelist,
      groupPadding: (() => {
        const gp: any = (metadata as any).groupPadding
        if (typeof gp === 'number') return gp
        if (gp && (typeof gp.H === 'number' || typeof gp.V === 'number')) { return Math.max(Number(gp.H ?? 0), Number(gp.V ?? 0)) }
        return undefined
      })(),
      domainTitleHeight: (metadata as any).domainTitleHeight,
      fitDomainContent: Boolean(((metadata as any).fitDomainContent ?? (metadata as any).fitDomainContentWidth)),
      domainOrder: (metadata as any).domainOrder,
      subDomainOrder: (metadata as any).subDomainOrder,
    }
  }

  public async orchestrate(
    data: StandardDiagramData,
    layoutType?: LayoutType,
    options?: OrchestrationOptions
  ): Promise<OrchestratedData> {
    /**
     * 函数级注释：编排总流程（最小集）
     * - 步骤：主题合并 → 工厂创建 → 策略布局 → 节点与边合并 → 返回
     * - 特性：移除尾部容器后处理，避免覆盖策略输出；严格依赖策略的容器/节点结果
     */
    /**
     * 函数级注释：标准数据域类校验（强制）
     * 目标：确保所有业务节点显式提供 `domainClass`，避免依赖 `domain` 或别名造成主题混乱。
     * 行为：遍历 `data.nodes`，若发现缺失或非法值，抛出错误并标注节点ID。
     */
    const normalizedNodesInput = (data.nodes as any[]).map((n) => {
      /**
       * 函数级注释：缺失域类补全（历史映射）
       * 目标：在新数据未显式提供 domainClass 时，按历史映射从 domain 补齐。
       * 说明：仅在缺失时补齐，不覆盖已有值；补齐后再进行强制校验。
       */
      const dcRaw = String((n?.domainClass ?? '')).trim()
      if (dcRaw) return n
      const guessed = deriveDomainClassFromDomain(String(n?.domain ?? ''))
      return { ...n, domainClass: guessed }
    })
    for (let i = 0; i < normalizedNodesInput.length; i++) {
      const n: any = normalizedNodesInput[i]
      let dc = String((n?.domainClass ?? '')).trim()
      if (!dc) {
        dc = deriveDomainClassFromDomain(String(n?.domain ?? '')) || 'frontend'
        normalizedNodesInput[i] = { ...n, domainClass: dc }
      }
    }

    const baseThemeIdCandidate = this.resolveThemeId(data.theme?.name || 'light')
    const baseThemeFound = await this.themeManager.getTheme(baseThemeIdCandidate)
    const resolvedBaseThemeId = baseThemeFound ? baseThemeIdCandidate : 'light'
    const baseTheme = await this.themeManager.getTheme(resolvedBaseThemeId)
    /**
     * 函数级注释：合并域主题并从主色派生缺失的色阶
     * 目标：当标准数据仅提供 `main`/`border`/`text` 等基础字段时，自动派生 `background`/`light`/`dark`/`shadow`，避免所有域背景一致。
     * 规则：
     * - 优先使用覆盖值（overrides）；
     * - 若覆盖缺失且提供了 `main`，按浅色主题的派生策略生成配色；
     * - 若仍缺失，回退到基础主题的域色或主调色板。
     */
    const mergedDomains = (() => {
      if (!baseTheme) return undefined
      const overrides = (data.theme?.domains || {}) as Record<string, any>
      const result: Record<string, any> = { ...baseTheme.diagram.domains }
      const deriveFromMain = (baseHex: string) => {
        const rgb = parseColorToRgb(baseHex)
        const lightRGB = adjustSaturationAndLightness(rgb, -0.28, 0.45)
        const bgRGB = adjustSaturationAndLightness(rgb, -0.34, 0.58)
        const darkRGB = adjustSaturationAndLightness(rgb, 0.05, -0.10)
        const borderRGB = adjustSaturationAndLightness(rgb, 0.08, -0.02)
        const lightHex = ThemeColorUtil.rgbToHex(lightRGB.r, lightRGB.g, lightRGB.b)
        const bgHex = ThemeColorUtil.rgbToHex(bgRGB.r, bgRGB.g, bgRGB.b)
        const darkHex = ThemeColorUtil.rgbToHex(darkRGB.r, darkRGB.g, darkRGB.b)
        const borderHex = ThemeColorUtil.rgbToHex(borderRGB.r, borderRGB.g, borderRGB.b)
        const bg = ThemeColorUtil.hexToRgb(bgHex) || { r: 240, g: 240, b: 240 }
        const luminance = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255
        const textHex = luminance > 0.55 ? '#2A3B4C' : '#ffffff'
        return {
          light: lightHex,
          background: bgHex,
          dark: darkHex,
          border: borderHex,
          text: textHex,
          shadow: toRgba(rgb, 0.18),
        }
      }
      Object.keys(overrides).forEach((key) => {
        const o = overrides[key] || {}
        const b = (baseTheme.diagram.domains as any)[key] || baseTheme.palette.primary
        const derived = o.main ? deriveFromMain(o.main) : {}
        result[key] = {
          main: o.main ?? b.main ?? '#666666',
          light: o.light ?? (derived as any).light ?? b.light ?? '#777777',
          dark: o.dark ?? (derived as any).dark ?? b.dark ?? '#333333',
          contrast: o.contrast ?? b.contrast ?? '#FFFFFF',
          border: o.border ?? (derived as any).border ?? b.border ?? '#666666',
          background: o.background ?? (derived as any).background ?? b.background ?? '#FFFFFF',
          text: o.text ?? (derived as any).text ?? b.text ?? '#333333',
          shadow: o.shadow ?? (derived as any).shadow ?? b.shadow ?? 'rgba(0,0,0,0.1)'
        }
      })
      return result
    })()
    const customTheme = baseTheme ? { ...baseTheme, id: `custom-${data.id}`, name: data.name, diagram: { ...baseTheme.diagram, domains: mergedDomains ?? baseTheme.diagram.domains } } : null
    if (customTheme) {
      this.themeManager.addCustomTheme(customTheme)
      /**
       * 函数级注释：避免覆盖用户选择的主题
       * 规则：仅当当前主题未初始化（无 themeId 且 getCurrentTheme() 为空）时，才设为自定义主题；
       * 否则保留用户在“更多”里选择的主题。
       */
      try {
        const curId = (this.themeManager as any).getCurrentThemeId?.()
        const curTheme = await this.themeManager.getCurrentTheme()
        if (!curId && !curTheme) {
          await this.themeManager.setTheme(customTheme.id)
        }
      } catch { void 0; }
    }
    const theme = customTheme ?? baseTheme

    const nodeConfigs = normalizedNodesInput.map(n => ({
      ...n,
      type: n.type as any,
      position: { x: 0, y: 0 }
    }));
    const initialNodes: Node[] = nodeFactory.createNodes(nodeConfigs, theme || undefined);

    const prepareEdgeForLayout = (e: any): Edge => {
      /** 函数级注释：布局前边语义归一化
       * - 将 kind/type 归一化为 data.edgeType 与 data.kind，便于策略识别主/支路线
       */
      const semanticRaw = String((e?.edgeType ?? e?.kind ?? e?.type ?? '') || '').toLowerCase()
      const edgeTypeNormalized = semanticRaw || ''
      const mergedData = { ...(e?.data || {}), edgeType: edgeTypeNormalized || (e?.data?.edgeType ?? undefined), kind: (e?.data?.kind ?? edgeTypeNormalized) }
      return { id: e?.id ?? `${e?.source}-${e?.target}`, source: e?.source, target: e?.target, type: e?.type, label: e?.label, style: e?.style, data: mergedData as any } as Edge
    }

    let layoutNodes: Node[] = initialNodes
    let layoutEdges: Edge[] = data.edges.map(prepareEdgeForLayout)

    // 函数级注释：预计算全局扇出/扇入元数据并注入节点 data
    // - 目的：为策略提供一对多/多对一显著度，以便更智能选择方向与触发局部分层
    // - 数据：为每个节点写入 fanIn/fanOut/fanScore，用于启发式判断
    try {
      const fanIn: Record<string, number> = {}
      const fanOut: Record<string, number> = {}
      for (const n of layoutNodes) { fanIn[n.id] = 0; fanOut[n.id] = 0 }
      for (const e of layoutEdges) {
        if (e?.source) fanOut[e.source] = (fanOut[e.source] || 0) + 1
        if (e?.target) fanIn[e.target] = (fanIn[e.target] || 0) + 1
      }
      const total = Math.max(1, layoutNodes.length)
      layoutNodes = layoutNodes.map(n => {
        const fi = fanIn[n.id] || 0
        const fo = fanOut[n.id] || 0
        const score = (fi >= 2 ? 1 : 0) + (fo >= 2 ? 1 : 0)
        const nd: any = { ...(n.data || {}) }
        nd.fanIn = fi; nd.fanOut = fo; nd.fanScore = score / total
        return { ...(n as any), data: nd }
      })

      /**
       * 函数级注释：为边注入 join/split 语义标注
       * - 当某节点入度≥2，则其所有入边标记为 join；
       * - 当某节点出度≥2，则其所有出边标记为 split；
       * - 语义用于策略层触发模式化布局与把手选择。
       */
      layoutEdges = layoutEdges.map(e => {
        const ed: any = { ...(e.data || {}) }
        if ((fanIn[e.target] || 0) >= 2) ed.role = ed.role || 'join'
        if ((fanOut[e.source] || 0) >= 2) ed.role = ed.role || 'split'
        return { ...e, data: ed }
      })
    } catch { void 0; }

    if (layoutType) {
      let strategy = this.layoutStrategies.getStrategy(layoutType)
      if (!strategy && typeof layoutType === 'string') {
        const rawName = String(layoutType).trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
        const fallbackAlias: Record<string, string> = {
          hierarchical: 'DomainVerticalLayout',
          hierarchic: 'DomainVerticalLayout',
          hierarchicallayout: 'DomainVerticalLayout',
          flow: 'DomainVerticalLayout',
          flowlayout: 'DomainVerticalLayout',
          layered: 'DomainVerticalLayout',
          layereddomain: 'DomainVerticalLayout',
          layereddomainlayout: 'DomainVerticalLayout',
          'layered-domain': 'DomainVerticalLayout',
          advancedelk: 'DomainVerticalLayout',
          advancedelklayout: 'DomainVerticalLayout'
        }
        const fb = fallbackAlias[rawName]
        if (fb) strategy = this.layoutStrategies.getStrategy(fb)
      }
      if (!strategy) throw new Error(`Unsupported layout type: ${layoutType}`)
      let layoutOptions = this.convertLayoutMetadataToOptions(data.layout)
      // 函数级注释：节点布局策略优先级（外部选项优先）
      // - 若 options 已提供 nodeLayout，则不被配置中心覆盖；
      // - 否则，读取 LayeredConfig 的 diagram.layout.nodeStrategy 作为默认。
      const raw = String(this.configManager.get<string>('diagram.layout.nodeStrategy', '') || '').trim()
      const norm = raw.replace(/\s+/g, '').toLowerCase()
      const map: Record<string, LayoutType> = { gridlayout: LayoutType.GRID, grid: LayoutType.GRID, horizontallayout: LayoutType.HORIZONTAL, horizontal: LayoutType.HORIZONTAL, verticallayout: LayoutType.VERTICAL, vertical: LayoutType.VERTICAL, centeredlayout: LayoutType.CENTERED, centered: LayoutType.CENTERED, elknodelayout: LayoutType.ELK, elk: LayoutType.ELK }
      const nodeLayout = map[norm]
      const hasOptionNodeLayout = Boolean(((layoutOptions as any)?.nodeLayout))
      if (!hasOptionNodeLayout && nodeLayout) (layoutOptions as any).nodeLayout = nodeLayout
      if (options) {
        const o = options as any
        layoutOptions = { ...layoutOptions, ...(o.direction ? { direction: o.direction } : {}), ...(typeof o.autoDirection === 'boolean' ? { autoDirection: o.autoDirection } : {}), ...(o.spacing ? { spacing: o.spacing } : {}), ...(typeof o.groupPadding === 'number' ? { groupPadding: o.groupPadding } : {}), ...(typeof o.generateDomainGroups === 'boolean' ? { generateDomainGroups: o.generateDomainGroups } : {}), ...(typeof o.generateSubDomainGroups === 'boolean' ? { generateSubDomainGroups: o.generateSubDomainGroups } : {}), ...(Array.isArray(o.subDomainWhitelist) ? { subDomainWhitelist: o.subDomainWhitelist } : {}), ...(Array.isArray(o.domainWhitelist) ? { domainWhitelist: o.domainWhitelist } : {}), ...(o.nodeLayout ? { nodeLayout: o.nodeLayout } : {}), ...(o.containerSize ? { containerSize: o.containerSize } : {}), ...(typeof o.fitDomainContent === 'boolean' ? { fitDomainContent: o.fitDomainContent } : {}), ...(Array.isArray(o.domainOrder) ? { domainOrder: o.domainOrder } : {}), ...(o.subDomainOrder ? { subDomainOrder: o.subDomainOrder } : {}), } as any
      }
      /**
       * 函数级注释：整体布局与节点布局的关联增强（自动推荐 + 置灰）
       * - 目标：当选择域整体布局（ELK/Cytoscape）时，节点布局由策略内部控制，外部不再独立选择；
       * - 行为：通过 LayoutStrategyManager 计算推荐的节点布局并写入选项；同时在视图层置灰下拉（见 DiagramViewer）。
       */
      try {
        const selectable = this.layoutStrategies.isNodeLayoutExternallySelectable(String(layoutType))
        if (!selectable) {
          const preferred = this.layoutStrategies.getPreferredNodeStrategyForHierarchy(String(layoutType), layoutNodes as any, layoutEdges as any)
          if (preferred) (layoutOptions as any).nodeLayout = preferred
        }
      } catch { void 0; }
      // ElkRadial：允许通过节点布局选择方向（Horizontal→LR，Vertical→TB）
      try {
        const stratName = String(strategy.getName?.() || layoutType).toLowerCase();
        const nodeLayoutSel = String(((layoutOptions as any)?.nodeLayout || '')).toLowerCase();
        if (stratName.includes('elkradial')) {
          if (nodeLayoutSel.includes('horizontal')) (layoutOptions as any).direction = 'LR';
          else if (nodeLayoutSel.includes('vertical')) (layoutOptions as any).direction = 'TB';
        }
      } catch { void 0; }

      const result = await strategy.calculateLayout(layoutNodes, layoutEdges, layoutOptions)
      layoutNodes = result.nodes || layoutNodes
      layoutEdges = result.edges || layoutEdges
    } // end if (layoutType)

    const processedNodes: Node[] = layoutNodes
    const idToDomain = new Map<string, string | undefined>()
    const idToDomainClass = new Map<string, string | undefined>()
    for (const n of processedNodes) { idToDomain.set(n.id, (n.data as any)?.domain); idToDomainClass.set(n.id, (n.data as any)?.domainClass) }
    /**
     * 函数级注释：统一边渲染模式与路径类型的来源（LayeredConfig 优先 → DiagramConfig 回退）
     * 目标：编排层与视图层对齐到“单一事实源”，避免不同配置系统默认值不一致导致的行为不符；
     * 规则：
     * - 优先从 LayeredConfigManager 读取 'diagram.edge.mode' / 'diagram.edge.pathType'
     * - 若未配置则回退到 DiagramConfigManager 的全局配置
     * - 最终默认：mode='smart'，pathType='step'
     */
    const cfgEdge = (() => { try { return (diagramConfigManager.getConfig() as any)?.edge; } catch { return undefined; } })() as any;
    const globalMode: 'advanced-smart' | 'native' = this.configManager.get<'advanced-smart' | 'native'>('diagram.edge.mode', (cfgEdge?.mode ?? 'advanced-smart'))
    let globalPath: string = String(this.configManager.get<string>('diagram.edge.pathType', (cfgEdge?.pathType ?? 'step'))).toLowerCase()
    // 函数级注释：优化路径类型默认值逻辑，允许 'auto' 透传以启用智能路由选择
    if (!globalPath) globalPath = 'step'
    const smoothFallback = String(this.configManager.get<string>('diagram.edge.smoothFallback', (cfgEdge?.smoothFallback ?? 'bezier')) || 'bezier').toLowerCase()
    const preferSmart = (globalMode === 'advanced-smart')
    const enableAutoTypeRaw = Boolean(this.configManager.get<boolean>('diagram.edge.autoPathType', (typeof (cfgEdge as any)?.autoPathSelection === 'boolean' ? (cfgEdge as any).autoPathSelection : true)))
    const deferUnified = Boolean(this.configManager.get<boolean>('diagram.edge.deferUnifiedEdgeProcessing', false))
    const enableAutoType = deferUnified ? false : (preferSmart ? enableAutoTypeRaw : false)
    const handlePolicy = String((cfgEdge as any)?.handleSelectionPolicy || 'force-cost').toLowerCase()
    const enableAutoHandle = deferUnified ? false : Boolean(this.configManager.get<boolean>('diagram.edge.autoHandle', handlePolicy !== 'respect'))
    const resolvedEdgeConfig = { mode: globalMode, pathType: globalPath, smoothFallback, autoPathType: enableAutoType, autoHandle: enableAutoHandle, handleSelectionPolicy: handlePolicy }
    const styleTypeMap: Record<string, EdgeStyleType> = { main: EdgeStyleType.MAIN, dependency: EdgeStyleType.DEPENDENCY, data: EdgeStyleType.DATA, support: EdgeStyleType.SUPPORT, core: EdgeStyleType.CORE, feedback: EdgeStyleType.FEEDBACK, channel: EdgeStyleType.CHANNEL, midend: EdgeStyleType.MIDEND, scm: EdgeStyleType.SCM, logistics: EdgeStyleType.LOGISTICS, corp: EdgeStyleType.CORP, infra: EdgeStyleType.INFRA }
    const pickEdgeType = (): EdgeType => {
      if (globalMode === 'advanced-smart') {
        if (globalPath === 'auto') return EdgeType.ADVANCED_SMART_STEP
        if (globalPath.includes('straight')) return EdgeType.ADVANCED_SMART_STRAIGHT
        if (globalPath.includes('step')) return EdgeType.ADVANCED_SMART_STEP
        if (globalPath.includes('smooth')) {
          if (smoothFallback === 'native') return EdgeType.SMOOTHSTEP
          if (smoothFallback === 'straight') return EdgeType.ADVANCED_SMART_STRAIGHT
          if (smoothFallback === 'step') return EdgeType.ADVANCED_SMART_STEP
          return EdgeType.ADVANCED_SMART_BEZIER
        }
        if (globalPath.includes('bezier')) return EdgeType.ADVANCED_SMART_BEZIER
        return EdgeType.ADVANCED_SMART_BEZIER
      } else {
        if (globalPath === 'auto') return EdgeType.STEP
        if (globalPath.includes('straight')) return EdgeType.STRAIGHT
        if (globalPath.includes('step')) return EdgeType.STEP
        if (globalPath.includes('smooth')) return EdgeType.SMOOTHSTEP
        if (globalPath.includes('bezier')) return EdgeType.BEZIER
        return EdgeType.STEP
      }
    }
    /**
     * 函数级注释：根据几何关系自适应选择路径类型与把手（不破坏显式配置）
     * - 输入：源/目标节点的几何（position/width/height）、全局边模式与路径偏好
     * - 行为：仅当边未显式指定 sourceHandle/targetHandle 或类型时，按几何关系分配；
     * - 规则：
     *   1) 把手分配遵循“下出上入、左出右入、上出下入、右出左入”；
     *   2) 路径类型：水平/垂直对齐且距离短→straight；长距或需折线→step；其余→bezier；在智能模式下映射到 SMART_*。
     */
    /**
     * 函数级注释：稳定后统一处理策略（编排层不做类型/端口自动决策）
     * 目标：编排阶段仅透传显式类型与端口；缺省时使用最小回退类型，不进行几何/成本评估。
     * 输出：{ type, sourceHandle, targetHandle }，全部按输入保留或使用简单回退。
     */
    // P1 Refactor: Delegated to EdgeDecisionService
    const edgeDecisionService = new EdgeDecisionService();

    /**
     * 函数级注释：顺序评估连线端口使用计数，分散侧向堆叠
     * 目标：在多入/多出场景下，动态统计每个节点各侧把手的已使用次数，并在后续连线选择中施加惩罚，促使选择不同侧，降低重叠与拥挤。
     */
    const usageSourceMap = new Map<string, Record<string, number>>();
    const usageTargetMap = new Map<string, Record<string, number>>();
    const ensureUsage = (m: Map<string, Record<string, number>>, id: string): Record<string, number> => {
      const existing = m.get(id);
      if (existing) return existing;
      const rec = { l: 0, r: 0, t: 0, b: 0 } as Record<string, number>;
      m.set(id, rec);
      return rec;
    };

    const preferDistinctSidesCfg = Boolean(this.configManager.get<boolean>('diagram.edge.preferDistinctSides', true));
    const processedEdges: Edge[] = [];

    for (const edge of (layoutEdges || data.edges.map(prepareEdgeForLayout))) {
      const originalEdge = data.edges.find((e: StandardEdgeData) => e.id === edge.id) as StandardEdgeData | undefined
      const baseEdge: any = originalEdge ?? edge?.data ?? edge
      const semanticTypeRaw: string = String((baseEdge?.type ?? baseEdge?.kind ?? '') || '').toLowerCase()
      const styleType: EdgeStyleType = styleTypeMap[semanticTypeRaw] || EdgeStyleType.MAIN

      // Domain lookups (needed for data extras)
      const sDomain = idToDomain.get(edge.source)
      const tDomain = idToDomain.get(edge.target)
      const sDomainClass = idToDomainClass.get(edge.source)
      const tDomainClass = idToDomainClass.get(edge.target)

      const renderEdgeTypeFallback: EdgeType = pickEdgeType()

      // Obstacle configs
      const isMain = styleType === EdgeStyleType.MAIN
      const cfgObstacleScopePadding = this.configManager.get<number>('diagram.edge.obstacleScopePadding', 120) || 120
      const cfgObstaclePaddingRaw = this.configManager.get<number>('diagram.edge.obstaclePadding', 26)
      const cfgObstaclePadding = Math.max(22, Math.min(30, typeof cfgObstaclePaddingRaw === 'number' ? cfgObstaclePaddingRaw : 26))

      const dataExtras: Record<string, any> = {}
      if (isMain) {
        const d = (edge?.data || {}) as any
        if (typeof d.obstacleScope === 'undefined') dataExtras.obstacleScope = 'corridor'
        if (typeof d.obstacleScopePadding === 'undefined') dataExtras.obstacleScopePadding = cfgObstacleScopePadding
        if (typeof d.obstaclePadding === 'undefined') dataExtras.obstaclePadding = cfgObstaclePadding
        if (typeof d.routingStrategy === 'undefined') dataExtras.routingStrategy = 'interior-first'
        if (typeof d.pathOptions === 'undefined') dataExtras.pathOptions = { gridRatio: 1.0, avoidOverlap: true }
      }

      const cfgEdgeLocal = cfgEdge as any
      const srcNode = processedNodes.find(n => n.id === edge.source)
      const tgtNode = processedNodes.find(n => n.id === edge.target)

      const presetType: EdgeType | undefined = (edge?.type as EdgeType | undefined)
      const presetSourceHandle: string | null | undefined = (edge as any)?.sourceHandle
      const presetTargetHandle: string | null | undefined = (edge as any)?.targetHandle

      const dirPref = String(((data as any)?.layout?.direction || this.configManager.get<string>('diagram.layout.direction', 'LR')) || 'LR')
      const axisTol = Number(this.configManager.get<number>('diagram.edge.axisAlignTolerance', (cfgEdgeLocal as any)?.axisAlignTolerance ?? 8))
      const hRatio = Number(this.configManager.get<number>('diagram.edge.shortDistanceHRatio', (cfgEdgeLocal as any)?.shortDistanceHRatio ?? 0.6))
      const vRatio = Number(this.configManager.get<number>('diagram.edge.shortDistanceVRatio', (cfgEdgeLocal as any)?.shortDistanceVRatio ?? 0.6))
      const preferOrth = Boolean(this.configManager.get<boolean>('diagram.edge.preferOrthogonalInDomain', (cfgEdgeLocal as any)?.preferOrthogonalInDomain ?? true))
      const orthBias = Number(this.configManager.get<number>('diagram.edge.domainOrthogonalBias', (cfgEdgeLocal as any)?.domainOrthogonalBias ?? 0.7))

      const shouldRunAuto = (enableAutoType || enableAutoHandle);

      const autoDecision = shouldRunAuto
        ? edgeDecisionService.autoDecideHandlesAndType(
          srcNode,
          tgtNode,
          processedNodes,
          preferSmart,
          globalPath,
          enableAutoType,
          presetType,
          presetSourceHandle,
          presetTargetHandle,
          (baseEdge as any)?.role,
          dirPref,
          axisTol,
          hRatio,
          vRatio,
          preferOrth,
          orthBias,
          usageSourceMap,
          usageTargetMap,
          preferDistinctSidesCfg,
          smoothFallback
        )
        : { type: renderEdgeTypeFallback, sourceHandle: presetSourceHandle, targetHandle: presetTargetHandle } as { type: EdgeType; sourceHandle?: string | null; targetHandle?: string | null };

      /**
       * 函数级注释：类型尊重与跨模式转换
       */
      const presetIsSmart = (
        presetType === EdgeType.ADVANCED_SMART_BEZIER ||
        presetType === EdgeType.ADVANCED_SMART_STRAIGHT ||
        presetType === EdgeType.ADVANCED_SMART_STEP
      );
      const presetIsNative = (
        presetType === EdgeType.BEZIER ||
        presetType === EdgeType.SMOOTHSTEP ||
        presetType === EdgeType.STRAIGHT ||
        presetType === EdgeType.STEP ||
        presetType === EdgeType.DEFAULT
      );
      const modeTypeConflict = (preferSmart && presetIsNative) || (!preferSmart && presetIsSmart);
      const respectPresetTypeCfg = Boolean(this.configManager.get<boolean>('diagram.edge.respectPresetType', true));
      const convertTypeForMode = (pt: EdgeType | undefined, toSmart: boolean): EdgeType => {
        const t = pt as EdgeType;
        if (toSmart) {
          if (t === EdgeType.STRAIGHT) return EdgeType.ADVANCED_SMART_STRAIGHT;
          if (t === EdgeType.STEP) return EdgeType.ADVANCED_SMART_STEP;
          return EdgeType.ADVANCED_SMART_BEZIER;
        } else {
          if (t === EdgeType.ADVANCED_SMART_STRAIGHT) return EdgeType.STRAIGHT;
          if (t === EdgeType.ADVANCED_SMART_STEP) return EdgeType.STEP;
          return EdgeType.BEZIER;
        }
      };
      const presetTypeForMode = presetType
        ? (modeTypeConflict ? convertTypeForMode(presetType, preferSmart) : presetType)
        : undefined;
      const finalType = (() => {
        if (enableAutoType) {
          if (presetTypeForMode && respectPresetTypeCfg) return presetTypeForMode;
          return autoDecision.type ?? renderEdgeTypeFallback;
        }
        if (presetTypeForMode) return presetTypeForMode;
        return renderEdgeTypeFallback;
      })();

      /**
       * 函数级注释：把手尊重优先级（显式优先）
       */
      const explicitSrc = typeof presetSourceHandle !== 'undefined' && String(presetSourceHandle || '').toLowerCase() !== 'auto'
      const explicitTgt = typeof presetTargetHandle !== 'undefined' && String(presetTargetHandle || '').toLowerCase() !== 'auto'
      const finalSourceHandle = explicitSrc
        ? presetSourceHandle
        : enableAutoHandle
          ? autoDecision.sourceHandle
          : presetSourceHandle;
      const finalTargetHandle = explicitTgt
        ? presetTargetHandle
        : enableAutoHandle
          ? autoDecision.targetHandle
          : presetTargetHandle;
      const autoSource = !explicitSrc && Boolean(enableAutoHandle)
      const autoTarget = !explicitTgt && Boolean(enableAutoHandle)

      // 记录端口使用计数
      if (srcNode && finalSourceHandle) {
        const rec = ensureUsage(usageSourceMap, srcNode.id);
        const k = String(finalSourceHandle);
        if (rec[k] !== undefined) rec[k] += 1; else rec[k] = 1;
      }
      if (tgtNode && finalTargetHandle) {
        const rec = ensureUsage(usageTargetMap, tgtNode.id);
        const k = String(finalTargetHandle);
        if (rec[k] !== undefined) rec[k] += 1; else rec[k] = 1;
      }

      /**
       * P1改动：单一事实源锁定
       */
      const existingData = (edge?.data || {}) as any
      const lockedAutoSource = autoSource && !finalSourceHandle
      const lockedAutoTarget = autoTarget && !finalTargetHandle

      const policyExtras: Record<string, any> = {
        autoSource: lockedAutoSource,
        autoTarget: lockedAutoTarget
      }
      if (typeof existingData.handleSelectionPolicy === 'undefined') policyExtras.handleSelectionPolicy = handlePolicy
      if (typeof existingData.autoHandle === 'undefined') policyExtras.autoHandle = enableAutoHandle
      if (typeof existingData.autoPathType === 'undefined') policyExtras.autoPathType = enableAutoType
      if (typeof existingData.globalPath === 'undefined') policyExtras.globalPath = globalPath
      if (typeof existingData.edgeMode === 'undefined') policyExtras.edgeMode = globalMode

      // P1: 明确注入最终决策的路径类型
      if (typeof existingData.pathType === 'undefined') policyExtras.pathType = finalType

      const edgeId = baseEdge?.id ?? edge?.id ?? `${edge.source}-${edge.target}`;


      const created = edgeFactory.createEdge({ id: edgeId, source: edge.source, target: edge.target, type: finalType as any, styleType, label: baseEdge?.label ?? edge?.label, animated: (baseEdge?.style as any)?.animated ?? (edge as any)?.animated, strokeWidth: (baseEdge?.style as any)?.strokeWidth ?? (edge as any)?.style?.strokeWidth, strokeColor: (baseEdge?.style as any)?.stroke ?? (edge as any)?.style?.stroke, strokeDasharray: (baseEdge?.style as any)?.strokeDasharray ?? (edge as any)?.style?.strokeDasharray, sourceHandle: (baseEdge?.sourceHandle ?? finalSourceHandle), targetHandle: (baseEdge?.targetHandle ?? finalTargetHandle), markerEnd: (baseEdge as any)?.markerEnd ?? (edge as any)?.markerEnd, markerStart: (baseEdge as any)?.markerStart ?? (edge as any)?.markerStart, data: { ...(baseEdge?.metadata || {}), ...dataExtras, ...policyExtras, ...existingData, sourceDomain: sDomain, targetDomain: tDomain, sourceDomainClass: sDomainClass, targetDomainClass: tDomainClass, layoutDirection: dirPref, edgeType: (edge?.data?.edgeType ?? semanticTypeRaw ?? baseEdge?.type) as any } as any })

      processedEdges.push(created)
    }
    return { nodes: processedNodes, edges: processedEdges, resolvedEdgeConfig }
  }

  /**
   * 函数级注释：域容器左锚规范化（编排层保障）
   * - 目的：无论策略内部是否进行了多阶段位移，这里统一将所有域容器的左边界对齐到配置的锚点；
   * - 行为：对每个 `titleGroup` 计算 dx = anchorLeft - position.x，并同步平移同域的所有成员；保持 measured/style 不变；
   */

}
