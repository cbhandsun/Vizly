/**
 * 布局相关类型定义
 */

import { Position, Size } from './common';
import { NodeData } from './common';

// 布局类型枚举
export enum LayoutType {
  GRID = 'grid',
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical',
  HIERARCHICAL = 'hierarchical',
  CENTERED = 'centered',
  CENTER_WING = 'center-wing',
  FORCE_DIRECTED = 'force-directed',
  CIRCULAR = 'circular',
  FLOW = 'flow',
  SWIMLANE = 'swimlane',
  MAIN_BUS = 'main-bus',
  MAIN_BUS_SWIMLANE = 'main-bus-swimlane',
  DOMAIN_FIRST = 'domain-first',
  ELK = 'elk',
  ELK_LAYERED = 'elk-layered',
  DAGRE = 'dagre'
}

// 对齐类型枚举
export enum AlignmentType {
  LEFT = 'left',
  CENTER = 'center',
  RIGHT = 'right',
  TOP = 'top',
  MIDDLE = 'middle',
  BOTTOM = 'bottom',
  JUSTIFY = 'justify'
}

// 布局选项接口
export interface LayoutOptions {
  /** 布局类型 */
  type: LayoutType;
  /** 节点布局类型（用于域/子域内节点排布） */
  nodeLayout?: LayoutType;
  /** 路由阶段质量：交互时允许更轻量的计算。 */
  edgeRoutingQuality?: 'full' | 'interactive';
  /** ELK layout edge-routing hint; final display routing is still hard-gated. */
  edgeRouting?: 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES';
  /** 水平对齐方式 */
  horizontalAlign?: AlignmentType;
  /** 垂直对齐方式 */
  verticalAlign?: AlignmentType;
  /** 节点间距 */
  spacing?: {
    horizontal: number;
    vertical: number;
  };
  /** 边距 */
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** 网格列数（仅用于网格布局） */
  columns?: number;
  /** 网格行数（仅用于网格布局） */
  rows?: number;
  /** 容器尺寸 */
  containerSize?: Size;
  /** 项目尺寸 */
  itemSize?: Size;
  /** 对齐方式（兼容性） */
  alignment?: AlignmentType;
  /** 自动调整大小 */
  autoSize?: boolean;
  /** 最小宽度 */
  minWidth?: number;
  /** 最小高度 */
  minHeight?: number;

  /** 是否生成域容器（titleGroup） */
  generateDomainGroups?: boolean;
  /** 是否生成子域容器（subGroup） */
  generateSubDomainGroups?: boolean;
  /**
   * 子域白名单（函数级注释）
   * - 仅当生成子域容器时生效；若提供，则只为列表中的子域创建容器
   * - 例如：['预约管理', '车辆入场']
   */
  subDomainWhitelist?: string[];

  /**
   * 域白名单（函数级注释）
   * - 仅当生成域容器或按域划分泳道/列时生效；若提供，则仅处理列表中的域
   * - 兼容别名 `domainWhiteList`（驼峰大小写差异），策略实现中将同时读取
   */
  domainWhitelist?: string[];



  /** 布局方向 */
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  /**
   * 自动方向选择开关（函数级注释）
   * - 当为 true 时，层次布局将根据图结构与容器尺寸自动选择上下(TB)或左右(LR)方向；
   * - 若同时提供 `direction`，则优先使用显式方向；当 `direction` 为空时生效；
   * - 适用策略：Hierarchical、Swimlane 域内层次、DomainFirst 域/子域内层次。
   */
  autoDirection?: boolean;

  /**
   * 方向覆盖（函数级注释）
   * - 允许按域或子域显式覆盖局部层次布局方向；
   * - 在策略实现中读取并传给对应层次计算。
   */
  directionOverrides?: {
    domain?: Record<string, 'TB' | 'BT' | 'LR' | 'RL'>;
    subDomain?: Record<string, 'TB' | 'BT' | 'LR' | 'RL'>;
  };

  /**
   * 自动方向启发式参数（函数级注释）
   * - 自定义阈值调优自动判定；均为可选，未提供使用默认值。
   */
  autoDirectionHeuristics?: {
    /** 当宽高比大于该值，倾向 LR（默认 1.2） */
    aspectThresholdLR?: number;
    /** 当宽高比小于该值，倾向 TB（默认 0.8） */
    aspectThresholdTB?: number;
    /** 层数达到该值以上更倾向 TB（默认 3） */
    minLevelCountTB?: number;
    /** 层内平均节点达到该值以上更倾向 LR（默认 4） */
    minAvgPerLevelLR?: number;
    /** 扇出判定阈值（>=N 记为高扇出，默认 3） */
    fanOutDegree?: number;
    /** 扇入判定阈值（>=N 记为高扇入，默认 3） */
    fanInDegree?: number;
    /** 当高扇入/扇出占比超过该阈值且边数充足时倾向 LR（默认 0.2） */
    fanScoreThreshold?: number;
    /** 估算布局面积在方向评分中的权重（默认 0.55） */
    areaWeight?: number;
    /** 高扇入/扇出在方向评分中的权重（默认 0.25） */
    fanWeight?: number;
    /** 边密度在方向评分中的权重（默认 0.10） */
    densityWeight?: number;
    /** 层内节点不均衡在方向评分中的权重（默认 0.10） */
    imbalanceWeight?: number;
  };

  /**
   * 紧凑偏好（函数级注释）
   * - 指示自动选择更压缩宽度或更压缩高度的方向（'width'|'height'）；
   * - 若未提供，按启发式规则判定。
   */
  compactPreference?: 'width' | 'height';
  /** 分组内边距 */
  groupPadding?: number;
  /** 域标题高度 */
  domainTitleHeight?: number;
  /**
   * 域容器的顶层放置模型。
   * - topology：根据跨域边进行拓扑分层；
   * - ordered-lanes：忽略域级环，按显式/扫描顺序稳定排列为泳道。
   */
  domainPlacement?: 'topology' | 'ordered-lanes';
  /** 显式域顺序（优先级最高） */
  domainOrder?: string[];
  /** 显式子域顺序（优先级最高，按域分组） */
  subDomainOrder?: string[] | Record<string, string[]>;
  /** 是否适配域内容宽度（用于覆盖默认排序等行为） */
  fitDomainContent?: boolean;
  /** 调试/诊断：在指定垂直布局阶段后停止，入口会规范化大小写和空白。 */
  stopAfterPhase?: string;
  /** 内部兼容开关：保持子域容器高度不被后续阶段改写。 */
  __lockSubGroupHeights?: boolean;

  /** 泳道布局：域排列顺序 */
  laneOrder?: string[];
  /** 泳道布局：泳道内节点水平对齐 */
  laneAlign?: AlignmentType;

  /** 主流程总线：换行模式（none/serpentine） */
  busWrapMode?: 'none' | 'serpentine';
  /** 主流程总线：每行最大主线节点数量 */
  busMaxPerRow?: number;
  /** 主流程总线：行间垂直间距 */
  busRowSpacing?: number;

  /** 中心-两翼专属配置 */
  centerWing?: {
    /** 分组：中心、左右翼、输出 */
    groups: {
      CENTER: string[];
      LEFT_WING: string[];
      RIGHT_WING: string[];
      OUTPUT: string[];
    };
    /** 节点层级映射，可覆盖默认层级推断 */
    layerMap?: Record<
      string,
      'INPUT' | 'ORCHESTRATION' | 'WING_SUPPORT' | 'CORE_CENTER' | 'OUTPUT'
    >;
    /** 层级 Y 坐标 */
    layers?: {
      INPUT?: number;
      ORCHESTRATION?: number;
      WING_SUPPORT?: number;
      CORE_CENTER?: number;
      OUTPUT?: number;
    };
    /** 原点位置（用于左翼起点与整体基准） */
    origin?: { x: number; y: number };
    /** 度量配置（间距、节点尺寸、偏移） */
    metrics?: {
      hSpacing?: number;
      vSpacing?: number;
      wingSpacing?: number;
      wingVerticalOffset?: number;
      nodeWidth?: number;
      nodeHeight?: number;
    };
  };

  /**
   * 域内容等比例适配开关（函数级注释）
   * - 当为 true 时，策略在统一域宽后将域内内容视为整体，按域内部可用区域进行水平/垂直等比缩放；
   * - 适用策略：DomainVerticalLayout、DomainHorizontalLayout、DomainFirstLayout。
   */
  // fitDomainContent?: boolean; // 已在上方定义
  /** 域顺序（显式覆盖） */
  // domainOrder?: string[]; // 已在上方定义
  /** 子域顺序（显式覆盖，支持全局或按域） */
  // subDomainOrder?: string[] | Record<string, string[]>; // 已在上方定义

  /**
   * ELK 辅助开关（函数级注释）
   * - 通过软性配置增强 ELK 排布效果，而非后置坐标钳制
   */
  /** 边路由偏好（polyline/orthogonal/spline） */
  elkRouting?: 'polyline' | 'orthogonal' | 'spline';
  /** 节点放置策略（auto/linear/brandes） */
  elkPlacementStrategy?: 'auto' | 'linear' | 'brandes';
  /** 顺序提示边开关（none/subgroup/domain） */
  sequenceHints?: 'none' | 'subgroup' | 'domain';
  /** 边布局配置（用于传递给布局策略） */
  edge?: Record<string, unknown>;
}

// 布局节点接口
export interface LayoutNodeData extends NodeData {
  /** 节点位置 */
  position: Position;
  /** 节点大小 */
  size: Size;
  /** 父节点ID */
  parentId?: string;
  /** 子节点ID列表 */
  children?: string[];
  /** 节点层级 */
  level?: number;
  /** 节点权重（用于某些布局算法） */
  weight?: number;
  /** 是否固定位置 */
  fixed?: boolean;
}

// 布局边接口
export interface LayoutEdgeData {
  /** 边ID */
  id: string;
  /** 源节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 边权重 */
  weight?: number;
  /** 边长度 */
  length?: number;
  /** 边类型 */
  type?: 'hierarchy' | 'association' | 'dependency' | 'flow';
}

// 布局约束接口
export interface LayoutConstraints {
  /** 最小节点间距 */
  minNodeSpacing?: number;
  /** 最大节点间距 */
  maxNodeSpacing?: number;
  /** 边的最小长度 */
  minEdgeLength?: number;
  /** 边的最大长度 */
  maxEdgeLength?: number;
  /** 避免重叠 */
  avoidOverlap?: boolean;
  /** 保持纵横比 */
  maintainAspectRatio?: boolean;
}

// 布局计算结果接口
export interface LayoutCalculationResult {
  /** 布局后的节点 */
  nodes: LayoutNodeData[];
  /** 布局后的边 */
  edges: LayoutEdgeData[];
  /** 布局边界 */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 布局统计信息 */
  stats: {
    /** 计算耗时（毫秒） */
    duration: number;
    /** 迭代次数 */
    iterations?: number;
    /** 能量值（用于力导向布局） */
    energy?: number;
  };
}

// 布局优化器配置
export interface LayoutOptimizerConfig {
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 收敛阈值 */
  convergenceThreshold?: number;
  /** 是否启用多线程 */
  enableMultiThreading?: boolean;
  /** 缓存大小 */
  cacheSize?: number;
  /** 是否启用增量布局 */
  enableIncrementalLayout?: boolean;
}

// 文本测量结果接口
export interface TextMeasurementResult {
  /** 文本宽度 */
  width: number;
  /** 文本高度 */
  height: number;
  /** 基线位置 */
  baseline?: number;
  /** 字体信息 */
  fontInfo?: {
    family: string;
    size: number;
    weight: string;
    style: string;
  };
}

// 文本测量选项接口
export interface TextMeasurementOptions {
  /** 字体族 */
  fontFamily?: string;
  /** 字体大小 */
  fontSize?: number;
  /** 字体粗细 */
  fontWeight?: string | number;
  /** 字体样式 */
  fontStyle?: string;
  /** 最大宽度 */
  maxWidth?: number;
  /** 行高 */
  lineHeight?: number;
  /** 是否启用缓存 */
  enableCache?: boolean;
}

// 布局事件类型
export type LayoutEventType =
  | 'layout-start'
  | 'layout-progress'
  | 'layout-complete'
  | 'layout-error'
  | 'node-position-change'
  | 'bounds-change';

// 布局事件接口
export interface LayoutEvent {
  type: LayoutEventType;
  data: Record<string, unknown>;
  timestamp: number;
  source?: string;
}
