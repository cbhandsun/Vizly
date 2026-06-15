/**
 * 图表配置管理系统
 * 统一管理布局、样式和行为配置
 */

const DIAGRAM_CONFIG_STORAGE_KEY = 'architecture-diagram-config';
const MAX_STORED_DIAGRAM_CONFIG_CHARS = 512 * 1024;
const MAX_IMPORTED_DIAGRAM_CONFIG_CHARS = 1024 * 1024;
const MAX_CONFIG_DEPTH = 10;
const MAX_CONFIG_ARRAY_ITEMS = 2000;
const MAX_CONFIG_OBJECT_KEYS = 1000;
const MAX_CONFIG_STRING_CHARS = 64 * 1024;
const DANGEROUS_CONFIG_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type ConfigRecord = Record<string, unknown>;
type ConfigValue = null | boolean | number | string | ConfigValue[] | { [key: string]: ConfigValue };

const isPlainConfigObject = (value: unknown): value is ConfigRecord =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );

const parseBoundedConfigJson = (json: string, maxChars: number, label: string): unknown => {
  if (json.length > maxChars) {
    throw new Error(`${label}超过大小限制`);
  }

  return JSON.parse(json);
};

const sanitizeConfigValue = (value: unknown, depth = 0): ConfigValue => {
  if (depth > MAX_CONFIG_DEPTH) {
    throw new Error('配置对象嵌套过深');
  }

  if (value === undefined || value === null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('配置数字必须是有限值');
    }
    return value;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_CONFIG_STRING_CHARS) {
      throw new Error('配置字符串超过大小限制');
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_CONFIG_ARRAY_ITEMS) {
      throw new Error('配置数组超过长度限制');
    }
    return value.map(item => sanitizeConfigValue(item, depth + 1));
  }

  if (!isPlainConfigObject(value)) {
    throw new Error('配置值必须是可序列化对象');
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_CONFIG_OBJECT_KEYS) {
    throw new Error('配置对象键数量超过限制');
  }

  const sanitized: Record<string, ConfigValue> = {};
  entries.forEach(([key, nestedValue]) => {
    if (DANGEROUS_CONFIG_KEYS.has(key)) {
      return;
    }
    sanitized[key] = sanitizeConfigValue(nestedValue, depth + 1);
  });

  return sanitized;
};

const sanitizeConfigPatch = (value: unknown): Partial<DiagramConfig> => {
  if (!isPlainConfigObject(value)) {
    throw new Error('配置必须是对象');
  }

  return sanitizeConfigValue(value) as Partial<DiagramConfig>;
};

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

/**
 * 默认配置 - 优化布局防止节点重叠
 */
export const defaultConfig: DiagramConfig = {
  node: {
    minWidth: 80, // 进一步收紧最小宽度
    maxWidth: 420, // 与 LayoutOptimizer hardMaxWidth 对齐
    height: 80, // 节点高度
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)', // 阴影效果
    padding: {
      horizontal: 12, // 进一步收紧水平内边距
      vertical: 8    // 进一步收紧垂直内边距
    },
    gap: {
      horizontal: 320, // 进一步增加水平间距
      vertical: 160    // 进一步增加垂直间距
    },
    font: {
      size: 16,
      // 统一与渲染层使用的中文友好字体栈（函数级注释）
      // 避免测量阶段与实际渲染字体不一致导致宽度偏差，造成文本溢出。
      family: '"Microsoft YaHei", "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif',
      weight: '400',
      lineHeight: 1.4
    }
  },
  domain: {
    padding: {
      /**
       * 函数级注释：统一域左右内边距（视觉左缘）
       * - 目的：保证标题条与正文起始位置在各域一致，增强左对齐观感
       * - 取值：统一设为 24，与布局策略计算保持一致
       */
      horizontal: 24,
      vertical: 24
    },
    gap: 160, // 进一步增加域间距
    // 域左右侧向安全留白：用于补偿节点实际渲染宽度与预计算宽度的差异
    // 中文文本使用 whiteSpace: 'nowrap' 时可能比预计算的宽度大很多
    sideSafeGap: 8, // 减小侧向留白,为子域居中留出更多空间 (原值60会占用过多居中空间)
    // 宽度补偿系数：中文文本实际渲染宽度通常比计算宽度大 10-20%
    // 设置为 1.15 表示增加 15% 的宽度来确保右侧留白与左侧对称
    widthCompensation: 1.15,
    // 新增：域底部额外安全留白（用于减轻上下不对称）
    bottomSafeGap: 32,
    title: {
      height: 50, // 增加标题高度
      padding: {
        horizontal: 20,
        vertical: 12
      },
      /**
       * 函数级注释：统一标题安全留白
       * - 目的：避免不同域的标题条视觉起点不一致，影响“域左对齐”的观感
       * - 取值：统一为 16，与布局策略的安全阈值一致
       */
      safeGap: 10
    }
  },
  subDomain: {
    padding: {
      horizontal: 20,
      vertical: 20,
      top: 12,
      bottom: 12
    },
    title: {
      height: 32, // 增加子域标题高度
      padding: {
        horizontal: 16,
        vertical: 6
      },
      safeGap: 6 // 增加安全间距
    },
    ensureTitleClearance: true
  },
  edge: {
    strokeWidth: 2,
    animated: false,
    type: 'step',
    mode: 'advanced-smart',
    pathType: 'auto',
    // 在 smart 模式下，smoothstep 的默认回退策略为 bezier
    smoothFallback: 'bezier',
    // 旧图兼容：启用视图层把手统一选择，保持与编排层一致的方向约束
    applyPostHandleSelection: true,
    // 默认策略：尊重编排阶段端口统一决策，仅当为空时再评估
    handleSelectionPolicy: 'respect',
    // 自动路径类型选择开关与阈值
    autoPathSelection: true,
    // 新增：垂直关系把手模式，默认居中（b→t）
    verticalHandleMode: 'center',
    // 新增：智能避障默认值，走廊模式平衡“不可交叉”和“最短路径”
    obstacleScope: 'all',
    obstacleScopePadding: 160,
    // 减小避障内边距，优先更直路径
    obstaclePadding: 18,
    // 增大近水平/垂直容忍角度，让更多连线走更直路径
    angleToleranceDeg: 36,
    bezierDistanceThreshold: 280,
    corridorObstacleThreshold: 6,
    // 与调优逻辑一致的绕行比例上限，避免过度绕行
    detourLimitRatio: 3.2,
    pathOptions: {
      gridRatio: 1.0,
      borderRadius: 4
    },
    markerEnd: {
      type: 'arrowclosed',
      width: 10,
      height: 10
    }
    ,
    // 箭头与节点边界的偏移距离（0 = 箭头贴合节点边界）
    minArrowOffset: 0
    ,
    // 末段最小长度：保证最后一个拐点与箭头之间有足够距离
    stepLastSegmentMin: 40
    ,
    directionalHandlePolicy: 'force',
    handleWeights: {
      wrongAxisPenalty: 8000,
      preferredAxisBonus: 3000,
      lShapeBonus: 2500,
      crossAxisPenalty: 2000,
      dominantAxisRatio: 1.1,
      threshold: 10,
      lShapeThreshold: 20,
      majorAxisBonus: 300,
      busBonus: 30
    }
    ,
    verticalBiasThreshold: 1.2
    ,
    overlapRatioThreshold: 0.6
    ,
    geometryPadding: 24
    ,
    orthogonalSamplingEnabled: false
    ,
    orthogonalGridSize: 40
    ,
    orthogonalSampleBudget: 5
    ,
    gridAStarEnabled: false
    ,
    gridAStarGridSize: 40
    ,
    gridAStarMaxExpansions: 300
    ,
    laneClamp: false
    ,
    axisAlignTolerance: 8
    ,
    shortDistanceHRatio: 0.6
    ,
    shortDistanceVRatio: 0.6
    ,
    preferOrthogonalInDomain: false
    ,
    domainOrthogonalBias: 0
    ,
    ignoreContainers: true
    ,
    crossDomainVerticalPrefer: false
    ,
    crossDomainBias: 0
    ,
    preferLROnHorizontal: true
    ,
    horizontalBiasThreshold: 1.0
    ,
    disableDomainInfluence: true
    ,
    pureObstacleMode: true
    ,
    typePreferenceProfile: 'orthogonal-first'
    ,
    beziersAllowedMinAngleDeg: 25
    ,
    beziersAllowedMinDetourRatio: 2.2
    ,
    corridorObstacleHardThreshold: 8
  },
  canvas: {
    background: '#ffffff',
    grid: {
      enabled: true,
      size: 20,
      color: '#f0f0f0'
    },
    zoom: {
      min: 0.05,
      max: 8,
      step: 0.1,
      sensitivity: 1,
      fitRatio: 0.85, // 默认 85% 填充
    },
    pan: {
      enabled: true
    }
  },
  ui: {
    scale: 0.85 // 默认 85% 缩放，提供更精致的视觉体验，接近用户偏好的 75%
  },
  layout: {
    layerVerticalGap: 80,
    mainColumnWidth: 400,
    autoGapScale: { h: 1.0, v: 0.9 },
    containmentPolicy: 'elastic',
    rankMode: 'elk'
  },
  performance: {
    enableVirtualization: true,
    batchSize: 50,
    debounceMs: 100,
    virtualization: {
      enabled: true,      // 启用虚拟化
      threshold: 50,      // 超过50个节点启用
      padding: 200        // viewport外扩200px
    }
  }
};

/**
 * 配置管理器类
 */
export class DiagramConfigManager {
  private config: DiagramConfig;
  private listeners: Set<(config: DiagramConfig) => void> = new Set();

  constructor(initialConfig: DiagramConfig = defaultConfig) {
    this.config = { ...initialConfig };

    // 启动时规范化关键间距，避免旧值影响视觉
    this.ensureMinGaps();
  }

  /**
   * 获取当前配置
   */
  public getConfig(): DiagramConfig {
    const config = { ...this.config };
    if (config.node && (config.node.height === undefined || isNaN(config.node.height))) {
      config.node.height = defaultConfig.node.height;
    }
    // 兼容迁移：确保节点间距至少为“重度加大”阈值
    try {
      const minHGap = 48; // 更紧凑的水平间距下限
      const minVGap = 36; // 更紧凑的垂直间距下限
      if (!config.node.gap) {
        config.node.gap = { horizontal: minHGap, vertical: minVGap };
      } else {
        if (typeof config.node.gap.horizontal !== 'number' || config.node.gap.horizontal < minHGap) {
          config.node.gap.horizontal = minHGap;
        }
        if (typeof config.node.gap.vertical !== 'number' || config.node.gap.vertical < minVGap) {
          config.node.gap.vertical = minVGap;
        }
      }
      // 同步域间距与层间距的最低阈值
      const minDomainGap = 48;
      const minLayerVGap = 48;
      if (typeof config.domain?.gap !== 'number' || isNaN(config.domain.gap) || config.domain.gap < minDomainGap) {
        config.domain.gap = minDomainGap;
      }
      if (typeof config.layout?.layerVerticalGap !== 'number' || isNaN(config.layout.layerVerticalGap) || config.layout.layerVerticalGap < minLayerVGap) {
        config.layout.layerVerticalGap = minLayerVGap;
      }
    } catch {
      // 安全兜底，不影响运行
      config.node.gap = { horizontal: 80, vertical: 36 };
      config.domain.gap = 48;
      config.layout.layerVerticalGap = 48;
    }
    return config;
  }

  /**
   * 更新配置
   */
  public updateConfig(updates: Partial<DiagramConfig>): void {
    const safeUpdates = sanitizeConfigPatch(updates);
    this.config = this.mergeConfig(this.config, safeUpdates);
    // 每次更新后规范化关键间距
    this.ensureMinGaps();
    this.notifyListeners();
    this.saveConfigToStorage();
  }

  /**
   * 重置为默认配置
   */
  public resetToDefault(): void {
    this.config = { ...defaultConfig };
    this.notifyListeners();
    this.saveConfigToStorage();
  }

  /**
   * 添加配置变更监听器
   */
  public addConfigChangeListener(listener: (config: DiagramConfig) => void): void {
    this.listeners.add(listener);
  }

  /**
   * 移除配置变更监听器
   */
  public removeConfigChangeListener(listener: (config: DiagramConfig) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(target: DiagramConfig, source: Partial<DiagramConfig>): DiagramConfig {
    const result = { ...target } as unknown as ConfigRecord;
    const targetRecord = target as unknown as ConfigRecord;

    for (const [key, sourceValue] of Object.entries(source)) {
      if (DANGEROUS_CONFIG_KEYS.has(key)) {
        continue;
      }
      const targetValue = targetRecord[key];

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        result[key] = this.mergeObject(targetValue, sourceValue as ConfigRecord);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }

    return result as unknown as DiagramConfig;
  }

  /**
   * 深度合并对象
   */
  private mergeObject(target: unknown, source: ConfigRecord): ConfigRecord {
    const result: ConfigRecord = isPlainConfigObject(target) ? { ...target } : {};

    for (const [key, sourceValue] of Object.entries(source)) {
      if (DANGEROUS_CONFIG_KEYS.has(key)) {
        continue;
      }
      const targetValue = result[key];

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        result[key] = this.mergeObject(targetValue, sourceValue as ConfigRecord);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.config);
      } catch (error) {
        console.error('配置变更监听器执行失败:', error);
      }
    });
  }

  /**
   * 保存配置到本地存储
   */
  private saveConfigToStorage(): void {
    try {
      const configToSave = {
        ...this.config,
        // 排除主题相关的配置，因为这些会自动从主题管理器获取
        node: {
          ...this.config.node,
          font: undefined // 字体配置由主题管理
        },
        canvas: {
          ...this.config.canvas,
          background: undefined // 背景色由主题管理
        }
      };

      const serialized = JSON.stringify(configToSave);
      if (serialized.length > MAX_STORED_DIAGRAM_CONFIG_CHARS) {
        console.warn('图表配置超过本地存储大小限制，跳过保存');
        return;
      }
      localStorage.setItem(DIAGRAM_CONFIG_STORAGE_KEY, serialized);
    } catch (error) {
      console.warn('无法保存配置到本地存储:', error);
    }
  }

  /**
   * 从本地存储加载配置
   */
  public loadConfigFromStorage(): void {
    try {
      const savedConfig = localStorage.getItem(DIAGRAM_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsedConfig = sanitizeConfigPatch(parseBoundedConfigJson(
          savedConfig,
          MAX_STORED_DIAGRAM_CONFIG_CHARS,
          '本地图表配置'
        ));
        // [FIX] Force markerEnd to 10x10 to override any stale values in localStorage
        if (parsedConfig.edge && parsedConfig.edge.markerEnd) {
          parsedConfig.edge.markerEnd.width = 10;
          parsedConfig.edge.markerEnd.height = 10;
        }
        this.updateConfig(parsedConfig);
        // 载入后已通过 updateConfig 规范化并保存
      }
    } catch (error) {
      localStorage.removeItem(DIAGRAM_CONFIG_STORAGE_KEY);
      console.warn('无法从本地存储加载配置:', error);
    }
  }

  /**
   * 函数级注释：确保关键间距不低于视觉安全下限
   * - 目的：防止因旧版配置或手动调校导致节点/域过于拥挤，保障基本可读性。
   * - 规则：
   *   - 节点水平/垂直间距不低于 48/36
   *   - 域间距不低于 48
   *   - 层间垂直间距不低于 48
   * - 调用时机：构造函数与每次 updateConfig 后。
   */
  private ensureMinGaps(): void {
    const MIN_NODE_H_GAP = 48;
    const MIN_NODE_V_GAP = 36;
    const MIN_DOMAIN_GAP = 48;
    const MIN_LAYER_V_GAP = 48;

    if (!this.config.node.gap) {
      this.config.node.gap = { horizontal: MIN_NODE_H_GAP, vertical: MIN_NODE_V_GAP };
    } else {
      this.config.node.gap.horizontal = Math.max(this.config.node.gap.horizontal, MIN_NODE_H_GAP);
      this.config.node.gap.vertical = Math.max(this.config.node.gap.vertical, MIN_NODE_V_GAP);
    }

    if (typeof this.config.domain?.gap !== 'number' || isNaN(this.config.domain.gap) || this.config.domain.gap < MIN_DOMAIN_GAP) {
      this.config.domain.gap = MIN_DOMAIN_GAP;
    }

    if (typeof this.config.layout?.layerVerticalGap !== 'number' || isNaN(this.config.layout.layerVerticalGap) || this.config.layout.layerVerticalGap < MIN_LAYER_V_GAP) {
      this.config.layout.layerVerticalGap = MIN_LAYER_V_GAP;
    }
  }

  /**
   * 导出配置
   */
  public exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 导入配置
   */
  public importConfig(configJson: string): boolean {
    try {
      const importedConfig = sanitizeConfigPatch(parseBoundedConfigJson(
        configJson,
        MAX_IMPORTED_DIAGRAM_CONFIG_CHARS,
        '导入图表配置'
      ));
      this.updateConfig(importedConfig);
      return true;
    } catch (error) {
      console.error('配置导入失败:', error);
      return false;
    }
  }

  /**
   * 获取性能优化配置
   */
  public getPerformanceConfig(): DiagramConfig['performance'] {
    return { ...this.config.performance };
  }

  /**
   * 更新性能配置
   */
  public updatePerformanceConfig(updates: Partial<DiagramConfig['performance']>): void {
    this.config.performance = { ...this.config.performance, ...updates };
    this.notifyListeners();
    this.saveConfigToStorage();
  }

  /**
   * 获取布局相关配置（用于LayoutOptimizer）
   */
  public getLayoutConfig(): {
    NODE_MIN_WIDTH: number;
    NODE_PADDING: { horizontal: number; vertical: number };
    NODE_H_GAP: number;
    NODE_V_GAP: number;
    GROUP_PADDING: { H: number; V: number };
    SUB_GROUP_PADDING: { H: number; V_TOP: number; V_BOTTOM: number };
    // 计算后的子分组标题顶部留白保底
    SUB_GROUP_TITLE_CLEARANCE: number;
    // 是否启用全局子分组标题留白保底
    ENSURE_SUB_GROUP_TITLE_CLEARANCE: boolean;
    // 新增域相关详细配置
    GROUP_TITLE_HEIGHT: number;
    GROUP_TITLE_SAFE_GAP: number;
    GROUP_SIDE_SAFE_GAP: number;
    GROUP_BOTTOM_SAFE_GAP: number;
    // 新增子域相关详细配置
    SUB_GROUP_TITLE_HEIGHT: number;
    SUB_GROUP_TITLE_SAFE_GAP: number;
    DOMAIN_H_GAP: number;
    BE_COLUMN_GAP: number;
    NODE_FONT_SIZE: number;
    NODE_FONT_FAMILY: string;
    NODE_FONT_WEIGHT: string;
  } {
    // 确保所有数值配置都是有效数字，防止 NaN 传播
    const safeNumber = (value: unknown, defaultValue: number): number => {
      return (typeof value === 'number' && !isNaN(value) && isFinite(value)) ? value : defaultValue;
    };

    const safeString = (value: unknown, defaultValue: string): string => {
      return (typeof value === 'string' && value.trim()) ? value : defaultValue;
    };

    return {
      NODE_MIN_WIDTH: safeNumber(this.config.node.minWidth, 120),
      NODE_PADDING: {
        horizontal: safeNumber(this.config.node.padding.horizontal, 20),
        vertical: safeNumber(this.config.node.padding.vertical, 14)
      },
      NODE_H_GAP: safeNumber(this.config.node.gap.horizontal, 120),
      NODE_V_GAP: safeNumber(this.config.node.gap.vertical, 60),
      GROUP_PADDING: {
        H: safeNumber(this.config.domain.padding.horizontal, 24),
        V: safeNumber(this.config.domain.padding.vertical, 16)
      },
      SUB_GROUP_PADDING: {
        H: safeNumber(this.config.subDomain.padding.horizontal, 18),
        V_TOP: safeNumber(this.config.subDomain.padding.top, 28),
        V_BOTTOM: safeNumber(this.config.subDomain.padding.bottom, 16)
      },
      SUB_GROUP_TITLE_CLEARANCE: Math.max(
        safeNumber(this.config.subDomain.padding.top, 28),
        Math.max(42, safeNumber(this.config.subDomain.title.height, 30)) + safeNumber(this.config.subDomain.title.safeGap, 16)
      ),
      ENSURE_SUB_GROUP_TITLE_CLEARANCE: ((): boolean => {
        const v = this.config.subDomain.ensureTitleClearance;
        return typeof v === 'boolean' ? v : true;
      })(),
      GROUP_TITLE_HEIGHT: safeNumber(this.config.domain.title.height, 48),
      GROUP_TITLE_SAFE_GAP: safeNumber(this.config.domain.title.safeGap, 8),
      GROUP_SIDE_SAFE_GAP: safeNumber(this.config.domain.sideSafeGap, 8),
      GROUP_BOTTOM_SAFE_GAP: safeNumber(this.config.domain.bottomSafeGap, 12),
      SUB_GROUP_TITLE_HEIGHT: safeNumber(this.config.subDomain.title.height, 30),
      SUB_GROUP_TITLE_SAFE_GAP: safeNumber(this.config.subDomain.title.safeGap, 16),
      DOMAIN_H_GAP: safeNumber(this.config.domain.gap, 40),
      BE_COLUMN_GAP: safeNumber(this.config.layout.mainColumnWidth, 300),
      NODE_FONT_SIZE: safeNumber(this.config.node.font.size, 28),
      NODE_FONT_FAMILY: safeString(this.config.node.font.family, '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif'),
      NODE_FONT_WEIGHT: safeString(this.config.node.font.weight, '400')
    };
  }

  /**
   * 公开方法：将当前配置规范化并同步写入 localStorage
   */
  public syncConfigToLocalStorage(): void {
    this.ensureMinGaps();
    this.saveConfigToStorage();
    this.notifyListeners();
  }
}

/**
 * 全局唯一的配置管理器实例
 */
export const diagramConfigManager = new DiagramConfigManager();
