import type { DiagramConfig } from './DiagramConfigTypes';

/**
 * 默认配置 - 优化布局防止节点重叠
 */
const mutableDefaultConfig: DiagramConfig = {
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

const deepFreezeConfig = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(nestedValue => deepFreezeConfig(nestedValue));
    Object.freeze(value);
  }
  return value;
};

export const defaultConfig: DiagramConfig = deepFreezeConfig(mutableDefaultConfig);
