import React from 'react';
import type { Node, Edge } from '@xyflow/react';

/** 命令面板分组类型 */
export type CommandGroup = 'favorites' | 'recent' | 'actions' | 'diagrams';

/** 命令面板项定义 */
export interface CommandItem {
  id: string;
  group: CommandGroup;
  title: string;
  description?: string;
  keywords?: string[];
  meta?: string[];
  shortcut?: string;
  onSelect: () => void;
  onAltSelect?: () => void;
}

export interface SidebarPanel {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export interface KeyboardShortcut {
  /** 控制函数，判断当前键盘事件是否符合触发条件 */
  trigger: (event: KeyboardEvent) => boolean;
  /** 执行指令 */
  action: (ctx: PluginContext) => void;
  /** 人类可读描述，用于命令面板或帮助说明 */
  description: string;
}



export interface PropertyEditorExtension {
  id: string;
  matchNode?: (node: Node) => boolean;
  matchEdge?: (edge: Edge) => boolean;
  component: React.ComponentType<{ selectedElement: Node | Edge; onUpdate: (data: any) => void }>;
}

export interface PluginContext {
  // Stable Getters (prevents render thrashing)
  getNodes: () => Node[];
  getEdges: () => Edge[];
  
  // Safe Mutators (auto snapshotting)
  updateNodesBatch: (nodeIds: string[], updates: any) => void;
  updateEdgesBatch: (edgeIds: string[], updates: any) => void;
  takeSnapshot: () => void;

  // Raw State (Deprecated for direct use, kept for backward compat inside specific effects)
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  
  reactFlowInstance?: any;
  diagramId?: string;

  /** 
   * [NEW] 在画布中心或指定位置添加节点 (GAP-11 Mobile Tap-to-Add)
   */
  addNode: (type: string, data?: any, position?: { x: number, y: number }) => string;
  
  // ====== 插件状态沙箱 (Plugin State Sandbox) ======
  /** 获取当前激活插件的独立持久化状态 */
  getPluginState?: <T>() => T | undefined;
  /** 更新当前激活插件的独立持久化状态 (支持增量 patch) */
  setPluginState?: <T>(patch: Partial<T> | ((prev: T) => T)) => void;
}

export interface DiagramTypePlugin {
  /** 唯一标识 */
  id: string;
  /** 人类可读名称 */
  name: string;
  /** 图标 */
  icon?: React.ReactNode;
  
  /** 插件数据结构兼容版本号，用于自动拦截并触发清洗机制 */
  version?: string;

  // ====== 市场元数据 (Marketplace Metadata) ======
  /** 插件用途的精炼描述 */
  description?: string;
  /** 作者或组织名称 */
  author?: string;
  /** 分类，用于市场筛选 */
  category?: 'Core' | 'Productivity' | 'Integration' | 'Beta';
  /** 功能标签 */
  tags?: string[];
  /** 预览图 URL (或 icon 增强) */
  previewImage?: string;
  /** 品牌主题色，用于市场卡片边框 */
  brandColor?: string;

  // ====== 数据模型 ======
  /** 将外部数据源解析为 ReactFlow nodes/edges */
  parseData(source: unknown): { nodes: Node[]; edges: Edge[] };
  /** 将 ReactFlow 状态序列化回领域数据 */
  serializeData(nodes: Node[], edges: Edge[]): unknown;
  /** 生命周期：捕获旧版本数据并洗牌升迁至当前最新结构 */
  migrate?(oldData: unknown, oldVersion: string): unknown;
  /** 创建空白画布的初始数据 */
  getEmptyState(): { nodes: Node[]; edges: Edge[] };

  // ====== 布局 ======
  /** 返回该类型支持的布局策略名称列表 */
  getSupportedLayouts(): string[];
  /** 返回默认布局策略名称 */
  getDefaultLayout(): string;

  // ====== 渲染 ======
  /** 注册该类型专用的自定义 NodeType */
  getNodeTypes(): Record<string, React.ComponentType<any>>;
  /** 注册该类型专用的自定义 EdgeType */
  getEdgeTypes(): Record<string, React.ComponentType<any>>;

  // ====== UI 扩展 ======
  /** 工具栏扩展区域（如标准图的模板选择器） */
  contributeToolbar?(ctx: PluginContext): React.ReactNode;
  /** 侧边栏面板项（如标准图的 JSON 编辑器） */
  contributeSidebarPanels?(ctx: PluginContext): SidebarPanel[];

  /** 画布内的覆盖层组件（如时间线标尺） */
  contributeCanvasComponents?(ctx: PluginContext): React.ReactNode;
  /** 属性面板扩展（内部按需） */
  contributePropertyEditors?(ctx: PluginContext): PropertyEditorExtension[];
  // ====== 右键与悬浮工具栏 ======
  /** 整体覆盖右侧属性面板组件 (彻底替换默认的属性表单) */
  renderCustomPropertyPanel?(ctx: PluginContext, selectedNodes: Node[], selectedEdges: Edge[]): React.ReactNode;
  /** 动态向右键菜单注入附加动作 */
  contributeContextMenu?(element: Node | Edge | null, ctx: PluginContext): import('antd').MenuProps['items'];
  /** 动态向当前选中节点的悬浮工具栏 (Hover Toolbar) 注入额外按钮或组件 */
  contributeHoverActions?(selectedNodes: Node[], selectedEdges: Edge[], ctx: PluginContext): React.ReactNode;
  
  // ====== 快捷键与指令 ======
  /** 注册插件自定义全局快捷键 */
  contributeShortcuts?(ctx: PluginContext): KeyboardShortcut[];
  /** 注册插件自定义按需全局指令，会被自动吸附进 Ctrl+K 的全局命令面板中 */
  contributeCommands?(ctx: PluginContext): import('../components/ui/CommandPalette').CommandItem[];

  // ====== 被动监听钩子 (Passive Event Observers) ======
  /** 插件初始化生命周期 */
  onInit?(ctx: PluginContext): void;
  /** 插件销毁生命周期 */
  onDestroy?(ctx: PluginContext): void;
  /** 节点或连线选中状态变更时触发 */
  onSelectionChange?(selectedNodes: Node[], selectedEdges: Edge[], ctx: PluginContext): void;
  /** 画布视野 (缩放、平移) 发生变更时触发 */
  onViewportChange?(viewport: { x: number; y: number; zoom: number }, ctx: PluginContext): void;
  /** 图表数据被动保存或同步时调用 (方便插件做扩展持久化记录) */
  onDataSync?(nodes: Node[], edges: Edge[], isAutoSave: boolean, ctx: PluginContext): void;

  // ====== 生命周期拦截器 (Interceptors) ======
  /** 连线校验拦截器，返回 false 则阻止连接（并显示不可连接的视觉效果） */
  onValidateConnection?(connection: import('@xyflow/react').Connection, ctx: PluginContext): boolean | Promise<boolean>;
  /** 节点删除拦截器，支持异步拦截（例如需要请求网络查锁），返回 false 则阻止指定的节点及级联被删除 */
  onBeforeNodesDelete?(nodes: Node[], ctx: PluginContext): boolean | Promise<boolean>;
  /** 连线删除拦截器，支持异步拦截，返回 false 则阻止指定的连线被删除 */
  onBeforeEdgesDelete?(edges: Edge[], ctx: PluginContext): boolean | Promise<boolean>;
  
  // ====== UI 屏蔽与精简 ======
  /** 彻底隐藏统一设计器的左侧完整边栏 (图形库、大纲树等)，一般给予专业领域插件 (如甘特图) 使用 */
  hideDefaultSidebar?: boolean;
  /** 彻底隐藏节点选中时的悬浮格式刷/排列工具栏，不显示任何基础节点编辑选项 */
  hideContextToolbar?: boolean;
  /** 彻底隐藏右下角的 2D 小地图 (常用于 Gantt 这种纯 1D 网格化布局应用) */
  hideMiniMap?: boolean;
  /** 完全隐藏上方通用顶部栏，将主控权让出 */
  hideDefaultHeader?: boolean;
  /** 禁用画布空白处的双击唤出“快速添加菜单”功能 */
  disablePaneDoubleClick?: boolean;
  /** 隐藏通用工具条中的 2D 缩放控制键 */
  hideZoomControls?: boolean;
  /** 隐藏通用工具条中的各种布局与路由按钮 */
  hideLayoutControls?: boolean;
  /** 隐藏通用工具条中的底图/网格样式按钮 */
  hideGridControls?: boolean;
  /** 隐藏通用工具条中的主链路（高亮/精简）功能组按钮 */
  hideFlowFocusControls?: boolean;
  /** 隐藏通用工具条中的撤销/重做/历史控制键 */
  hideUndoRedoControls?: boolean;
  /** 完全隐藏统一设计器的中间主工具栏 (通常对于第三方自渲染画布有用) */
  hideCenterIsland?: boolean;

  // ====== 行为 ======
  /** 节点拖入画布时的默认数据工厂 */
  createNodeData?(type: string): Record<string, any>;
  /** 是否支持域/子域分组 */
  supportsGrouping?: boolean;
  /** 是否支持智能路由 */
  supportsSmartRouting?: boolean;

  // ====== AI & 指令自动化 (GAP-10 Phase 2) ======
  /** 
   * 处理 AI 生成的领域特定指令。
   * 返回 true 表示已处理，false 表示忽略或由系统默认处理程序接管。
   */
  onAIAction?(action: string, params: any, ctx: PluginContext): boolean | Promise<boolean>;
}

export interface AIActionContext {
  action: string;
  params: any;
  pluginId: string;
  timestamp: number;
}
