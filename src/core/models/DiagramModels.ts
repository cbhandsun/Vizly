/**
 * 统一的图表数据模型
 * 定义标准化的数据结构，支持所有类型的架构图
 */

import type { Node, Edge, Position as ReactFlowPosition, XYPosition } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { Theme } from '../themes/types/ThemeTypes';

// === 基础类型定义 ===

/**
 * 域主题配置
 */
export interface DomainTheme {
  border: string;
  main?: string;
  light?: string;
  text?: string;
  background?: string;
}

// XYPosition is now imported from @xyflow/react directly to ensure compatibility.
// If you need it here, you can also export it from common.ts.

/**
 * 尺寸信息
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * 内边距配置
 */
export interface Padding {
  horizontal: number;
  vertical: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

// === 节点数据模型 ===

/**
 * 标准节点数据
 */
export interface StandardNodeData {
  id: string;
  /**
   * 节点描述文案（统一使用此字段进行渲染与测量）
   * 函数级注释：为避免与 label 混淆，节点层全面改用 description。
   */
  description: string;
  /**
   * 已弃用：节点标签（仅为兼容历史数据保留为可选）
   * 说明：请改用 description；渲染与布局不再读取该字段。
   */
  label?: string;
  type: string;
  domain: string;
  domainClass?: string;
  subDomain?: string;
  sequence?: number;
  order?: number;
  role?: string;
  parent?: string;
  width?: number;
  height?: number;
  zIndex?: number;
  style?: CSSProperties | Record<string, any>;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
  measured?: { width: number; height: number };
  [key: string]: any;
}

/**
 * @interface StandardEdgeData
 * @description 标准边数据模型，用于定义系统中边的核心属性。
 */
export interface StandardEdgeData {
  id: string;
  source: string;
  target: string;
  type: string;
  markerEnd?: any;
  markerStart?: any;
  label?: string;
  metadata?: Record<string, any>;
  zIndex?: number; // 添加 zIndex 属性
  style?: CSSProperties; // 添加 style 属性
  sourceHandle?: string; // 新增：源Handle ID
  targetHandle?: string; // 新增：目标Handle ID
}

/**
 * @interface GroupNodeData
 * @description 定义了分组节点的数据结构，用于可视化地组织和管理一组相关的子节点。
 */
export interface GroupNodeData extends StandardNodeData {
  id: string; // 添加 id 属性
  type: string; // 明确指出 type 是必需的
  /**
   * 分组标题文本（函数级注释）
   * 已统一改用 description 进行渲染；label 改为可选，仅保留兼容性。
   */
  label?: string;
  sourcePosition?: ReactFlowPosition; // 使用 React Flow 的 Position 枚举
  targetPosition?: ReactFlowPosition; // 使用 React Flow 的 Position 枚举
  /**
   * 分组描述文案（函数级注释）
   * 建议统一使用该字段作为显示与测量依据，避免 label 混淆。
   */
  description: string; // 使其与 StandardNodeData 保持一致
  domain: string; // 使其与 StandardNodeData 保持一致
  parent?: string;
  parentId?: string; // 新增：支持 React Flow 的 parentId
  dragHandle?: string; // 新增：支持 React Flow 的 dragHandle
  shape?: string;
  measured: {
    width: number;
    height: number;
  };
  data: StandardNodeData;
  position: XYPosition;
  [key: string]: any;
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  type: 'main' | 'dependency' | 'data' | 'support' | 'feedback' | 'system' | 'exception';
  label?: string;
  style?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    animated?: boolean;
  };
  zIndex?: number;
  metadata?: Record<string, any>;
}

// === 布局数据模型 ===

/**
 * 布局元数据
 */
export interface LayoutMetadata {
  type: 'hierarchical' | 'flow' | 'grid' | 'custom' | 'swimlane' | 'main-bus' | 'main-bus-swimlane' | 'matrix-grid';
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  /** 自动方向选择（用于层次/域内层次） */
  autoDirection?: boolean;
  spacing: {
    horizontal: number;
    vertical: number;
  };
  busGap?: number;
  padding: Padding;
  /** 是否生成域容器（泳道/TitleGroup） */
  generateDomainGroups?: boolean;
  /** 是否生成子域容器（SubGroup） */
  generateSubDomainGroups?: boolean;
  /** 子域白名单，仅为列表中的子域创建容器 */
  subDomainWhitelist?: string[];
  /** 域白名单，仅为列表中的域创建域容器 */
  domainWhitelist?: string[];
  constraints?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  /** 主干对齐模式：'top' | 'baseline' */
  busAlign?: 'top' | 'baseline';
  /** 域标题高度（用于泳道与群组安全留白） */
  domainTitleHeight?: number;
  /** 分组内边距（用于群组安全留白） */
  groupPadding?: number | { H: number; V: number };
  /** 每行最大节点数（用于附件行分配） */
  rowWrap?: { maxItemsPerRow?: number };
  /** 泳道/分层域顺序（函数级注释）
   * - 用于显式控制域的排列顺序（如 source→core→sink 或顶向下 TB）
   * - 支持填入不存在的域键；策略应自行过滤无效域键
   */
  laneOrder?: string[];
  /** 域顺序（函数级注释）
   * - 用于显式控制顶层域的排列顺序；优先于策略中的默认域集合顺序
   */
  domainOrder?: string[];
  /** 子域顺序（函数级注释）
   * - 支持两种形态：
   *   1) 全局顺序：string[]
   *   2) 按域定制：Record<domain, string[]>
   * - 当提供时，策略在域内对子域排序时优先使用该顺序
   */
  subDomainOrder?: string[] | Record<string, string[]>;
  /** 是否使域内容自适应（函数级注释） */
  fitDomainContent?: boolean;
}

/**
 * 布局配置
 */
export interface LayoutConfig {
  NODE_WIDTH: number;
  NODE_HEIGHT: number;
  NODE_PADDING: Padding;
  SPACING: {
    H: number;
    V: number;
  };
  COLS?: Record<string, number>;
  ROWS?: Record<string, number>;
  [key: string]: any;
}

// === 主题数据模型 ===

/**
 * 主题元数据
 */
export interface ThemeMetadata {
  name: string;
  displayName: string;
  domains: Record<string, DomainTheme>;
  isCustom?: boolean;
}

// === 完整图表数据模型 ===

/**
 * 标准图表数据
 */
export interface StandardDiagramData {
  id: string;
  name: string;
  type: DiagramType;
  version: string;
  nodes: StandardNodeData[];
  edges: StandardEdgeData[];
  groups?: GroupNodeData[];
  layout: LayoutMetadata;
  theme: ThemeMetadata;
  config?: LayoutConfig;
  metadata?: {
    title?: string;
    description?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    icon?: string;
    themeId?: string;
    preview?: {
      mime: string;
      dataUrl: string;
      width: number;
      height: number;
      generatedAt?: string;
    };
    cloud?: {
      provider: 'supabase' | 's3';
      id: string;
      title?: string;
      openedAt?: string;
    };
  };
  isReadonly?: boolean;
}

/**
 * 图表类型枚举
 */
export type DiagramType =
  | 'architecture'
  | 'logistics'
  | 'tms'
  | 'wms'
  | 'wms-process'
  | 'advanced-wms-process'
  | 'transport-driven'
  | 'warehouse-driven'
  | 'systems-interaction'
  | 'logistics-planning'
  | 'mindmap'
  | 'timeline'
  | 'flowchart'
  | 'swimlane'
  | 'er-diagram'
  | 'custom';

// === 数据转换接口 ===

/**
 * 数据适配器接口
 */
export interface DataAdapter<T = any> {
  /**
   * 将原始数据转换为标准格式
   */
  toStandard(rawData: T): StandardDiagramData;

  /**
   * 将标准格式转换为原始数据
   */
  fromStandard(standardData: StandardDiagramData): T;

  /**
   * 验证数据格式
   */
  validate(data: T): boolean;
}

// === 数据查询接口 ===

/**
 * 数据查询条件
 */
export interface DataQuery {
  type?: DiagramType;
  domain?: string;
  theme?: string;
  tags?: string[];
  search?: string;
}

/**
 * 查询结果
 */
export interface QueryResult<T = StandardDiagramData> {
  data: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

// === 缓存接口 ===

/**
 * 缓存项
 */
export interface CacheItem<T = any> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * 缓存管理器接口
 */
export interface CacheManager {
  get<T>(key: string): T | null;
  set<T>(key: string, data: T, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

// === 导出所有类型 ===
export type {
  Node as ReactFlowNode,
  Edge as ReactFlowEdge,
  Theme
};
