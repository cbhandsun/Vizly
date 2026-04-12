import { Node, Edge } from '@xyflow/react';
import { LayoutOptions } from '../types/layout';
import { GridLayoutStrategy } from './nodeLayoutStrategy/GridLayoutStrategy';
import { HorizontalLayoutStrategy } from './nodeLayoutStrategy/HorizontalLayoutStrategy';
import { VerticalLayoutStrategy } from './nodeLayoutStrategy/VerticalLayoutStrategy';
import { CenteredLayoutStrategy } from './nodeLayoutStrategy/CenteredLayoutStrategy';
// 已移除：CytoscapeFcoseLayoutStrategy、CytoscapeConcentricLayoutStrategy、ElkNodeLayoutStrategy
// Elk 节点策略已移除
import { DomainVerticalLayoutStrategy } from './DomainVerticalLayoutStrategy';
import { DomainHorizontalLayoutStrategy } from './DomainHorizontalLayoutStrategy';
import { DomainElkLayoutStrategy } from './DomainElkLayoutStrategy';
// DomainElkRadialLayoutStrategy 已移除
import { DomainDagreLayoutStrategy } from './DomainDagreLayoutStrategy';
import { DagreLayoutStrategy } from './nodeLayoutStrategy/DagreLayoutStrategy';
// 已移除：DomainCytoscapeLayoutStrategy


export interface ILayoutStrategy {
  calculateLayout(nodes: Node[], edges: Edge[], options?: LayoutOptions): Promise<{ nodes: Node[]; edges: Edge[] }> | { nodes: Node[]; edges: Edge[] };
  getName(): string;
  getDescription(): string;
  isApplicable(nodes: Node[], edges: Edge[]): boolean;
  /**
   * 函数级注释：返回策略类别
   * - 'hierarchy'：域/子域/整体编排类策略（如 DomainFirst/Hierarchical/Flow/MainBus/Swimlane 等）
   * - 'node'：域/子域内部节点排布类策略（如 Grid/Horizontal/Vertical/Centered/ElkNode 等）
   */
  getCategory(): 'hierarchy' | 'node';
}

export class LayoutStrategyManager {
  private strategies: Map<string, ILayoutStrategy> = new Map();
  public readonly id: string;
  private static sharedInstance: LayoutStrategyManager | null = null;

  /**
   * 归一化策略名称（支持别名）
   * - 输入统一转小写，移除空格与 '+', '_', '-' 分隔符
   * - 映射常见别名到标准策略名称
   * @param name 原始策略名称（可能为别名，如 'flow'、'main-bus-swimlane'）
   * @returns 标准策略名称（如 'FlowLayout'）或原始名称
   */
  private normalizeName(name: string): string {
    const raw = String(name).trim().toLowerCase();
    const normalized = raw.replace(/\s+/g, '').replace(/[+_-]/g, '');
    const aliasMap: Record<string, string> = {
      // MainBus 布局（已移除：统一回退到域纵向布局）
      mainbus: 'DomainVerticalLayout',
      mainbuslayout: 'DomainVerticalLayout',
      // Swimlane 布局（回退）
      swimlane: 'DomainVerticalLayout',
      swimlanelayout: 'DomainVerticalLayout',
      // MainBus + Swimlane 复合布局名称：统一回退到域纵向编排以生成域容器并避免重叠
      mainbusswimlane: 'DomainVerticalLayout',
      mainbusswimlanelayout: 'DomainVerticalLayout',
      mainbuswimlane: 'DomainVerticalLayout',
      mainbuspluswimlane: 'DomainVerticalLayout',
      mainbusandswimlane: 'DomainVerticalLayout',
      // Grid 布局
      grid: 'GridLayout',
      gridlayout: 'GridLayout',
      // Horizontal 布局
      horizontal: 'HorizontalLayout',
      horizontallayout: 'HorizontalLayout',
      // Vertical 布局
      vertical: 'VerticalLayout',
      verticallayout: 'VerticalLayout',
      // Centered 布局
      centered: 'CenteredLayout',
      centeredlayout: 'CenteredLayout',
      // Cytoscape fcose 节点布局
      cytoscape: 'HorizontalLayout',
      cytoscapelayout: 'HorizontalLayout',
      fcose: 'HorizontalLayout',
      cytoscapefcose: 'HorizontalLayout',
      cytoscapefcoselayout: 'HorizontalLayout',
      concentric: 'HorizontalLayout',
      cytoscapeconcentric: 'HorizontalLayout',
      cytoscapeconcentriclayout: 'HorizontalLayout',
      elk: 'DomainElkLayout',
      elknode: 'HorizontalLayout',
      elknodelayout: 'HorizontalLayout',
      domainelk: 'DomainElkLayout',
      domainelklayout: 'DomainElkLayout',
      // DomainElkCompound 布局（已移除，回退到 DomainElkLayout）
      domainelkcompound: 'DomainElkLayout',
      elkcompound: 'DomainElkLayout',
      compoundelk: 'DomainElkLayout',
      domainelkfull: 'DomainElkLayout',
      domaincytoscape: 'DomainVerticalLayout',
      domaincytoscape_layout: 'DomainVerticalLayout',
      domaincytoscapefcose: 'DomainVerticalLayout',
      domainfcose: 'DomainVerticalLayout',
      center: 'CenteredLayout',
      // Hierarchical 层次布局（已移除：统一回退到域纵向布局）
      hierarchical: 'DomainVerticalLayout',
      hierarchic: 'DomainVerticalLayout',
      hierarchicallayout: 'DomainVerticalLayout',
      // Domain-Vertical 域纵向布局
      domainvertical: 'DomainVerticalLayout',
      domainverticallayout: 'DomainVerticalLayout',
      // Domain-Horizontal 域横向布局
      domainhorizontal: 'DomainHorizontalLayout',
      domainhorizontallayout: 'DomainHorizontalLayout',
      // 兼容历史别名：将最小集映射到域纵向
      domainminimal: 'DomainVerticalLayout',
      domainminimallayout: 'DomainVerticalLayout',
      minimal: 'DomainVerticalLayout',

      // layered/advanced → 统一回退到域纵向布局
      layered: 'DomainVerticalLayout',
      layereddomain: 'DomainVerticalLayout',
      layereddomainlayout: 'DomainVerticalLayout',
      'layered-domain': 'DomainVerticalLayout',
      advancedelk: 'DomainVerticalLayout',
      advancedelklayout: 'DomainVerticalLayout',
      // Mermaid 风格布局（已移除，回退到 DomainElkLayout）
      mermaid: 'DomainElkLayout',
      mermaidlike: 'DomainElkLayout',
      mermaidlayout: 'DomainElkLayout',
      mermaidlikelayout: 'DomainElkLayout',

      // Radial 径向布局（已移除，回退到 DomainElkLayout）
      radial: 'DomainElkLayout',
      radiallayout: 'DomainElkLayout',
      elkradial: 'DomainElkLayout',
      domainelkradial: 'DomainElkLayout',

      // Force 力导向布局（已移除，回退到 DomainElkLayout）
      force: 'DomainElkLayout',
      forcelayout: 'DomainElkLayout',
      elkforce: 'DomainElkLayout',
      domainelkforce: 'DomainElkLayout',
      organic: 'DomainElkLayout',

      // True Radial 真径向布局（已移除，回退到 DomainElkLayout）
      trueradial: 'DomainElkLayout',
      trueradiallayout: 'DomainElkLayout',
      elktrueradial: 'DomainElkLayout',
      domainelktrueradial: 'DomainElkLayout',
      concentricradial: 'DomainElkLayout',
      nativeradial: 'DomainElkLayout',

      // Dagre 分层布局
      dagre: 'DomainDagreLayout',
      dagrelayout: 'DomainDagreLayout',
      domaindagre: 'DomainDagreLayout',
      dagrelayered: 'DomainDagreLayout',
      semanticlayout: 'DomainDagreLayout',

    };
    return aliasMap[normalized] || name;
  }

  /**
   * 构造函数：初始化并自动注册内置布局策略
   * 目的：避免因入口文件加载顺序或模块别名造成的未注册问题，确保首次使用即可获取策略。
   */
  constructor() {
    this.id = `manager-${Math.random().toString(36).substr(2, 9)}`;

    // 自动注册内置策略，保证策略在任何导入路径下均可用
    try {
      this.register(new GridLayoutStrategy());
      this.register(new HorizontalLayoutStrategy());
      this.register(new VerticalLayoutStrategy());
      this.register(new CenteredLayoutStrategy());
      // 节点策略精简：移除 Cytoscape/Elk 的节点级策略
      this.register(new DomainVerticalLayoutStrategy());
      this.register(new DomainHorizontalLayoutStrategy());
      // Elk 节点策略已移除
      this.register(new DomainElkLayoutStrategy());
      // DomainElkRadialLayoutStrategy 已移除
      this.register(new DomainDagreLayoutStrategy());
      // 注册 Dagre 节点布局策略
      this.register(new DagreLayoutStrategy());
      // 仅保留统一的域纵向策略作为域编排实现

    } catch (e) {
      console.warn('Auto-register layout strategies failed:', e);
    }

    // ⭐ 启动审计日志
    console.info('[LayoutStrategy] Registered:', Array.from(this.strategies.keys()).join(', '));
  }

  /**
   * 获取共享单例实例
   * 函数级注释：
   * - 避免在多个组件中重复实例化与注册策略，减少日志噪声与初始化开销；
   * - 首次调用时创建并注册内置策略，后续复用同一实例。
   */
  public static getShared(): LayoutStrategyManager {
    if (!this.sharedInstance) {
      this.sharedInstance = new LayoutStrategyManager();
    }
    return this.sharedInstance;
  }

  public register(strategy: ILayoutStrategy): void {
    if (strategy && typeof strategy.getName === 'function') {
      this.strategies.set(strategy.getName(), strategy);
    }
  }

  /**
   * 获取策略实例（支持别名与标准名称）
   * - 先将输入名称进行别名归一化，再尝试从注册表获取
   * - 若别名未命中，回退尝试使用原始名称
   */
  getStrategy(name: string): ILayoutStrategy | undefined {
    const normalized = this.normalizeName(name);
    return this.strategies.get(normalized) || this.strategies.get(name);
  }

  getAvailableStrategies(): { type: string; strategy: ILayoutStrategy }[] {
    return Array.from(this.strategies.entries()).map(([type, strategy]) => ({ type, strategy }));
  }

  /**
   * 获取节点布局策略列表（函数级注释）
   * - 依据策略的 getCategory 返回值筛选，避免名称集合的人为遗漏与混淆
   */
  getAvailableNodeStrategies(): { type: string; strategy: ILayoutStrategy }[] {
    return this.getAvailableStrategies().filter(s => {
      try { return s.strategy.getCategory() === 'node'; } catch { return false; }
    });
  }

  /**
   * 获取层次/整体布局策略列表（函数级注释）
   * - 依据策略的 getCategory 返回值筛选
   */
  getAvailableHierarchyStrategies(): { type: string; strategy: ILayoutStrategy }[] {
    return this.getAvailableStrategies().filter(s => {
      try { return s.strategy.getCategory() === 'hierarchy'; } catch { return false; }
    });
  }

  /**
   * 函数级注释：根据整体布局策略返回推荐的节点布局策略名称
   * - 输入：整体布局策略名称（支持别名）；可选节点与边集合用于密度启发
   * - 规则：
   *   DomainVerticalLayout → HorizontalLayout
   *   DomainHorizontalLayout → VerticalLayout
   *   DomainElkLayout → 密度高选 CytoscapeFcoseLayout，否则选 ElkNodeLayout
   *   DomainCytoscapeLayout → CytoscapeFcoseLayout
   *   其它 → HorizontalLayout
   */
  public getPreferredNodeStrategyForHierarchy(name: string, nodes?: Node[], edges?: Edge[]): string {
    const norm = this.normalizeName(name).toLowerCase();
    const nodeCount = Array.isArray(nodes) ? nodes.length : 0;
    const edgeCount = Array.isArray(edges) ? edges.length : 0;
    const dense = (nodeCount >= 24) || (edgeCount >= nodeCount && nodeCount > 0) || (edgeCount >= 24);
    if (norm === 'domainverticallayout' || norm === 'domainvertical') return 'DagreLayout';
    if (norm === 'domainhorizontallayout' || norm === 'domainhorizontal') return 'DagreLayout';
    if (norm === 'domainelklayout' || norm === 'domainelk') return 'HorizontalLayout';
    if (norm === 'domaincytoscapelayout' || norm === 'domaincytoscape' || norm === 'domainfcose' || norm === 'domaincytoscapefcose') return 'HorizontalLayout';
    return 'HorizontalLayout';
  }

  /**
   * 函数级注释：当前整体布局是否允许外部独立选择节点布局
   * - 域 ELK 与 域 Cytoscape 为整体编排，节点布局由策略内部决定 → 返回 false
   * - 其他布局允许外部选择 → 返回 true
   */
  public isNodeLayoutExternallySelectable(name: string): boolean {
    const norm = this.normalizeName(name).toLowerCase();
    // ELK 通用策略：内部控制或由 ELK 算法参数控制
    if (norm === 'domainelklayout' || norm === 'domainelk') return false;
    // ELK 复合/Mermaid/Force/TrueRadial 策略已移除，别名均回退到 DomainElkLayout
    // 因此无需在此额外判断（已被 domainelklayout 覆盖）
    // Dagre 分层布局：使用 Dagre 算法自行管理节点布局
    if (norm === 'domaindagrelayout' || norm === 'domaindagre' || norm === 'dagre' || norm === 'dagrelayout' || norm === 'dagrelayered' || norm === 'semanticlayout') return false;
    return true;
  }
}
