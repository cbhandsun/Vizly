import type { PluginRegistry } from '../services/PluginRegistry';
import type { DiagramTypePlugin } from '../types';

let builtInPluginsPromise: Promise<PluginRegistry> | undefined;
const targetedPluginPromises = new Map<string, Promise<PluginRegistry>>();

const registerIfMissing = (
  registry: PluginRegistry,
  plugin: DiagramTypePlugin,
  isDefault = false,
) => {
  if (!registry.getPlugin(plugin.id)) {
    registry.register(plugin, isDefault);
  }
};

const registerBuiltInPlugins = async () => {
  const [
    { PluginRegistry },
    { FlowchartPlugin },
    { ArchitecturePlugin },
    { TimelinePlugin },
    { MindMapPlugin },
    { SwimlanePlugin },
    { ERDiagramPlugin },
    { NetworkTopologyPlugin },
    { SequencePlugin },
  ] = await Promise.all([
    import('../services/PluginRegistry'),
    import('./FlowchartPlugin'),
    import('./ArchitecturePlugin'),
    import('./TimelinePlugin'),
    import('./MindMapPlugin'),
    import('./SwimlanePlugin'),
    import('./ERDiagramPlugin'),
    import('./NetworkTopologyPlugin'),
    import('./SequencePlugin'),
  ]);

  const registry = PluginRegistry.getInstance();
  registerIfMissing(registry, new FlowchartPlugin(), true);
  registerIfMissing(registry, new ArchitecturePlugin());
  registerIfMissing(registry, new TimelinePlugin());
  registerIfMissing(registry, new MindMapPlugin());
  registerIfMissing(registry, new SwimlanePlugin());
  registerIfMissing(registry, new ERDiagramPlugin());
  registerIfMissing(registry, new NetworkTopologyPlugin());
  registerIfMissing(registry, new SequencePlugin());

  return registry;
};

const pluginLoaders = {
  flowchart: async () => (await import('./FlowchartPlugin')).FlowchartPlugin,
  'architecture-diagram': async () => (await import('./ArchitecturePlugin')).ArchitecturePlugin,
  'timeline-diagram': async () => (await import('./TimelinePlugin')).TimelinePlugin,
  mindmap: async () => (await import('./MindMapPlugin')).MindMapPlugin,
  'swimlane-diagram': async () => (await import('./SwimlanePlugin')).SwimlanePlugin,
  'er-diagram': async () => (await import('./ERDiagramPlugin')).ERDiagramPlugin,
  network: async () => (await import('./NetworkTopologyPlugin')).NetworkTopologyPlugin,
  'sequence-diagram': async () => (await import('./SequencePlugin')).SequencePlugin,
} as const;

type BuiltInPluginId = keyof typeof pluginLoaders;

const isBuiltInPluginId = (pluginId: string): pluginId is BuiltInPluginId => (
  pluginId in pluginLoaders
);

const registerTargetedBuiltInPlugin = async (pluginId: BuiltInPluginId) => {
  const [{ PluginRegistry }, FlowchartPlugin] = await Promise.all([
    import('../services/PluginRegistry'),
    pluginLoaders.flowchart(),
  ]);

  const registry = PluginRegistry.getInstance();
  registerIfMissing(registry, new FlowchartPlugin(), true);

  if (pluginId !== 'flowchart') {
    const PluginClass = await pluginLoaders[pluginId]();
    registerIfMissing(registry, new PluginClass());
  }

  return registry;
};

export const ensureBuiltInPlugins = (pluginId?: string) => {
  if (pluginId) {
    const key = isBuiltInPluginId(pluginId) ? pluginId : 'flowchart';
    if (!targetedPluginPromises.has(key)) {
      targetedPluginPromises.set(key, registerTargetedBuiltInPlugin(key).catch((error) => {
        targetedPluginPromises.delete(key);
        throw error;
      }));
    }
    return targetedPluginPromises.get(key)!;
  }

  builtInPluginsPromise ??= registerBuiltInPlugins().catch((error) => {
    builtInPluginsPromise = undefined;
    throw error;
  });

  return builtInPluginsPromise;
};
