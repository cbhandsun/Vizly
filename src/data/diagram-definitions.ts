// diagram-definitions.ts
import { lazy, createElement } from 'react';
import type { DiagramDefinition } from '@/core/types/diagram-components';
import { ensureBuiltInPlugins } from '@/core/plugins/builtInPlugins';
import {
  FaSitemap,
  FaWarehouse,
  FaCalendarCheck,
  FaBezierCurve,
  FaCodeBranch,
  FaEdit,
  FaNetworkWired,
  FaBrain,
} from 'react-icons/fa';

const loadFlowchartDesigner = async (pluginId?: string) => {
  const [{ default: FlowchartDesigner }] = await Promise.all([
    import('@/core/components/diagrams/FlowchartDesigner'),
    ensureBuiltInPlugins(pluginId || 'flowchart'),
  ]);

  return {
    default: (props: any) => createElement(
      FlowchartDesigner,
      pluginId ? { ...props, pluginId } : props
    )
  };
};

export const diagramDefinitions: DiagramDefinition[] = [
  {
    id: 'generic-standard-diagram',
    name: '通用标准架构图',
    titleKey: 'diagram.title.genericStandard',
    component: lazy(() => loadFlowchartDesigner()),
    tags: ['generic', 'standard', 'json'],
    icon: FaSitemap,
    supportsLayoutSwitch: true,
    supportsMainFlowToggle: true,
  },
  {
    id: 'warehouse-3d-digital-twin',
    name: '3D 智能仓库展示',
    titleKey: 'diagram.title.warehouse3d',
    component: lazy(() => import('../components/lazy/Lazy3DViewer')),
    tags: ['3d', 'warehouse', 'digital-twin'],
    icon: FaWarehouse,
  },
  {
    id: 'architecture-diagram-unified',
    name: '🌟 统一架构：企业架构图',
    component: lazy(() => loadFlowchartDesigner('architecture-diagram')),
    category: 'other',
    tags: ['enterprise', 'architecture', 'unified', 'plugin'],
    icon: FaSitemap,
  },
  {
    id: 'timeline-diagram-v2',
    name: '🌟 统一架构：时间线图',
    component: lazy(() => loadFlowchartDesigner('timeline-diagram')),
    category: 'other',
    tags: ['timeline', 'project', 'unified', 'plugin'],
    icon: FaCalendarCheck,
  },
  {
    id: 'standard-flow-unified',
    name: '🌟 统一架构：标准流程图',
    // [Fix] 注册逻辑提升到 .then() 链中：lazy() 的 Promise resolve 前注册完毕，
    // 消除了在渲染路径中 fire-and-forget async 调用导致的竞态窗口。
    component: lazy(() =>
      Promise.all([
        import('@/core/components/diagrams/FlowchartDesigner'),
        import('@/core/services/PluginRegistry'),
      ]).then(async ([designerModule, registryModule]) => {
        const { PluginRegistry } = registryModule;
        const registry = PluginRegistry.getInstance();
        if (!registry.getPlugin('standard-flow')) {
          const { StandardFlowPlugin } = await import('../components/diagrams/plugins/StandardFlowPlugin');
          registry.register(new StandardFlowPlugin(), true);
        }
        return {
          default: (props: any) =>
            createElement(designerModule.default, { ...props, pluginId: 'standard-flow' })
        };
      })
    ),
    category: 'other',
    tags: ['standard', 'flow', 'unified', 'plugin'],
    icon: FaSitemap,
  },
  {
    id: 'hello-world-unified',
    name: '🌟 统一架构：示例插件 (SDK)',
    // [Fix] 注册逻辑提升到 .then() 链中（同 standard-flow-unified）
    component: lazy(() =>
      Promise.all([
        import('@/core/components/diagrams/FlowchartDesigner'),
        import('@/core/services/PluginRegistry'),
      ]).then(async ([designerModule, registryModule]) => {
        const { PluginRegistry } = registryModule;
        const registry = PluginRegistry.getInstance();
        if (!registry.getPlugin('hello-world')) {
          const { HelloWorldPlugin } = await import('../components/diagrams/plugins/HelloWorldPlugin');
          registry.register(new HelloWorldPlugin());
        }
        return {
          default: (props: any) =>
            createElement(designerModule.default, { ...props, pluginId: 'hello-world' })
        };
      })
    ),
    category: 'other',
    tags: ['sdk', 'hello-world', 'unified', 'plugin'],
    icon: FaSitemap,
  },
  {
    id: 'theme-color-comparison',
    name: '主题颜色对比',
    component: lazy(() => import('../pages/ThemeColorComparison')),
    category: 'debug',
    tags: ['theme', 'color', 'comparison'],
    icon: FaBezierCurve,
  },
  {
    id: 'theme-side-by-side-comparison',
    name: '主题并排对比',
    component: lazy(() => import('../pages/ThemeSideBySideComparison')),
    category: 'debug',
    tags: ['theme', 'side-by-side', 'comparison'],
    icon: FaBezierCurve,
  },
  {
    id: 'smart-edge-enhanced',
    name: 'Smart Edge Enhancements',
    component: lazy(() => import('@/core/components/diagrams/SmartEdgeDemoEnhanced')),
    category: 'debug',
    tags: ['smart-edge', 'demo', 'enhancements'],
    icon: FaCodeBranch,
  },
  {
    id: 'edge-mode-test',
    name: 'Edge Mode Test',
    component: lazy(() => import('@/core/components/diagrams/EdgeModeTest')),
    category: 'debug',
    tags: ['smart-edge', 'native', 'pathType', 'test'],
    icon: FaEdit,
  },
  {
    id: 'performance-demo',
    name: 'Smart Edge Performance',
    component: lazy(() => import('@/core/components/diagrams/PerformanceDemo').then(m => ({ default: m.PerformanceDemo }))),
    category: 'debug',
    tags: ['performance', 'smart-edge', 'demo'],
    icon: FaCodeBranch,
  },
  {
    id: 'flowchart-designer',
    name: '流程图设计器',
    titleKey: 'diagram.title.flowchartDesigner',
    component: lazy(() => loadFlowchartDesigner()),
    category: 'other',
    tags: ['flowchart', 'designer', 'tool'],
    icon: FaEdit,
  },
  {
    id: 'network-topology-unified',
    name: '🌟 统一架构：网络拓扑图',
    component: lazy(() => loadFlowchartDesigner('network')),
    category: 'other',
    tags: ['network', 'topology', 'aws', 'azure', 'gcp', 'unified', 'plugin'],
    icon: FaNetworkWired,
  },
  {
    id: 'mindmap-unified',
    name: '🌿 统一架构：思维导图',
    component: lazy(() =>
      loadFlowchartDesigner('mindmap')
    ),
    category: 'other',
    tags: ['mindmap', 'mind-map', 'brainstorm', 'unified', 'plugin'],
    icon: FaBrain,
  },
];
