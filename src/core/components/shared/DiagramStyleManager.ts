export interface EdgeStyleToken {
  color: string;
  width: number;
  dash?: string;
  arrow: {
    color: string;
    width?: number;
    height?: number;
    type: 'arrow' | 'triangle' | 'circle';
  };
}

export interface NodeStyleToken {
  borderStyle: 'solid' | 'dashed' | 'none';
  borderWidth: number;
  radius: number;
  shadow: 'none' | 'soft' | 'medium' | 'strong';
  paddingScale: number;
  backgroundPolicy: 'theme' | 'tint' | 'white';
  accentBar?: {
    position: 'left' | 'top';
    width: number;
    alpha: number;
    variant?: 'solid' | 'gradient' | 'dashed';
  };
  statusStripe?: {
    height: number;
    alpha: number;
  };
}

export interface SubDomainStyleToken {
  borderStyle: 'solid' | 'dashed' | 'none';
  borderWidth: number;
  radius: number;
  bgAlpha: number;
  titleFontSize?: number;
  titleFontWeight?: number;
  titleSafeGap?: number;
}

export interface DomainContainerStyleToken {
  radius: number;
  bgAlpha: number;
  sideSafeGap: number;
  bottomSafeGap: number;
  titleBarHeight: number;
  titleFontSize?: number;
}

/** 风格预设分类 */
export type StylePresetCategory = 'design-system' | 'professional' | 'minimal' | 'specialty' | 'creative';

/** 风格预设分类元信息 */
export const STYLE_CATEGORIES: Record<StylePresetCategory, { label: string; description: string }> = {
  'design-system': { label: '设计系统风格', description: '基于知名设计系统的风格' },
  'professional': { label: '专业报表风格', description: '适合企业级报表和仪表盘' },
  'minimal': { label: '极简风格', description: '简洁清晰，聚焦内容' },
  'specialty': { label: '特色风格', description: '独特视觉效果' },
  'creative': { label: '创意灵感', description: '适用于头脑风暴或白板绘制' },
};

export type FlowStylePreset = {
  name: string;
  label: string;
  /** 预设分类 */
  category: StylePresetCategory;
  /** 预设描述 */
  description: string;
  /** 连线风格预设 */
  edges: {
    main: EdgeStyleToken;
    status: EdgeStyleToken;
    support: EdgeStyleToken;
    dependency: EdgeStyleToken;
    data: EdgeStyleToken;
    external: EdgeStyleToken;
  };
  /** 节点风格预设（适用于业务节点） */
  node: NodeStyleToken;
  /** 子域容器风格预设 */
  subdomain: SubDomainStyleToken;
  /** 域容器/标题组风格预设 */
  domain: DomainContainerStyleToken;
};

// Basic event bus for style changes
class StylePresetBus {
  private listeners: Set<() => void> = new Set();
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit() {
    this.listeners.forEach((l) => l());
  }
  getListenerCount() {
    return this.listeners.size;
  }
}

const bus = new StylePresetBus();

// Built-in presets
const PRESETS: Record<string, FlowStylePreset> = {
  standard: {
    name: 'standard',
    label: '标准',
    category: 'professional',
    description: '平衡的默认风格，清晰的语义配色，适合日常沟通',
    edges: {
      main: {
        color: '#3E8EDE',
        width: 2,
        arrow: { color: '#3E8EDE', type: 'arrow' },
      },
      status: {
        color: '#7E57C2',
        width: 2,
        dash: '6 3',
        arrow: { color: '#7E57C2', type: 'arrow' },
      },
      support: {
        color: '#9E9E9E',
        width: 1.5,
        dash: '4 3',
        arrow: { color: '#9E9E9E', type: 'arrow' },
      },
      dependency: {
        color: '#26A69A',
        width: 2,
        dash: '4 2',
        arrow: { color: '#26A69A', type: 'arrow' },
      },
      external: {
        color: '#26A69A',
        width: 2,
        dash: '4 2',
        arrow: { color: '#26A69A', type: 'arrow' },
      },
      data: {
        color: '#FF7043',
        width: 2,
        dash: '2 2',
        arrow: { color: '#FF7043', type: 'arrow' },
      },
    },
    node: {
      borderStyle: 'solid',
      borderWidth: 2.0,
      radius: 10,
      shadow: 'medium',
      paddingScale: 1.0,
      backgroundPolicy: 'tint',
      accentBar: { position: 'top', width: 3, alpha: 0.85, variant: 'solid' },
    },
    subdomain: {
      borderStyle: 'solid',
      borderWidth: 1.5,
      radius: 8,
      bgAlpha: 0.10,
      titleFontSize: 13,
      titleFontWeight: 600,
      titleSafeGap: 12,
    },
    domain: {
      radius: 10,
      bgAlpha: 0.12,
      sideSafeGap: 12,
      bottomSafeGap: 12,
      titleBarHeight: 40,
      titleFontSize: 15,
    },
  },
  bold: {
    name: 'bold',
    label: '厚重',
    category: 'professional',
    description: '粗犷有力，线条粗壮、阴影明显，适合投屏演示',
    edges: {
      main: {
        color: '#1E88E5',
        width: 3,
        arrow: { color: '#1E88E5', type: 'arrow' },
      },
      status: {
        color: '#5E35B1',
        width: 3,
        dash: '8 3',
        arrow: { color: '#5E35B1', type: 'arrow' },
      },
      support: {
        color: '#616161',
        width: 2.5,
        dash: '6 4',
        arrow: { color: '#616161', type: 'arrow' },
      },
      dependency: {
        color: '#00897B',
        width: 3,
        dash: '6 3',
        arrow: { color: '#00897B', type: 'arrow' },
      },
      external: {
        color: '#00897B',
        width: 3,
        dash: '6 3',
        arrow: { color: '#00897B', type: 'arrow' },
      },
      data: {
        color: '#F4511E',
        width: 3,
        dash: '4 3',
        arrow: { color: '#F4511E', type: 'arrow' },
      },
    },
    node: {
      borderStyle: 'solid',
      borderWidth: 3.0,
      radius: 18,
      shadow: 'strong',
      paddingScale: 1.1,
      backgroundPolicy: 'theme',
      accentBar: { position: 'left', width: 8, alpha: 0.6, variant: 'solid' },
    },
    subdomain: {
      borderStyle: 'solid',
      borderWidth: 2,
      radius: 12,
      bgAlpha: 0.08,
      titleFontSize: 17,
      titleFontWeight: 700,
      titleSafeGap: 14,
    },
    domain: {
      radius: 14,
      bgAlpha: 0.1,
      sideSafeGap: 14,
      bottomSafeGap: 16,
      titleBarHeight: 44,
      titleFontSize: 17,
    },
  },
  compact: {
    name: 'compact',
    label: '紧凑',
    category: 'minimal',
    description: '细线条、小节点、小圆角，适合复杂系统全景图',
    edges: {
      main: {
        color: '#42A5F5',
        width: 1.5,
        arrow: { color: '#42A5F5', type: 'arrow' },
      },
      status: {
        color: '#8E24AA',
        width: 1.5,
        dash: '4 2',
        arrow: { color: '#8E24AA', type: 'arrow' },
      },
      support: {
        color: '#757575',
        width: 1.2,
        dash: '3 2',
        arrow: { color: '#757575', type: 'arrow' },
      },
      dependency: {
        color: '#26C6DA',
        width: 1.5,
        dash: '3 2',
        arrow: { color: '#26C6DA', type: 'arrow' },
      },
      external: {
        color: '#26C6DA',
        width: 1.5,
        dash: '3 2',
        arrow: { color: '#26C6DA', type: 'arrow' },
      },
      data: {
        color: '#FF7043',
        width: 1.5,
        dash: '2 2',
        arrow: { color: '#FF7043', type: 'arrow' },
      },
    },
    node: {
      borderStyle: 'solid',
      borderWidth: 1.8,
      radius: 12,
      shadow: 'soft',
      paddingScale: 0.9,
      backgroundPolicy: 'white',
    },
    subdomain: {
      borderStyle: 'dashed',
      borderWidth: 1,
      radius: 8,
      bgAlpha: 0.05,
      titleFontSize: 15,
      titleFontWeight: 600,
      titleSafeGap: 10,
    },
    domain: {
      radius: 10,
      bgAlpha: 0.06,
      sideSafeGap: 10,
      bottomSafeGap: 10,
      titleBarHeight: 36,
      titleFontSize: 15,
    },
  },
  material: {
    name: 'material',
    label: '质感',
    category: 'design-system',
    description: 'Material Design 风格，左侧渐变色条 + 底部状态条',
    edges: {
      main: { color: '#1E88E5', width: 2.5, arrow: { color: '#1E88E5', type: 'arrow' } },
      status: { color: '#8E24AA', width: 2, dash: '6 3', arrow: { color: '#8E24AA', type: 'arrow' } },
      support: { color: '#757575', width: 2, dash: '5 3', arrow: { color: '#757575', type: 'arrow' } },
      dependency: { color: '#26A69A', width: 2, dash: '5 3', arrow: { color: '#26A69A', type: 'arrow' } },
      external: { color: '#26A69A', width: 2, dash: '5 3', arrow: { color: '#26A69A', type: 'arrow' } },
      data: { color: '#FB8C00', width: 2, dash: '3 2', arrow: { color: '#FB8C00', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 2, radius: 12, shadow: 'soft', paddingScale: 1.0, backgroundPolicy: 'theme', accentBar: { position: 'left', width: 6, alpha: 0.5, variant: 'gradient' }, statusStripe: { height: 3, alpha: 0.35 } },
    subdomain: { borderStyle: 'solid', borderWidth: 1, radius: 12, bgAlpha: 0.07, titleFontSize: 16, titleFontWeight: 600, titleSafeGap: 12 },
    domain: { radius: 12, bgAlpha: 0.08, sideSafeGap: 12, bottomSafeGap: 12, titleBarHeight: 40, titleFontSize: 16 },
  },
  minimal: {
    name: 'minimal',
    label: '极简',
    category: 'minimal',
    description: '灰调配色、无阴影、小圆角，纯净无干扰',
    edges: {
      main: { color: '#37474F', width: 1.6, arrow: { color: '#37474F', type: 'arrow' } },
      status: { color: '#546E7A', width: 1.4, dash: '4 3', arrow: { color: '#546E7A', type: 'arrow' } },
      support: { color: '#9E9E9E', width: 1.2, dash: '3 2', arrow: { color: '#9E9E9E', type: 'arrow' } },
      dependency: { color: '#90A4AE', width: 1.4, dash: '3 2', arrow: { color: '#90A4AE', type: 'arrow' } },
      external: { color: '#90A4AE', width: 1.4, dash: '3 2', arrow: { color: '#90A4AE', type: 'arrow' } },
      data: { color: '#78909C', width: 1.4, dash: '2 2', arrow: { color: '#78909C', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 1.2, radius: 6, shadow: 'none', paddingScale: 0.9, backgroundPolicy: 'white' },
    subdomain: { borderStyle: 'solid', borderWidth: 1, radius: 6, bgAlpha: 0.02, titleFontSize: 13, titleFontWeight: 600, titleSafeGap: 6 },
    domain: { radius: 6, bgAlpha: 0.02, sideSafeGap: 8, bottomSafeGap: 8, titleBarHeight: 28, titleFontSize: 13 },
  },
  neumorphic: {
    name: 'neumorphic',
    label: '拟物柔光',
    category: 'specialty',
    description: '新拟物风格，浮雕感大圆角 + 深度阴影',
    edges: {
      main: { color: '#546E7A', width: 2.2, arrow: { color: '#546E7A', type: 'arrow' } },
      status: { color: '#7E57C2', width: 2, dash: '6 3', arrow: { color: '#7E57C2', type: 'arrow' } },
      support: { color: '#B0BEC5', width: 1.8, dash: '5 3', arrow: { color: '#B0BEC5', type: 'arrow' } },
      dependency: { color: '#26A69A', width: 2, dash: '5 3', arrow: { color: '#26A69A', type: 'arrow' } },
      external: { color: '#26A69A', width: 2, dash: '5 3', arrow: { color: '#26A69A', type: 'arrow' } },
      data: { color: '#FF7043', width: 2, dash: '3 2', arrow: { color: '#FF7043', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 1.4, radius: 24, shadow: 'strong', paddingScale: 1.1, backgroundPolicy: 'white' },
    subdomain: { borderStyle: 'dashed', borderWidth: 1, radius: 16, bgAlpha: 0.08, titleFontSize: 16, titleFontWeight: 600, titleSafeGap: 12 },
    domain: { radius: 18, bgAlpha: 0.1, sideSafeGap: 16, bottomSafeGap: 16, titleBarHeight: 46, titleFontSize: 16 },
  },
  glass: {
    name: 'glass',
    label: '半透明玻璃',
    category: 'specialty',
    description: '玻璃拟态风格，半透明背景 + 渐变色条',
    edges: {
      main: { color: '#1E88E5', width: 2.2, arrow: { color: '#1E88E5', type: 'arrow' } },
      status: { color: '#5E35B1', width: 2, dash: '6 3', arrow: { color: '#5E35B1', type: 'arrow' } },
      support: { color: '#90A4AE', width: 1.8, dash: '5 3', arrow: { color: '#90A4AE', type: 'arrow' } },
      dependency: { color: '#26C6DA', width: 2, dash: '4 3', arrow: { color: '#26C6DA', type: 'arrow' } },
      external: { color: '#26C6DA', width: 2, dash: '4 3', arrow: { color: '#26C6DA', type: 'arrow' } },
      data: { color: '#F4511E', width: 2, dash: '3 2', arrow: { color: '#F4511E', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 1.6, radius: 16, shadow: 'medium', paddingScale: 1.0, backgroundPolicy: 'tint', accentBar: { position: 'left', width: 6, alpha: 0.35, variant: 'gradient' }, statusStripe: { height: 3, alpha: 0.25 } },
    subdomain: { borderStyle: 'solid', borderWidth: 1, radius: 14, bgAlpha: 0.1, titleFontSize: 15, titleFontWeight: 600, titleSafeGap: 10 },
    domain: { radius: 16, bgAlpha: 0.1, sideSafeGap: 14, bottomSafeGap: 14, titleBarHeight: 42, titleFontSize: 16 },
  },
  outline: {
    name: 'outline',
    label: '描边',
    category: 'specialty',
    description: '粗黑描边、无阴影、顶部虐线装饰，手绘风',
    edges: {
      main: { color: '#212121', width: 2.5, arrow: { color: '#212121', type: 'arrow' } },
      status: { color: '#7E57C2', width: 2.2, dash: '6 3', arrow: { color: '#7E57C2', type: 'arrow' } },
      support: { color: '#9E9E9E', width: 2, dash: '5 3', arrow: { color: '#9E9E9E', type: 'arrow' } },
      dependency: { color: '#455A64', width: 2, dash: '6 4', arrow: { color: '#455A64', type: 'arrow' } },
      external: { color: '#455A64', width: 2, dash: '6 4', arrow: { color: '#455A64', type: 'arrow' } },
      data: { color: '#FF7043', width: 2.2, dash: '3 2', arrow: { color: '#FF7043', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 3.2, radius: 12, shadow: 'none', paddingScale: 1.0, backgroundPolicy: 'white', accentBar: { position: 'top', width: 6, alpha: 0.15, variant: 'dashed' }, statusStripe: { height: 3, alpha: 0.4 } },
    subdomain: { borderStyle: 'solid', borderWidth: 2, radius: 12, bgAlpha: 0.05, titleFontSize: 15, titleFontWeight: 700, titleSafeGap: 12 },
    domain: { radius: 12, bgAlpha: 0.06, sideSafeGap: 14, bottomSafeGap: 14, titleBarHeight: 40, titleFontSize: 16 },
  },
  fluent: {
    name: 'fluent',
    label: 'Fluent（微软）',
    category: 'design-system',
    description: 'Fluent UI 风格，小圆角 + 彩色填充，清爽明亮',
    edges: {
      main: { color: '#2B88D8', width: 2.2, arrow: { color: '#2B88D8', type: 'arrow' } },
      status: { color: '#6B5BD2', width: 2.0, dash: '6 3', arrow: { color: '#6B5BD2', type: 'arrow' } },
      support: { color: '#7A8A99', width: 1.8, dash: '5 3', arrow: { color: '#7A8A99', type: 'arrow' } },
      dependency: { color: '#2F9D85', width: 2.0, dash: '5 3', arrow: { color: '#2F9D85', type: 'arrow' } },
      external: { color: '#2F9D85', width: 2.0, dash: '5 3', arrow: { color: '#2F9D85', type: 'arrow' } },
      data: { color: '#F59F00', width: 2.0, dash: '3 2', arrow: { color: '#F59F00', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 1.6, radius: 6, shadow: 'soft', paddingScale: 1.0, backgroundPolicy: 'tint' },
    subdomain: { borderStyle: 'solid', borderWidth: 1, radius: 8, bgAlpha: 0.08, titleFontSize: 15, titleFontWeight: 600, titleSafeGap: 10 },
    domain: { radius: 10, bgAlpha: 0.1, sideSafeGap: 12, bottomSafeGap: 12, titleBarHeight: 36, titleFontSize: 15 },
  },
  ant: {
    name: 'ant',
    label: 'Ant Design',
    category: 'design-system',
    description: 'Ant Design 风格，蓝色主调 + 淡雅配色',
    edges: {
      main: { color: '#1677FF', width: 2.4, arrow: { color: '#1677FF', type: 'arrow' } },
      status: { color: '#722ED1', width: 2.0, dash: '6 3', arrow: { color: '#722ED1', type: 'arrow' } },
      support: { color: '#BFBFBF', width: 2.0, dash: '5 3', arrow: { color: '#BFBFBF', type: 'arrow' } },
      dependency: { color: '#13C2C2', width: 2.0, dash: '5 3', arrow: { color: '#13C2C2', type: 'arrow' } },
      external: { color: '#13C2C2', width: 2.0, dash: '5 3', arrow: { color: '#13C2C2', type: 'arrow' } },
      data: { color: '#FA8C16', width: 2.0, arrow: { color: '#FA8C16', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 1.5, radius: 8, shadow: 'medium', paddingScale: 1.0, backgroundPolicy: 'white', statusStripe: { height: 2, alpha: 0.4 } },
    subdomain: { borderStyle: 'dashed', borderWidth: 1, radius: 8, bgAlpha: 0.05, titleFontSize: 15, titleFontWeight: 600, titleSafeGap: 10 },
    domain: { radius: 12, bgAlpha: 0.06, sideSafeGap: 12, bottomSafeGap: 12, titleBarHeight: 40, titleFontSize: 16 },
  },
  carbon: {
    name: 'carbon',
    label: 'IBM Carbon',
    category: 'design-system',
    description: 'IBM Carbon 风格，细线 + 小圆角 + 无阴影，精密感',
    edges: {
      main: { color: '#0F62FE', width: 1.8, arrow: { color: '#0F62FE', type: 'arrow' } },
      status: { color: '#8A3FFC', width: 1.8, dash: '4 3', arrow: { color: '#8A3FFC', type: 'arrow' } },
      support: { color: '#697077', width: 1.4, dash: '3 2', arrow: { color: '#697077', type: 'arrow' } },
      dependency: { color: '#24A148', width: 1.6, dash: '3 2', arrow: { color: '#24A148', type: 'arrow' } },
      external: { color: '#24A148', width: 1.6, dash: '3 2', arrow: { color: '#24A148', type: 'arrow' } },
      data: { color: '#FF832B', width: 1.6, dash: '2 2', arrow: { color: '#FF832B', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 1.2, radius: 4, shadow: 'none', paddingScale: 0.95, backgroundPolicy: 'white' },
    subdomain: { borderStyle: 'solid', borderWidth: 1, radius: 4, bgAlpha: 0.02, titleFontSize: 13, titleFontWeight: 600, titleSafeGap: 6 },
    domain: { radius: 6, bgAlpha: 0.02, sideSafeGap: 8, bottomSafeGap: 8, titleBarHeight: 28, titleFontSize: 13 },
  },
  atlassian: {
    name: 'atlassian',
    label: 'Atlassian',
    category: 'design-system',
    description: 'Atlassian 风格，粗线条 + 左侧实色装饰条',
    edges: {
      main: { color: '#0052CC', width: 2.6, arrow: { color: '#0052CC', type: 'arrow' } },
      status: { color: '#5243AA', width: 2.0, dash: '6 3', arrow: { color: '#5243AA', type: 'arrow' } },
      support: { color: '#97A0AF', width: 2.0, dash: '5 3', arrow: { color: '#97A0AF', type: 'arrow' } },
      dependency: { color: '#00B8D9', width: 2.0, dash: '4 3', arrow: { color: '#00B8D9', type: 'arrow' } },
      external: { color: '#00B8D9', width: 2.0, dash: '4 3', arrow: { color: '#00B8D9', type: 'arrow' } },
      data: { color: '#FF991F', width: 2.0, dash: '3 2', arrow: { color: '#FF991F', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 2.0, radius: 12, shadow: 'medium', paddingScale: 1.0, backgroundPolicy: 'theme', accentBar: { position: 'left', width: 7, alpha: 0.45, variant: 'solid' }, statusStripe: { height: 3, alpha: 0.3 } },
    subdomain: { borderStyle: 'solid', borderWidth: 1, radius: 12, bgAlpha: 0.07, titleFontSize: 16, titleFontWeight: 600, titleSafeGap: 12 },
    domain: { radius: 14, bgAlpha: 0.08, sideSafeGap: 14, bottomSafeGap: 14, titleBarHeight: 42, titleFontSize: 16 },
  },
  dashboard: {
    name: 'dashboard',
    label: '数据看板',
    category: 'professional',
    description: '深色主线 + 红色强调，适合 BI 仪表盘场景',
    edges: {
      main: { color: '#263238', width: 2.8, arrow: { color: '#263238', type: 'arrow' } },
      status: { color: '#D81B60', width: 2.2, dash: '8 5', arrow: { color: '#D81B60', type: 'arrow' } },
      support: { color: '#CFD8DC', width: 2.0, dash: '6 4', arrow: { color: '#CFD8DC', type: 'arrow' } },
      dependency: { color: '#26A69A', width: 2.0, dash: '6 4', arrow: { color: '#26A69A', type: 'arrow' } },
      external: { color: '#26A69A', width: 2.0, dash: '6 4', arrow: { color: '#26A69A', type: 'arrow' } },
      data: { color: '#FF7043', width: 2.0, dash: '3 2', arrow: { color: '#FF7043', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 2.2, radius: 10, shadow: 'none', paddingScale: 1.0, backgroundPolicy: 'white', accentBar: { position: 'top', width: 4, alpha: 0.8, variant: 'solid' }, statusStripe: { height: 4, alpha: 0.5 } },
    subdomain: { borderStyle: 'dashed', borderWidth: 2, radius: 10, bgAlpha: 0.03, titleFontSize: 14, titleFontWeight: 700, titleSafeGap: 12 },
    domain: { radius: 10, bgAlpha: 0.04, sideSafeGap: 16, bottomSafeGap: 16, titleBarHeight: 34, titleFontSize: 14 },
  },
  blueprint: {
    name: 'blueprint',
    label: '工程蓝图',
    category: 'professional',
    description: '全蓝色谱 + 虐线网格，类似工程图纸',
    edges: {
      main: { color: '#1565C0', width: 2.8, arrow: { color: '#1565C0', type: 'arrow' } },
      status: { color: '#1E88E5', width: 2.2, dash: '8 5', arrow: { color: '#1E88E5', type: 'arrow' } },
      support: { color: '#90CAF9', width: 2.0, dash: '6 4', arrow: { color: '#90CAF9', type: 'arrow' } },
      dependency: { color: '#42A5F5', width: 2.2, dash: '6 4', arrow: { color: '#42A5F5', type: 'arrow' } },
      external: { color: '#42A5F5', width: 2.2, dash: '6 4', arrow: { color: '#42A5F5', type: 'arrow' } },
      data: { color: '#64B5F6', width: 2.0, dash: '3 2', arrow: { color: '#64B5F6', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 2.4, radius: 10, shadow: 'none', paddingScale: 1.0, backgroundPolicy: 'white', accentBar: { position: 'left', width: 6, alpha: 0.35, variant: 'dashed' } },
    subdomain: { borderStyle: 'dashed', borderWidth: 2, radius: 12, bgAlpha: 0.06, titleFontSize: 15, titleFontWeight: 700, titleSafeGap: 12 },
    domain: { radius: 12, bgAlpha: 0.08, sideSafeGap: 16, bottomSafeGap: 16, titleBarHeight: 40, titleFontSize: 16 },
  },
  mono: {
    name: 'mono',
    label: '黑白高对比',
    category: 'specialty',
    description: '纯黑白配色、粗线条、无色彩，适合打印/文档',
    edges: {
      main: { color: '#111111', width: 3.2, arrow: { color: '#111111', type: 'arrow' } },
      status: { color: '#333333', width: 2.6, dash: '8 4', arrow: { color: '#333333', type: 'arrow' } },
      support: { color: '#777777', width: 2.2, dash: '6 4', arrow: { color: '#777777', type: 'arrow' } },
      dependency: { color: '#444444', width: 2.4, dash: '6 4', arrow: { color: '#444444', type: 'arrow' } },
      external: { color: '#444444', width: 2.4, dash: '6 4', arrow: { color: '#444444', type: 'arrow' } },
      data: { color: '#000000', width: 2.6, dash: '3 2', arrow: { color: '#000000', type: 'arrow' } },
    },
    node: { borderStyle: 'solid', borderWidth: 3.0, radius: 8, shadow: 'none', paddingScale: 1.0, backgroundPolicy: 'white', accentBar: { position: 'top', width: 6, alpha: 1.0, variant: 'solid' } },
    subdomain: { borderStyle: 'solid', borderWidth: 2, radius: 10, bgAlpha: 0.02, titleFontSize: 15, titleFontWeight: 700, titleSafeGap: 12 },
    domain: { radius: 10, bgAlpha: 0.02, sideSafeGap: 14, bottomSafeGap: 14, titleBarHeight: 38, titleFontSize: 16 },
  },
  sketch: {
    name: 'sketch',
    label: '手绘草图',
    category: 'creative' as StylePresetCategory,
    description: '手绘白板风格，模拟记号笔笔触，适合早期头脑风暴与快速原型',
    edges: {
      main: { color: '#000000', width: 2.5, arrow: { color: '#000000', type: 'arrow' } },
      status: { color: '#D97706', width: 2.5, dash: '8 5', arrow: { color: '#D97706', type: 'arrow' } },
      support: { color: '#6B7280', width: 2.0, dash: '6 4', arrow: { color: '#6B7280', type: 'arrow' } },
      dependency: { color: '#059669', width: 2.0, dash: '6 4', arrow: { color: '#059669', type: 'arrow' } },
      external: { color: '#2563EB', width: 2.0, dash: '6 4', arrow: { color: '#2563EB', type: 'arrow' } },
      data: { color: '#DC2626', width: 2.0, dash: '4 4', arrow: { color: '#DC2626', type: 'arrow' } },
    },
    node: { 
      borderStyle: 'solid', 
      borderWidth: 2.5, 
      radius: 8, 
      shadow: 'none', 
      paddingScale: 1.1, 
      backgroundPolicy: 'white',
      accentBar: { position: 'top', width: 4, alpha: 0.8, variant: 'solid' }
    },
    subdomain: { borderStyle: 'dashed', borderWidth: 2, radius: 10, bgAlpha: 0.03, titleFontSize: 15, titleFontWeight: 700, titleSafeGap: 10 },
    domain: { radius: 10, bgAlpha: 0.04, sideSafeGap: 14, bottomSafeGap: 14, titleBarHeight: 38, titleFontSize: 16 },
  },
};

let currentPreset: FlowStylePreset = PRESETS.standard;

export const diagramStyleManager = {
  getPreset(): FlowStylePreset {
    return currentPreset;
  },
  setPreset(name: string): void {
    const preset = PRESETS[name];
    if (preset) {
      currentPreset = preset;
      // 通知所有监听器
      bus.emit();
    }
  },
  /** 获取所有预设 */
  getPresets(): FlowStylePreset[] {
    return Object.values(PRESETS);
  },
  /** 按分类获取预设 */
  getPresetsByCategory(category: StylePresetCategory): FlowStylePreset[] {
    return Object.values(PRESETS).filter((p) => p.category === category);
  },
  /** 获取所有分类 */
  getCategories(): StylePresetCategory[] {
    return Object.keys(STYLE_CATEGORIES) as StylePresetCategory[];
  },
  /** 获取分类元信息 */
  getCategoryMeta(category: StylePresetCategory) {
    return STYLE_CATEGORIES[category];
  },
  subscribe(listener: () => void) {
    return bus.subscribe(listener);
  },
};


// Removed re-export to break circular dependency with useDiagramStylePreset hook.
// Consumers should import directly from src/core/hooks/useDiagramStylePreset.
