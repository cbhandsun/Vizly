/** 图表配置的数据模型。 */

export interface NodeConfig {
  minWidth: number;
  maxWidth: number;
  height: number; // 添加节点高度配置
  boxShadow: string; // 添加阴影配置
  padding: {
    horizontal: number;
    vertical: number;
  };
  gap: {
    horizontal: number;
    vertical: number;
  };
  font: {
    size: number;
    family: string;
    weight: string;
    lineHeight: number;
  };
}

export interface DomainConfig {
  padding: {
    horizontal: number;
    vertical: number;
  };
  gap: number;
  // 域容器左右侧向安全留白（函数级注释）
  // 目的：避免业务节点在视觉上贴近域右侧/左侧边框；
  // 该值会在布局中以左右各一次的形式加入域容器宽度，并用于调整域容器的起始位置。
  // 建议下限为 8px，在紧凑布局下仍能提供基本呼吸感。
  sideSafeGap?: number;
  // 域容器底部额外安全留白（函数级注释）
  // 目的：在存在标题安全区（顶部更大留白）时，为底部提供额外留白，降低“上宽下窄”的不对称感。
  // 默认会在布局中加到域容器的垂直尺寸上（LR: height；TB: mainDim），不影响顶部标题空间。
  bottomSafeGap?: number;
  // 宽度补偿系数（函数级注释）
  // 目的：中文文本实际渲染宽度通常比计算宽度大 10-20%，通过乘以此系数来补偿差异
  // 设置为 1.15 表示增加 15% 的宽度，确保右侧留白与左侧对称
  widthCompensation?: number;
  title: {
    height: number;
    padding: {
      horizontal: number;
      vertical: number;
    };
    // 额外安全留白（用于标题下沿到正文之间的保底间距）
    safeGap?: number;
  };
}

export interface SubDomainConfig {
  padding: {
    horizontal: number;
    vertical: number;
    top: number;
    bottom: number;
  };
  title: {
    height: number;
    padding: {
      horizontal: number;
      vertical: number;
    };
    // 额外安全间距（用于标题区域与上沿内容的留白保底）
    safeGap?: number;
  };
  // 是否启用"标题顶部留白保底"全局规则
  ensureTitleClearance?: boolean;
}

export interface EdgeConfig {
  strokeWidth: number;
  strokeDasharray?: string;
  animated: boolean;
  type: 'default' | 'straight' | 'step' | 'smoothstep' | 'bezier';
  // 新增：全局边渲染模式与路径类型（供视图适配器使用）
  mode?: 'smart' | 'native' | 'advanced-smart';
  pathType?: 'bezier' | 'step' | 'straight' | 'smoothstep' | 'auto';
  // 新增：在 smart 模式下 smoothstep 的可选回退策略
  smoothFallback?: 'bezier' | 'straight' | 'step' | 'native';
  /** 是否启用视图层把手统一选择（旧图兼容） */
  applyPostHandleSelection?: boolean;
  /**
   * 把手选择策略（函数级注释）
   * - 'respect'：尊重现有 sourceHandle/targetHandle；仅当为空或为 'auto' 时自动选择
   * - 'force-cost'：强制使用成本算法为所有边选择 source/target 把手
   * - 'force-geometry'：强制使用几何算法为所有边选择 source/target 把手
   * 说明：用于统一旧数据中的手工把手设置，便于在示例页切换集中策略。
   */
  handleSelectionPolicy?: 'respect' | 'force-cost' | 'force-geometry';
  /**
   * 是否启用自动路径类型选择（函数级注释）
   * - true：根据几何关系与障碍密度在 straight/step/bezier 之间自动选择
   * - false：严格按照 pathType 与 smoothFallback 渲染
   */
  autoPathSelection?: boolean;
  /**
   * @description 垂直关系连线的把手模式开关（函数级注释）
   * - 'center'：使用居中把手（source:'b' / target:'t' 或反向）
   * - 'corner'：使用角落把手（如 'r-b' / 'r-t' 或 'l-b' / 'l-t'），路径更短但视觉上靠侧边
   * 默认值为 'center'，更贴合“下出上入”的直观感受。
   */
  verticalHandleMode?: 'center' | 'corner';
  /**
   * 角度阈值（度，函数级注释）
   * - 近水平/近垂直的容忍角度；默认 30°。
   * - 小于该角度按 straight 优先；否则进入 step/bezier 判定。
   */
  angleToleranceDeg?: number;
  /**
   * @description 智能边避障范围设置（函数级注释）
   * - 'all'：所有业务节点参与避障，路径更平滑但可能更长
   * - 'corridor'：仅在源-目标走廊附近的节点参与，平衡避障与最短路径
   * - 'none'：不考虑障碍，仅作最短路径（不建议）
   */
  obstacleScope?: 'all' | 'corridor' | 'none';
  /**
   * @description 走廊模式下的走廊扩张半径（像素，函数级注释）
   * 值越大，考虑的障碍越多，路径越绕；建议 120-200。
   */
  obstacleScopePadding?: number;
  /**
   * @description 障碍节点的内边距（像素，函数级注释）
   * 提高数值可增强避障，但可能导致更长路径；建议 16-32。
   */
  obstaclePadding?: number;
  layoutDirection?: 'LR' | 'RL' | 'TB' | 'BT';
  /**
   * 斜向段长度阈值（像素，函数级注释）
   * - 斜向距离超过该阈值倾向选择 bezier；否则选择 step。
   */
  bezierDistanceThreshold?: number;
  /**
   * 走廊障碍数量阈值（函数级注释）
   * - 走廊范围内障碍数超过该值时，倾向选择 step，避免贝塞尔绕行过长。
   */
  corridorObstacleThreshold?: number;
  /**
   * 方向性把手策略（函数级注释）
   * - 'prefer'：优先使用符合布局方向的把手（默认）；
   * - 'force'：强制使用符合方向的把手；
   * - 'off'：不考虑方向性。
   */
  directionalHandlePolicy?: 'prefer' | 'force' | 'off';
  /**
   * 自定义把手权重配置（函数级注释）
   * 用于覆盖 HandlePicker 中的默认几何权重
   */
  handleWeights?: Record<string, unknown>;
  /**
   * 垂直偏好阈值（函数级注释）
   * - 当 dy / dx > 此阈值时，视为垂直关系；默认 1.0。
   */
  verticalBiasThreshold?: number;
  /**
   * 预先分配的端口映射（节点ID -> { source?, target? })，用于全局把手统一决策
   */
  preAssignedPorts?: Record<string, { source?: string; target?: string }>;
  /**
   * 每个节点的端口约束
   */
  nodePortConstraints?: Record<string, { source?: string[]; target?: string[] }>;
  /**
   * 绕行长度比例上限（预留，函数级注释）
   * - 当实际路径长度/直线距离超过该比例时应回退（由渲染层实现）。
   */
  detourLimitRatio?: number;
  /**
   * @description 智能路径参数（函数级注释）
   * gridRatio：网格密度，接近 1 更直，更大更绕；
   * borderRadius：转角圆角半径；
   * curvature：曲线弯曲度（仅对贝塞尔等类型生效）。
   */
  pathOptions?: {
    gridRatio?: number;
    borderRadius?: number;
    curvature?: number;
  };
  /**
   * 纯避障模式（函数级注释）
   * - 完全忽略域/子域容器影响与几何走廊；
   * - 仅以业务节点为障碍进行避障；不添加任何外墙/内环墙体；
   * - 用于“把容器当不存在”的场景。
   */
  pureObstacleMode?: boolean;
  markerEnd?: {
    type: string;
    width: number;
    height: number;
  };
  /**
   * 最小箭头偏移（像素）
   * 用于提升箭头与末段拐点/节点边界的最小距离
   */
  minArrowOffset?: number;
  /**
   * smart-step 末段最小长度（像素）
   * 用途：保证箭头与最后一个拐点之间至少保持该长度的直线段
   */
  stepLastSegmentMin?: number;
  /**
   * 几何判定用的重叠比阈值（函数级注释）
   * - 计算 X/Y 方向的重叠比（重叠深度/较小边长），仅当超过该阈值才触发对应轴的“对齐偏好”。
   * - 默认 0.6。
   */
  overlapRatioThreshold?: number;
  /**
   * 几何判定的安全边距（像素，函数级注释）
   * - 仅用于几何端点选择的投影重叠判断；与避障的 obstaclePadding 解耦。
   * - 默认 24。
   */
  geometryPadding?: number;
  /**
   * 正交采样开关与参数（函数级注释）
   * enabled：在阶梯路径下进行多通道采样，选择更少相交的通道；
   * gridSize：候选通道间的网格步长（像素）；
   * sampleBudget：候选通道数量上限（含中点与两侧）。
   */
  orthogonalSamplingEnabled?: boolean;
  orthogonalGridSize?: number;
  orthogonalSampleBudget?: number;
  /**
   * 网格A*正交候选（函数级注释）
   * enabled：启用轻量网格A*候选路径采样（仅阶梯路径）；
   * gridSize：网格步长；
   * maxExpansions：搜索扩展步数预算（性能保护）。
   */
  gridAStarEnabled?: boolean;
  gridAStarGridSize?: number;
  gridAStarMaxExpansions?: number;
  /**
   * 车道钳制（laneClamp，函数级注释）
   * - 当源/目标处于同一域/子域容器时，在容器边界外部添加“虚拟墙”，避免路径离开该容器；
   * - 不将容器视为障碍，仅对容器外部区域施加阻断，保证线在容器内部穿行。
   */
  laneClamp?: boolean;
  /**
   * 轴向对齐容忍阈值（像素，函数级注释）
   * 用于判定“近水平/近垂直”是否走直线；默认 8。
   */
  axisAlignTolerance?: number;
  /**
   * 短距离水平阈值比例（函数级注释）
   * 以 min(nodeWidth) * ratio 计算，默认 0.6。
   */
  shortDistanceHRatio?: number;
  /**
   * 短距离垂直阈值比例（函数级注释）
   * 以 min(nodeHeight) * ratio 计算，默认 0.6。
   */
  shortDistanceVRatio?: number;
  /**
   * 域内正交优先（函数级注释）
   * - 开启后：同域/同子域的非近轴向连线优先使用 step，减少贝塞尔。
   */
  preferOrthogonalInDomain?: boolean;
  /**
   * 域内正交偏好阈值比例（函数级注释）
   * - adx/ady 相对短距阈值的比例，默认 0.7；越小越倾向 step。
   */
  domainOrthogonalBias?: number;
  /** 是否忽略容器影响（容器越界惩罚与容器归属） */
  ignoreContainers?: boolean;
  /** 跨域时的垂直偏好开关：上下关系优先选上下端点 */
  crossDomainVerticalPrefer?: boolean;
  /** 跨域偏好权重比例（相对 lrBias/tbBias 的系数） */
  crossDomainBias?: number;
  /** 水平主轴时优先左右端口 */
  preferLROnHorizontal?: boolean;
  /** 判定水平主轴的偏好阈值（|dx| ≥ |dy| * H） */
  horizontalBiasThreshold?: number;
  /** 完全关闭域/子域偏好影响（不作为障碍，只移除偏好与惩罚） */
  disableDomainInfluence?: boolean;
  /** 类型偏好档位：orthogonal-first/balanced/curved-allowed */
  typePreferenceProfile?: 'orthogonal-first' | 'balanced' | 'curved-allowed';
  /** 允许贝塞尔的最小偏角（度），小于该角度更偏向直线/阶梯 */
  beziersAllowedMinAngleDeg?: number;
  /** 允许贝塞尔的最小绕行比例，低于该值更偏向直线/阶梯 */
  beziersAllowedMinDetourRatio?: number;
  /** 走廊拥挤的硬阈值（障碍计数），超过该值才考虑贝塞尔 */
  corridorObstacleHardThreshold?: number;
  /**
   * 端口负载惩罚系数（函数级注释）
   * - 在 decideEdgeRouting 的成本评估中，按端口使用次数施加软惩罚。
   * - 值越大越倾向分散端口使用；默认 5。
   */
  portLoadPenalty?: number;
  /**
   * 调试模式：端口热力图开关（函数级注释）
   * - 开启后，在 AdvancedSmartEdge 组件中渲染每个端口的使用次数热力图。
   */
  debugPortHeatmap?: boolean;
}

export interface CanvasConfig {
  background: string;
  grid: {
    enabled: boolean;
    size: number;
    color: string;
  };
  zoom: {
    min: number;
    max: number;
    step: number;
    sensitivity?: number;
    /**
     * 自动适配时的填充比例（函数级注释）
     * - 范围 0.1 - 1.0，默认 0.9
     * - 用于控制 fitView / fitWidthTop 时的视觉留白
     */
    fitRatio?: number;
    maxFitZoom?: number;
  };
  pan: {
    enabled: boolean;
  };
}

export interface DiagramConfig {
  node: NodeConfig;
  domain: DomainConfig;
  subDomain: SubDomainConfig;
  edge: EdgeConfig;
  canvas: CanvasConfig;
  /**
   * 全局界面配置（非画布内容）
   */
  ui: {
    /**
     * 全局 UI 缩放比例（0.5 - 2.0）
     * - 用于在高分辨率屏幕上模拟“浏览器缩放”效果
     * - 影响 Header, Sider, Content 等所有界面元素的大小
     * - 默认 1.0 (不缩放)；建议 0.8-0.9 以获得更精致的紧凑感
     */
    scale: number;
  };
  layout: {
    layerVerticalGap: number;
    mainColumnWidth: number; // 添加主列宽度配置
    autoGapScale?: { h: number; v: number };
    containmentPolicy?: 'strict' | 'soft' | 'elastic';
    rankMode?: 'elk' | 'dagre_like' | 'mermaid';
  };
  performance: {
    enableVirtualization: boolean;
    batchSize: number;
    debounceMs: number;
    /**
     * 虚拟化配置（函数级注释）
     * - threshold: 节点数阈值，超过该值启用虚拟化（默认50）
     * - padding: viewport外扩边界，单位px（默认200）
     * - enabled: 是否启用虚拟化（默认true）
     */
    virtualization?: {
      enabled: boolean;
      threshold: number;
      padding: number;
    };
  };
}
