import type { ComponentType } from 'react';
import type { MenuProps } from 'antd';
import type { Edge, Node } from '@xyflow/react';
import type { ILayoutStrategy } from './layout-strategy';
import { NodeData, EdgeData, DiagramConfig } from './common';
import { LayoutType } from './layout';

export type DiagramExportFormat = 'pdf' | 'svg';
export type DiagramSaveResult = void | 'cancelled';

export type DiagramCollaborationStatus =
  | 'inactive'
  | 'unavailable'
  | 'connecting'
  | 'connected'
  | 'disconnected';

export interface DiagramPanelRenderControls {
  onClose: () => void;
}

export interface DiagramBusinessData extends Record<string, unknown> {
  id?: string;
}

export interface DiagramCollaborationAwareness {
  clientID?: unknown;
  setLocalStateField: (field: string, value: unknown) => void;
}

export interface ResolvedEdgeConfig {
  mode: 'advanced-smart' | 'native';
  pathType?: string;
  smoothFallback?: string;
  autoPathType?: boolean;
  autoHandle?: boolean;
  handleSelectionPolicy?: string;
}

/**
 * @interface DiagramComponentProps
 */

// 图表组件属性接口
export interface DiagramComponentProps {
  /** 插件 ID，用于在统一框架下挂载不同数据流面板 */
  pluginId?: string;
  /** 图表唯一标识 */
  id?: string;
  /** 图表配置 */
  config?: DiagramConfig;
  /** 自定义样式类名 */
  className?: string;
  /** 图表标题 */
  title?: string;
  /** 是否显示控制面板 */
  showControls?: boolean;
  /** 是否显示小地图 */
  showMiniMap?: boolean;
  /** 小地图是否可平移 */
  miniMapPannable?: boolean;
  /** 主题名称 */
  theme?: string;
  /** 布局 */
  layout?: LayoutType;
  /** 边连接模式 */
  edgeMode?: 'advanced-smart' | 'native';
  /** 容器宽度 */
  width?: number;
  /** 布局策略 - 支持策略对象或策略名称字符串 */
  layoutStrategy?: ILayoutStrategy | string;
  /** 节点布局策略（函数级注释）
   * - 仅用于域/子域内部节点的排布，如 Grid/Horizontal/Vertical/Centered
   * - 与整体层次布局（layoutStrategy）分离，切换后应触发重新编排
   */
  nodeLayoutStrategy?: string;
  /** ELK 算法名称 */
  elkAlgorithm?: string;
  /** 主流程动线状态变化回调 */
  onMainFlowAnimationChange?: (enabled: boolean) => void;
  /** 是否高亮主流程动线 */
  highlightMainFlow?: boolean;
  /** 是否仅显示主流程（动线） */
  showOnlyMainFlow?: boolean;
  /** 是否仅显示主流程状态变化回调 */
  onShowOnlyMainFlowChange?: (enabled: boolean) => void;
  /** 是否开启全局只读与防拖拽挂锁模式 */
  isReadonly?: boolean;
  businessData?: DiagramBusinessData;
  /** 供特定 SaaS 端游离于主代码外的增强导出菜单，通过 ContextMenuProps 等传入 */
  extraExportItems?: MenuProps['items'];
  /** (IoC) 由宿主校验商业导出权限；返回 false 时阻止导出动作。 */
  onExportPermissionCheck?: (format: DiagramExportFormat) => boolean;

  // ==========================================
  // 商业化/SaaS 层控制反转 (IoC) Props (Phase 5)
  // ==========================================
  /** (IoC) YJS/云同步是否已连接 */
  isYjsSynced?: boolean;
  /** (IoC) 协作会话的可见连接状态。 */
  collaborationStatus?: DiagramCollaborationStatus;
  /** (IoC) 打开实时协作详情。 */
  onOpenCollaboration?: () => void;
  /** (IoC) 本地状态改变时推送给云协作端 */
  onSyncPush?: (nodes: Node[], edges: Edge[]) => void;
  /** (IoC) Active remote users for cursors */
  activeUsers?: unknown[];
  /** (IoC) Yjs Awareness for local cursor tracking */
  yAwareness?: DiagramCollaborationAwareness;
  /** (IoC) 触发云端保存 (Legacy) */
  onCloudSave?: () => Promise<DiagramSaveResult>;
  /** (IoC) 触发直接覆盖保存 */
  onDirectSave?: () => Promise<void>;
  /** (IoC) 当前是否允许直接覆盖保存 */
  isDirectSaveDisabled?: boolean;

  /** (IoC) 分享面板可见状态 */
  shareDialogOpen?: boolean;
  /** (IoC) 打开分享面板 */
  onOpenShareDialog?: () => void;
  /** (IoC) 关闭分享面板 */
  onCloseShareDialog?: () => void;
  /** (IoC) 确保内容已保存才能分享 */
  onEnsureSaved?: () => Promise<boolean | string>;
  /** (IoC) 渲染 AI 会话面板 */
  renderAIChatPanel?: (controls: DiagramPanelRenderControls) => React.ReactNode;
  /** (IoC) 渲染 AI 配置弹窗 */
  renderAIConfigModal?: React.ReactNode;
  /** (IoC) 渲染分享弹窗 */
  renderShareDialog?: React.ReactNode;
  /** (IoC) 渲染主题样式面板 */
  renderThemeSelector?: React.ReactNode;
  /** (IoC) 是否在 AI 助手入口展示 Pro 徽章 */
  showAiCrown?: boolean;
  /** (IoC) AI 面板/按钮被点击时的权限拦截器，返回 false 则阻止进一步打开 */
  onAiTabIntercept?: () => boolean;
  
  // ==========================================
  // 组件库/模板扩展 Props
  // ==========================================
  /** 导入模板回调 */
  onImportTemplate?: () => void;
  /** 拖拽组件回调 */
  onDropComponent?: (componentType: string, position: { x: number; y: number }) => void;
  /** 顶部工具栏额外扩展区域 (支持接入诸如 Cascader 预设等模块) */
  topActionArea?: React.ReactNode;
  /** 只读状态变更开关回调 (用于解锁及锁定编辑防护) */
  onReadonlyChange?: (isReadonly: boolean) => void;
  /** 触发打开高级偏好设置回调 */
  onOpenSettings?: () => void;
  /** (IoC) 由宿主统一打开命令面板，避免嵌套编辑器重复渲染面板 */
  onOpenCommandPalette?: () => void;
  /** (IoC) 是否打开版本历史面板 */
  isVersionHistoryOpen?: boolean;
  /** (IoC) 打开版本历史面板回调 */
  onOpenVersionHistory?: () => void;
  /** (IoC) 关闭版本历史面板回调 */
  onVersionHistoryClose?: () => void;
  /** (IoC) 应用层提供版本历史实现，核心画布不直接依赖存储/UI 适配器 */
  renderVersionHistoryPanel?: (props: {
    diagramId: string;
    isOpen: boolean;
    onClose: () => void;
  }) => React.ReactNode;
  /** (IoC) 应用层按需提供标准布局预设，核心布局逻辑不直接依赖数据注册表 */
  loadLayoutPresetMap?: () => Promise<Record<string, unknown>>;
}

// 图表数据接口
export interface DiagramData {
  /** 节点数据 */
  nodes: NodeData[];
  /** 边数据 */
  edges: EdgeData[];
  /** 图表配置 */
  config?: DiagramConfig;
}

// 图表定义接口
export interface DiagramDefinition {
  /** 图表唯一标识 */
  id: string;
  /** 图表显示名称 */
  name: string;
  /** Translation key for the title */
  titleKey?: string;
  /** 图表组件 */
  component: ComponentType<DiagramComponentProps>;
  /** 图表数据（可选，某些组件内部定义数据） */
  data?: DiagramData;
  /** 图表描述 */
  description?: string;
  /** 图表分类 */
  category?: 'architecture' | 'logistics' | 'systems' | 'transport' | 'warehouse' | 'sub-system' | 'business' | 'tech' | 'debug' | 'tool' | 'other';
  /** 图表标签 */
  tags?: string[];
  /** 图标 */
  icon?: ComponentType | string;
  /** 是否支持布局策略切换（主视图顶栏启用条件） */
  supportsLayoutSwitch?: boolean;
  /** 是否支持“仅显示主流程（动线）”开关（更多菜单启用条件） */
  supportsMainFlowToggle?: boolean;
}

// 图表菜单项接口
export interface DiagramMenuItem {
  /** 菜单项ID */
  id: string;
  /** 菜单项标题 */
  title: string;
  /** 菜单项图标 */
  icon?: string;
  /** 是否激活 */
  active?: boolean;
  /** 点击处理函数 */
  onClick?: () => void;
}

// 图表控制器接口
export interface DiagramController {
  /** 适应视图 */
  fitView: () => void;
  /** 缩放到顶部 */
  fitWidthTop: () => void;
  /** 导出为PNG */
  exportToPNG: () => Promise<void>;
  /** 导出为PDF */
  exportToPDF: () => Promise<void>;
  /** 切换全屏 */
  toggleFullscreen: () => void;
}

// 图表状态接口
export interface DiagramState {
  /** 当前选中的图表ID */
  selectedDiagramId: string;
  /** 菜单是否折叠 */
  isMenuCollapsed: boolean;
  /** 是否全屏模式 */
  isFullscreen: boolean;
  /** 当前主题 */
  currentTheme: string;
  /** 边连接模式 */
  edgeMode: 'advanced-smart' | 'native';
  /** 是否正在过渡 */
  isTransitioning: boolean;
}

// 图表操作类型
export type DiagramAction =
  | { type: 'SELECT_DIAGRAM'; payload: string }
  | { type: 'TOGGLE_MENU'; payload?: boolean }
  | { type: 'TOGGLE_FULLSCREEN'; payload?: boolean }
  | { type: 'SET_THEME'; payload: string }
  | { type: 'SET_EDGE_MODE'; payload: 'advanced-smart' | 'native' }
  | { type: 'SET_TRANSITIONING'; payload: boolean };
