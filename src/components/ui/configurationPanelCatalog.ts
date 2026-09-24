import type { ConfigItem } from './configurationPanelModel';

const MAX_DYNAMIC_OPTIONS = 100;
const MAX_DYNAMIC_OPTION_LENGTH = 100;

const normalizeDynamicOptions = (
  values: readonly unknown[],
  fallback: string,
): string[] => {
  const options = [...new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim().slice(0, MAX_DYNAMIC_OPTION_LENGTH))
      .filter(Boolean),
  )].slice(0, MAX_DYNAMIC_OPTIONS - 1);

  return options.includes(fallback) ? options : [fallback, ...options];
};

export function createConfigurationItemsByCategory(
  hierarchyOptions: readonly unknown[],
  nodeOptions: readonly unknown[],
): Record<string, ConfigItem[]> {
    const normalizedHierarchyOptions = normalizeDynamicOptions(hierarchyOptions, 'DomainVerticalLayout');
    const normalizedNodeOptions = normalizeDynamicOptions(nodeOptions, 'VerticalLayout');
    const raw = {
    nodes: [
      {
        key: 'diagram.node.minWidth',
        type: 'number' as const,
        value: 120,
        min: 80,
        max: 300,
        step: 10
      },
      {
        key: 'diagram.node.maxWidth',
        type: 'number' as const,
        value: 300,
        min: 200,
        max: 500,
        step: 10
      },
      {
        key: 'diagram.node.height',
        type: 'number' as const,
        value: 60,
        min: 40,
        max: 120,
        step: 5
      },
      {
        key: 'diagram.node.padding.horizontal',
        type: 'number' as const,
        value: 20,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.node.padding.vertical',
        type: 'number' as const,
        value: 20,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.node.boxShadow',
        type: 'string' as const,
        value: '0 2px 4px rgba(0,0,0,0.1)'
      },
      {
        key: 'diagram.font.size',
        type: 'number' as const,
        value: 14,
        min: 10,
        max: 24,
        step: 1
      }
    ],
    containers: [
      // Domain Configs
      {
        key: 'diagram.domain.padding.horizontal',
        type: 'number' as const,
        value: 32,
        min: 0,
        max: 100,
        step: 4
      },
      {
        key: 'diagram.domain.padding.vertical',
        type: 'number' as const,
        value: 32,
        min: 0,
        max: 100,
        step: 4
      },
      {
        key: 'diagram.domain.gap',
        type: 'number' as const,
        value: 60,
        min: 20,
        max: 200,
        step: 10
      },
      {
        key: 'diagram.domain.sideSafeGap',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.domain.bottomSafeGap',
        type: 'number' as const,
        value: 12,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.domain.title.height',
        type: 'number' as const,
        value: 48,
        min: 20,
        max: 100,
        step: 4
      },
      {
        key: 'diagram.domain.title.safeGap',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 40,
        step: 2
      },
      // SubDomain Configs
      {
        key: 'diagram.subDomain.padding.horizontal',
        type: 'number' as const,
        value: 24,
        min: 0,
        max: 80,
        step: 4
      },
      {
        key: 'diagram.subDomain.padding.vertical',
        type: 'number' as const,
        value: 24,
        min: 0,
        max: 80,
        step: 4
      },
      {
        key: 'diagram.subDomain.title.height',
        type: 'number' as const,
        value: 42,
        min: 20,
        max: 80,
        step: 2
      },
      {
        key: 'diagram.subDomain.ensureTitleClearance',
        type: 'boolean' as const,
        value: true
      }
    ],
    spacing: [
      {
        key: 'diagram.spacing.horizontal',
        type: 'number' as const,
        value: 150,
        min: 50,
        max: 300,
        step: 10
      },
      {
        key: 'diagram.spacing.vertical',
        type: 'number' as const,
        value: 100,
        min: 50,
        max: 200,
        step: 10
      }
    ],
    edges: [
      // --- 基础设置 ---
      {
        key: 'diagram.edge.mode',
        type: 'select' as const,
        value: 'advanced-smart',
        options: ['advanced-smart', 'native'],
        group: '基础设置'
      },
      {
        key: 'diagram.edge.pathType',
        type: 'select' as const,
        value: 'auto',
        options: ['auto', 'bezier', 'straight', 'step'],
        group: '基础设置'
      },
      {
        key: 'diagram.edge.directionalHandlePolicy',
        type: 'select' as const,
        value: 'prefer',
        options: ['prefer', 'force', 'off'],
        group: '基础设置'
      },
      {
        key: 'diagram.edge.forceDirect',
        type: 'boolean' as const,
        value: false,
        group: '基础设置'
      },
      // --- 避障与容器 ---
      {
        key: 'diagram.edge.intraContainerNoObstacle',
        type: 'boolean' as const,
        value: true,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.pureObstacleMode',
        type: 'boolean' as const,
        value: false,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.ignoreContainers',
        type: 'boolean' as const,
        value: true,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.laneClamp',
        type: 'boolean' as const,
        value: false,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.obstaclePadding',
        type: 'number' as const,
        value: 36,
        min: 0,
        max: 120,
        step: 2,
        group: '避障与容器'
      },
      // --- 几何微调 ---
      {
        key: 'diagram.edge.minArrowOffset',
        type: 'number' as const,
        value: 18,
        min: 0,
        max: 60,
        step: 1,
        group: '几何微调'
      },
      {
        key: 'diagram.edge.stepLastSegmentMin',
        type: 'number' as const,
        value: 24,
        min: 0,
        max: 200,
        step: 2,
        group: '几何微调'
      },
      // --- 偏好权重 ---
      {
        key: 'diagram.edge.disableDomainInfluence',
        type: 'boolean' as const,
        value: true,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.crossDomainVerticalPrefer',
        type: 'boolean' as const,
        value: false,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.crossDomainBias',
        type: 'number' as const,
        value: 0,
        min: 0,
        max: 1,
        step: 0.1,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.preferOrthogonalInDomain',
        type: 'boolean' as const,
        value: false,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.domainOrthogonalBias',
        type: 'number' as const,
        value: 0,
        min: 0,
        max: 1,
        step: 0.1,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.preferLROnHorizontal',
        type: 'boolean' as const,
        value: true,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.horizontalBiasThreshold',
        type: 'number' as const,
        value: 1.0,
        min: 0.6,
        max: 2.0,
        step: 0.1,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.typePreferenceProfile',
        type: 'select' as const,
        value: 'orthogonal-first',
        options: ['orthogonal-first', 'balanced', 'curved-allowed'],
        group: '偏好权重'
      },
      // --- 高级采样算法 ---
      {
        key: 'diagram.edge.orthogonalSamplingEnabled',
        type: 'boolean' as const,
        value: false,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.orthogonalGridSize',
        type: 'number' as const,
        value: 40,
        min: 12,
        max: 120,
        step: 4,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.orthogonalSampleBudget',
        type: 'number' as const,
        value: 5,
        min: 3,
        max: 11,
        step: 1,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.gridAStarEnabled',
        type: 'boolean' as const,
        value: false,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.gridAStarGridSize',
        type: 'number' as const,
        value: 40,
        min: 12,
        max: 120,
        step: 4,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.gridAStarMaxExpansions',
        type: 'number' as const,
        value: 300,
        min: 100,
        max: 1000,
        step: 50,
        group: '高级采样'
      },
      // --- 贝塞尔微调 ---
      {
        key: 'diagram.edge.beziersAllowedMinAngleDeg',
        type: 'number' as const,
        value: 25,
        min: 0,
        max: 90,
        step: 1,
        group: '贝塞尔微调'
      },
      {
        key: 'diagram.edge.beziersAllowedMinDetourRatio',
        type: 'number' as const,
        value: 2.2,
        min: 1.0,
        max: 5.0,
        step: 0.1,
        group: '贝塞尔微调'
      },
      {
        key: 'diagram.edge.corridorObstacleHardThreshold',
        type: 'number' as const,
        value: 8,
        min: 2,
        max: 30,
        step: 1,
        group: '贝塞尔微调'
      }
    ],
    layout: [
      // --- 核心策略 ---
      {
        key: 'diagram.layout.INDUSTRY_PROFILE',
        type: 'select' as const,
        value: 'auto',
        options: ['auto', 'strict_industry', 'balanced_industry', 'relaxed_industry'],
        group: '核心策略'
      },
      {
        key: 'diagram.layout.strategy',
        type: 'select' as const,
        value: 'DomainVerticalLayout',
        options: normalizedHierarchyOptions,
        group: '核心策略'
      },
      {
        key: 'diagram.layout.direction',
        type: 'select' as const,
        value: 'TB',
        options: ['LR', 'RL', 'TB', 'BT'],
        group: '核心策略'
      },
      {
        key: 'diagram.layout.nodeStrategy',
        type: 'select' as const,
        value: 'VerticalLayout',
        options: normalizedNodeOptions,
        group: '核心策略'
      },
      {
        key: 'diagram.layout.linkOrientation',
        type: 'boolean' as const,
        value: true,
        group: '核心策略'
      },
      {
        key: 'diagram.layout.CONTAINMENT_POLICY',
        type: 'select' as const,
        value: 'elastic',
        options: ['elastic', 'soft', 'strict'],
        group: '核心策略'
      },
      // --- ELK 基础 ---
      {
        key: 'diagram.layout.ELK_ALGORITHM',
        type: 'select' as const,
        value: 'layered',
        options: ['layered', 'force', 'stress', 'radial', 'mrtree', 'disco'],
        group: 'ELK 基础'
      },
      {
        key: 'diagram.layout.RANK_MODE',
        type: 'select' as const,
        value: 'elk',
        options: ['elk', 'dagre_like'],
        group: 'ELK 基础'
      },
      {
        key: 'diagram.layout.ELK_STRICT_MODE',
        type: 'boolean' as const,
        value: false,
        group: 'ELK 基础'
      },
      {
        key: 'diagram.layout.ELK_DIRECTION',
        type: 'select' as const,
        value: '',
        options: ['', 'RIGHT', 'DOWN', 'LEFT', 'UP'],
        group: 'ELK 基础'
      },
      // --- ELK 间距 ---
      {
        key: 'diagram.layout.ELK_NODE_SPACING',
        type: 'number' as const,
        value: 56,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_LAYER_SPACING',
        type: 'number' as const,
        value: 80,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_LABEL_SPACING',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 40,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_EDGE_NODE_SPACING',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 80,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_EDGE_EDGE_SPACING',
        type: 'number' as const,
        value: 4,
        min: 0,
        max: 80,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_PORT_PORT_SPACING',
        type: 'number' as const,
        value: 4,
        min: 0,
        max: 40,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_PORT_BORDER_OFFSET',
        type: 'number' as const,
        value: 4,
        min: 0,
        max: 40,
        step: 1,
        group: 'ELK 间距'
      },
      // --- ELK 高级微调 ---
      {
        key: 'diagram.layout.ELK_NODE_PLACEMENT',
        type: 'select' as const,
        value: 'NETWORK_SIMPLEX',
        options: ['NETWORK_SIMPLEX', 'LINEAR_SEGMENTS', 'BRANDES_KOEPF'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_LAYERING',
        type: 'select' as const,
        value: 'NETWORK_SIMPLEX',
        options: ['NETWORK_SIMPLEX', 'LONGEST_PATH', 'COFFMAN_GRAHAM'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_EDGE_ROUTING',
        type: 'select' as const,
        value: 'POLYLINE',
        options: ['POLYLINE', 'ORTHOGONAL', 'SPLINES'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_MERGE_EDGES',
        type: 'boolean' as const,
        value: true,
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_FIXED_ALIGNMENT',
        type: 'select' as const,
        value: 'NONE',
        options: ['NONE', 'BALANCED', 'LEFTDOWN', 'RIGHTUP', 'LEFTUP', 'RIGHTDOWN'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_CONSIDER_MODEL_ORDER',
        type: 'boolean' as const,
        value: false,
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_CYCLE_BREAKING',
        type: 'select' as const,
        value: 'GREEDY',
        options: ['GREEDY', 'DEPTH_FIRST', 'INTERACTIVE'],
        group: 'ELK 高级微调'
      }
    ],
    performance: [
      {
        key: 'performance.enableVirtualization',
        type: 'boolean' as const,
        value: true
      },
      {
        key: 'performance.enableAnimations',
        type: 'boolean' as const,
        value: true
      }
    ]
    };

    const basic = [
      ...raw.nodes.filter(i => i.key === 'diagram.node.minWidth' || i.key === 'diagram.node.height'),
      ...raw.spacing.filter(i => i.key === 'diagram.spacing.horizontal' || i.key === 'diagram.spacing.vertical'),
      ...raw.edges.filter(i => i.key === 'diagram.edge.mode' || i.key === 'diagram.edge.pathType'),
      ...raw.layout.filter(i => i.key === 'diagram.layout.strategy' || i.key === 'diagram.layout.direction'),
      ...raw.performance.filter(i => i.key === 'performance.enableAnimations')
    ].map(i => ({...i, group: undefined})); // 基础设置不分组，平铺展现

    return { basic, ...raw };
}
