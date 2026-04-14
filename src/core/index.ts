// @ts-nocheck

export { default as FlowchartDesigner } from './components/diagrams/FlowchartDesigner';
export * from './types/common';
// removed to avoid diagramConfig duplicate
// removed to avoid diagramConfig duplicate
export * from './types/diagram-components';
export { useDiagramControls } from './hooks/useDiagramControls';
export * from './components/shared/DiagramStyleManager';
export { EdgeRoutingCoordinator } from './services/EdgeRoutingCoordinator';
export { default as PresentationMode } from './components/presentation/PresentationMode';
export { usePresentationSlides, generateSlides } from './hooks/usePresentationSlides';
export type { PresentationSlide } from './hooks/usePresentationSlides';

// ---- Newly Exported Core Modules ----
export { BaseDiagramComponent, type BaseDiagramConfig } from './components/diagrams/base/BaseDiagramComponent';
export { ModernFlowchartSidebar } from './components/diagrams/ModernFlowchartSidebar';
export { default as MermaidDiagram, type MermaidDiagramProps } from './components/diagrams/MermaidDiagram';
export { getEdgeLabelStyleMenuItems } from './components/diagrams/EdgeLabelStyleMenu';
export { EdgeUpdateProvider, useEdgeUpdate, useEdgeTheme, type Waypoint } from './components/diagrams/EdgeUpdateContext';
export { EditableLabel } from './components/diagrams/EditableLabel';
export { NodeUpdateProvider, useNodeUpdate, useBusinessData } from './components/diagrams/NodeUpdateContext';
export { useCollapsibleGroups, getDescendantIds } from './components/diagrams/hooks/useCollapsibleGroups';
export { DesignerRightSidebar } from './components/diagrams/DesignerRightSidebar';
export * from './components/diagrams/hooks/useSmartRoutingConfig';
export { TopActionButtons } from './components/diagrams/TopActionButtons';

// Diagrams
export { default as SmartEdgeDemoEnhanced } from './components/diagrams/SmartEdgeDemoEnhanced';
export { default as EdgeModeTest } from './components/diagrams/EdgeModeTest';
export { PerformanceDemo } from './components/diagrams/PerformanceDemo';

// Layout Utils
export * as layoutHelpers from './components/diagrams/layoutHelpers';

// Export core modules for standard DiagramView engine usage
export const DiagramCoreInfo = {
  version: '1.0.0',
  license: 'MIT',
  name: '@/core'
};

export * from './utils/diagramAnalyzer';
export * from './types/layout';
export * from './components/config/DiagramConfig';
export * from './config/LayeredConfigManager';
export * from './strategies/LayoutStrategyManager';
export * from './services/ReactFlowAdapter';
export * from './services/DiagramOrchestrator';
export * from './utils/HandlePicker';
export * from './utils/EnhancedTextMeasurement';
export * from './themes/presets';
export * from './themes/ThemeUtils';
export * from './utils/colorUtils';
export * from './utils/antdStaticBridge';
export * from './utils/coerceDiagram';
export * from './utils/consoleCleanup';
export * from './utils/performanceMonitor';
export * from './utils/globalErrorHandler';
export * from './strategies/nodeLayoutStrategy/HorizontalLayoutStrategy';
export * from './strategies/nodeLayoutStrategy/VerticalLayoutStrategy';
export * from './strategies/nodeLayoutStrategy/CenteredLayoutStrategy';
export * from './strategies/nodeLayoutStrategy/DagreLayoutStrategy';
export * from './strategies/nodeLayoutStrategy/GridLayoutStrategy';
export * from './strategies/DomainVerticalLayoutStrategy';
export * from './algorithms/EdgeBundler';
export * from './workers/core/AStarPathfinder';
export * from './workers/core/VisibilityGraphRouter';


export * from './components/diagrams/layoutHelpers';
export * from './utils/layoutUtils';

export * from './utils/nodeValidation';
export * from './utils/remoteDiagramPreview';
export * from './types/diagrams';

export type { StandardDiagramData, StandardNodeData, StandardEdgeData, DiagramType, Theme } from './models/DiagramModels';
export { edgeFactory, EdgeFactory } from './factories/EdgeFactory';
export type { EdgeConfig } from './factories/EdgeFactory';
export { nodeFactory, NodeFactory } from './factories/NodeFactory';
export type { NodeConfig } from './factories/NodeFactory';
export type { ThemeColor } from './themes/types/ThemeTypes';
export { LayoutOptimizer } from './components/layout/LayoutOptimizer';

export * from './utils/diagramSnapshot';
export * from './models/DiagramModels';
export type { ThemePreset } from './themes/types/ThemeTypes';
export { LayoutStrategyManager } from './strategies/LayoutStrategyManager';
export { DomainVerticalLayoutStrategy } from './strategies/DomainVerticalLayoutStrategy';
export { DiagramOrchestrator } from './services/DiagramOrchestrator';
export { ReactFlowAdapter } from './services/ReactFlowAdapter';
export type { PathFindingJob, SharedGraphContext, PathFindingResult } from './types/diagram-components';
export { Logger } from './utils/Logger';
export { ErrorHandler } from './utils/ErrorHandler';
export * from './themes/EnhancedThemeManager';
export * from './themes/ThemePresetManager';
export * from './themes/ThemePerformanceOptimizer';
export { useTheme } from './themes/useCoreTheme';
export * from './config/ConfigIntegration';
export * from './hooks/useDiagramFilter';
export * from './hooks/useDiagramHostStorage';
export { ErrorType, ErrorSeverity, createError } from './utils/ErrorHandler';
export { CommandPalette } from './components/ui/CommandPalette';
export type { CommandItem } from './components/ui/CommandPalette';
export { ShortcutsHelpModal } from './components/ui/ShortcutsHelpModal';
export { useUIState } from './hooks/useUIState';
export * from './components/shared';
export { default as LazyMonacoEditor } from './components/lazy/LazyMonacoEditor';
export { dispatchDiagramControl } from './components/shared/diagramControl';
export { getFlowStyleMaps } from './components/shared/layoutUtils';
export { useEdgeNormalization } from './hooks/useEdgeNormalization';
export { RoutingPerformanceMonitor } from './monitoring/RoutingPerformanceMonitor';
export { logger } from './utils/Logger';
export { baseTypography } from './themes/BaseConstants.ts';
export { baseSpacing } from './themes/BaseConstants.ts';
export { baseBorderRadius } from './themes/BaseConstants.ts';
export { baseShadow } from './themes/BaseConstants.ts';
export { baseAnimation } from './themes/BaseConstants.ts';
export { getDomainMain } from './components/shared/layoutUtils';
export { hexToRgba } from './components/shared/layoutUtils';
export type { MasterDataType } from './types/master-data';
export type { DiagramControlAction } from './components/shared/diagramControl';
export { getDomainTheme } from './components/shared/layoutUtils';
export { default as AppLayout } from './components/layout/AppLayout';
export { AntdApiBridge } from './components/shared/AntdApiBridge';
export { CryptoService } from './utils/CryptoService';
export { ErrorBoundary, withErrorBoundary } from './components/shared/ErrorBoundary';
export { usePanelZoom } from './hooks/usePanelZoom';
export { fetchRemoteDiagramPreview } from './utils/remoteDiagramPreview';
export * from './themes/types/ThemeTypes';

export * from './hooks/useConfigIntegration';

// ---- Json & Utils System ----
export { JsonEditorModal } from './components/diagrams/JsonEditorModal';
export * from './components/diagrams/designerUtils';

// ---- Plugin System ----
export * from './types/plugin';
export { PluginRegistry } from './services/PluginRegistry';
export * from './plugins/FlowchartPlugin';
export * from './plugins/ArchitecturePlugin';
export * from './plugins/MindMapPlugin';
export { default as UnifiedDesigner } from './components/diagrams/FlowchartDesigner';
export type { DiagramComponentProps as UnifiedDesignerProps } from './types/diagram-components';
export { default as ArchitectureNode } from './components/custom-nodes/ArchitectureNode';

// ---- Auto Register Built-in Plugins ----
import { PluginRegistry as InternalPluginRegistry } from './services/PluginRegistry';
import { FlowchartPlugin as InternalFlowchartPlugin } from './plugins/FlowchartPlugin';
import { ArchitecturePlugin as InternalArchitecturePlugin } from './plugins/ArchitecturePlugin';
import { TimelinePlugin as InternalTimelinePlugin } from './plugins/TimelinePlugin';
import { MindMapPlugin as InternalMindMapPlugin } from './plugins/MindMapPlugin';

export function initializePlugins() {
  const __registry = InternalPluginRegistry.getInstance();
  if (!__registry.getPlugin('flowchart')) {
    __registry.register(new InternalFlowchartPlugin(), true);
    __registry.register(new InternalArchitecturePlugin());
    __registry.register(new InternalTimelinePlugin());
    __registry.register(new InternalMindMapPlugin());
  }
}

export * from './hooks/useTopologyLinter';
