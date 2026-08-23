/**
 * Public core boundary.
 *
 * This module deliberately exposes portable contracts and explicit runtime
 * entry points only. UI components, individual plugins, and implementation
 * helpers must be imported from their owning module so an accidental root
 * import cannot load the whole designer or hide a dependency boundary.
 */

export const DiagramCoreInfo = {
  version: '1.0.0',
  license: 'MIT',
  name: '@/core',
} as const;

// Shared domain contracts.
export * from './types/common';
export type {
  DiagramComponentProps,
  DiagramDefinition,
  ResolvedEdgeConfig,
} from './types/diagram-components';
export type {
  BatchPathFindingJob,
  BatchPathFindingResult,
  PathFindingJob,
  PathFindingRequest,
  PathFindingResult,
  SharedGraphContext,
} from './types/routing';
export type {
  DiagramType,
  StandardDiagramData,
  StandardEdgeData,
  StandardNodeData,
} from './models/DiagramModels';

// Plugin contracts and their explicit asynchronous registration boundary.
export type {
  CommandItem,
  DiagramTypePlugin,
  PluginContext,
  SidebarPanel,
} from './types/plugin';
export { PluginRegistry } from './services/PluginRegistry';
export { ensureBuiltInPlugins } from './plugins/builtInPlugins';

// Runtime coordinators that do not expose UI implementation details.
export { LayoutStrategyManager } from './strategies/LayoutStrategyManager';
