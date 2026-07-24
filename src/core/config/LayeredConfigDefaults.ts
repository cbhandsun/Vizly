import type { ConfigSchema } from './LayeredConfigTypes';

/** 注册内置分层配置 schema。 */
export const registerDefaultLayeredConfigSchemas = (
  registerSchema: (schema: ConfigSchema) => void
): void => {
    // 主题性能配置模式
    registerSchema({
      key: 'theme.performance',
      type: 'object',
      defaultValue: {
        enableTransitions: true,
        transitionDuration: 300,
        batchUpdates: true,
        debounceDelay: 100,
        cacheThemes: true,
        preloadThemes: ['light', 'dark']
      },
      description: '主题性能优化配置',
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null) return false;
          return true;
        },
        description: '必须是有效的性能配置对象'
      },
      group: 'theme'
    });

    // 图表配置模式
    registerSchema({
      key: 'diagram.node.width',
      type: 'number',
      defaultValue: 200,
      description: '节点默认宽度',
      validator: {
        validate: (value: number) => typeof value === 'number' && value > 0 && value <= 1000,
        description: '必须是1-1000之间的数字'
      },
      group: 'diagram'
    });

    registerSchema({
      key: 'diagram.node.height',
      type: 'number',
      defaultValue: 60,
      description: '节点默认高度',
      validator: {
        validate: (value: number) => typeof value === 'number' && value > 0 && value <= 500,
        description: '必须是1-500之间的数字'
      },
      group: 'diagram'
    });

    registerSchema({
      key: 'diagram.spacing.horizontal',
      type: 'number',
      defaultValue: 100,
      description: '水平间距',
      validator: {
        validate: (value: number) => typeof value === 'number' && value >= 0 && value <= 500,
        description: '必须是0-500之间的数字'
      },
      group: 'diagram'
    });

    registerSchema({
      key: 'diagram.spacing.vertical',
      type: 'number',
      defaultValue: 80,
      description: '垂直间距',
      validator: {
        validate: (value: number) => typeof value === 'number' && value >= 0 && value <= 500,
        description: '必须是0-500之间的数字'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：视图层域宽更新开关
     * - 目的：控制视图层在回收域容器高度时，是否同时按最终投影精确更新“域宽与左锚 x”
     * - 默认：false（仅更新高度与 y，保持既有左锚与宽度）；设为 true 时启用宽度与左锚更新
     */
    registerSchema({
      key: 'diagram.layout.view.updateDomainWidth',
      type: 'boolean',
      defaultValue: true,
      description: '视图层是否回收域宽并更新左锚',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：域宽是否仅由子域容器参与计算
     * - 目的：域宽最终投影时，仅以“可见子域容器”的水平投影参与包围盒计算，忽略普通业务节点；
     * - 默认：true（仅子域容器参与，保证域宽对齐与子域并排一致性）
     */
    registerSchema({
      key: 'diagram.layout.domainWidthBySubGroupsOnly',
      type: 'boolean',
      defaultValue: true,
      description: '域宽计算是否仅按子域容器参与',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：是否将子域容器与自由节点混排为块
     * - 默认：false（仅对子域容器做块级纵向堆叠；自由节点按节点布局策略单独排列）
     */
    registerSchema({
      key: 'diagram.layout.subGroupBlockLayout',
      type: 'boolean',
      defaultValue: false,
      description: '子域容器与自由节点是否混排为块',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });

    /**
     * 函数级注释：视图层域高更新开关
     * - 目的：控制视图层在回收域容器高度时是否参与更新；
     * - 默认：false（高度仅由策略层最终投影回收），设为 true 时视图层也会回收高度与 y。
     */
    registerSchema({
      key: 'diagram.layout.view.updateDomainHeight',
      type: 'boolean',
      defaultValue: false,
      description: '视图层是否回收域高并更新顶边 y',
      validator: {
        validate: (value: boolean) => typeof value === 'boolean',
        description: '必须是布尔值'
      },
      group: 'diagram'
    });
};
