/** 统一配置项的数据模型与内置定义。 */

export enum ConfigSource {
  DEFAULT = 'default',
  LOCAL_STORAGE = 'localStorage',
  SESSION_STORAGE = 'sessionStorage',
  REMOTE = 'remote',
  ENVIRONMENT = 'environment',
  USER_OVERRIDE = 'userOverride'
}

// 配置变更事件
export interface ConfigChangeEvent<T = unknown> {
  key: string;
  oldValue: T;
  newValue: T;
  source: ConfigSource;
  timestamp: number;
}

// 配置监听器
export type ConfigListener<T = unknown> = {
  bivarianceHack(event: ConfigChangeEvent<T>): void;
}['bivarianceHack'];

// 配置验证器
export type ConfigValidator<T = unknown> = {
  bivarianceHack(value: T): boolean | string;
}['bivarianceHack'];

// 配置项定义
export interface ConfigDefinition<T = unknown> {
  /** 配置键名 */
  key: string;
  /** 默认值 */
  defaultValue: T;
  /** 描述 */
  description?: string;
  /** 验证器 */
  validator?: ConfigValidator<T>;
  /** 是否持久化 */
  persistent?: boolean;
  /** 存储键名（用于持久化） */
  storageKey?: string;
  /** 是否敏感信息 */
  sensitive?: boolean;
  /** 配置分组 */
  group?: string;
}

// 预定义配置
export const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
  // 主题配置
  'theme.mode': {
    key: 'theme.mode',
    defaultValue: 'light',
    description: '主题模式',
    validator: (value: unknown) => typeof value === 'string' && ['light', 'dark', 'auto'].includes(value),
    persistent: true,
    group: 'theme'
  },
  'theme.primaryColor': {
    key: 'theme.primaryColor',
    defaultValue: '#1890ff',
    description: '主色调',
    validator: (value: unknown) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value),
    persistent: true,
    group: 'theme'
  },
  'theme.current': {
    key: 'theme.current',
    defaultValue: null,
    description: '当前激活的主题对象',
    persistent: false, // 通常在运行时动态设置，无需持久化
    group: 'theme'
  },
  // 当前主题 ID（持久化选择）
  'theme.currentId': {
    key: 'theme.currentId',
    defaultValue: '',
    description: '当前选择的主题 ID',
    validator: (value: unknown) => typeof value === 'string',
    persistent: true,
    group: 'theme'
  },
  // 自定义主题集合（持久化）
  'theme.customThemes': {
    key: 'theme.customThemes',
    defaultValue: [],
    description: '用户自定义主题列表',
    validator: (value: unknown) => Array.isArray(value),
    persistent: true,
    group: 'theme'
  },
  // 主题预设集合（持久化）
  'theme.presets': {
    key: 'theme.presets',
    defaultValue: {},
    description: '主题预设集合',
    validator: (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value),
    persistent: true,
    group: 'theme'
  },
  // 域主题增强开关（持久化）
  'theme.domainAugmentationEnabled': {
    key: 'theme.domainAugmentationEnabled',
    defaultValue: false,
    description: '启用域主题增强（域颜色与样式联动）',
    validator: (value: unknown) => typeof value === 'boolean',
    persistent: true,
    group: 'theme'
  },

  // 布局配置
  'layout.spacing.node': {
    key: 'layout.spacing.node',
    defaultValue: 100,
    description: '节点间距',
    validator: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 500,
    persistent: true,
    group: 'layout'
  },
  'layout.spacing.level': {
    key: 'layout.spacing.level',
    defaultValue: 150,
    description: '层级间距',
    validator: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 500,
    persistent: true,
    group: 'layout'
  },
  'layout.spacing.domain': {
    key: 'layout.spacing.domain',
    defaultValue: 200,
    description: '域间距',
    validator: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 500,
    persistent: true,
    group: 'layout'
  },
  'layout.containmentPolicy': {
    key: 'layout.containmentPolicy',
    defaultValue: 'elastic',
    description: '域包含策略 (strict, soft, elastic)',
    validator: (value: unknown) => typeof value === 'string' && ['strict', 'soft', 'elastic'].includes(value),
    persistent: true,
    group: 'layout'
  },
  'layout.rankMode': {
    key: 'layout.rankMode',
    defaultValue: 'elk',
    description: '层级排序模式 (elk, dagre_like)',
    validator: (value: unknown) => typeof value === 'string' && ['elk', 'dagre_like'].includes(value),
    persistent: true,
    group: 'layout'
  },

  // 性能配置
  'performance.enableVirtualization': {
    key: 'performance.enableVirtualization',
    defaultValue: true,
    description: '启用虚拟化',
    persistent: true,
    group: 'performance'
  },
  'performance.maxNodes': {
    key: 'performance.maxNodes',
    defaultValue: 1000,
    description: '最大节点数',
    validator: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10000,
    persistent: true,
    group: 'performance'
  },

  // 导出配置
  'export.defaultFormat': {
    key: 'export.defaultFormat',
    defaultValue: 'png',
    description: '默认导出格式',
    validator: (value: unknown) => typeof value === 'string' && ['png', 'jpg', 'svg', 'pdf'].includes(value),
    persistent: true,
    group: 'export'
  },
  'export.quality': {
    key: 'export.quality',
    defaultValue: 1.0,
    description: '导出质量',
    validator: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 3,
    persistent: true,
    group: 'export'
  },

  ...(import.meta.env.DEV ? {
    'dev.enableDebugMode': {
      key: 'dev.enableDebugMode',
      defaultValue: false,
      description: '启用调试模式',
      persistent: false,
      group: 'development'
    },
    'dev.showPerformanceMetrics': {
      key: 'dev.showPerformanceMetrics',
      defaultValue: false,
      description: '显示性能指标',
      persistent: false,
      group: 'development'
    }
  } : {})
};
