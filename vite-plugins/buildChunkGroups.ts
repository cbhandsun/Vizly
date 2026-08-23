const normalizeModuleId = (id: string): string => id.replace(/\\/g, '/');

const APP_SAFE_LOGGING_FILES = new Set([
  'consoleCleanup.ts',
  'logSecurity.ts',
  'uiStorageLogging.ts',
]);

const FLOWCHART_RUNTIME_MODULES = new Set([
  '/src/core/components/diagrams/AccessibleInputClearIcon.tsx',
  '/src/core/components/diagrams/ShapePreview.tsx',
  '/src/core/components/diagrams/diagramImportLogging.ts',
  '/src/core/components/diagrams/layerNameInput.ts',
  '/src/core/hooks/useTopologyLinter.ts',
  '/src/core/types/layout.ts',
  '/src/core/utils/diagramDiff.ts',
  '/src/core/utils/downloadUtils.ts',
  '/src/core/utils/fileImportGuards.ts',
  '/src/core/utils/flowchartClipboard.ts',
]);

const DISPLAY_ROUTING_NEUTRAL_MODULES = new Set([
  '/src/core/config/DiagramConfig.ts',
  '/src/core/config/DiagramConfigBoundary.ts',
  '/src/core/config/DiagramConfigDefaults.ts',
  '/src/core/config/DiagramConfigManager.ts',
  '/src/core/routing/routingVersion.ts',
  '/src/core/routing/utils/handleUtils.ts',
  '/src/core/types/flow.ts',
  '/src/core/components/shared/baseReactFlowAbsolutePositions.ts',
  '/src/core/components/shared/baseReactFlowLayoutEdgeRoutingData.ts',
  '/src/core/strategies/layoutLogging.ts',
]);

const FLOWCHART_DESIGNER_STARTUP_MODULES = new Set([
  '/src/core/hooks/useConfigIntegration.ts',
  '/src/core/components/shared/DiagramStyleManager.ts',
  '/src/core/utils/layoutStorage.ts',
  '/src/core/components/shared/exportUtils.ts',
  '/src/core/components/diagrams/LayerManagementPanel.tsx',
  '/src/core/components/shared/baseReactFlowAssistiveVisibility.ts',
  '/src/core/components/custom-nodes/FlowchartNode.tsx',
  '/src/core/plugins/FlowchartPlugin.tsx',
  '/src/core/components/shared/DiagramControlBridge.tsx',
  '/src/core/components/diagrams/NodeTemplatePanel.tsx',
  '/src/core/components/shared/FloatingToolbar/index.ts',
  '/src/core/components/diagrams/flowchartSearchReplace.ts',
  '/src/components/diagrams/ui/openLocalWorkspaceManager.tsx',
  '/src/core/services/PluginRegistry.ts',
  '/src/core/utils/customPresetStorage.ts',
  '/src/components/diagrams/hooks/diagramStorageLogging.ts',
  '/src/core/components/diagrams/hooks/treeLayoutTopology.ts',
]);

const FLOWCHART_DESIGNER_MICRO_MODULES = new Set([
  '/src/core/components/shared/generated/baseReactFlowPrecompiledRouteLoaders.ts',
  '/src/components/diagramViewerTemplateSelection.ts',
  '/src/core/components/shared/viewportStore.ts',
  '/src/core/components/shared/diagramNodeBounds.ts',
  '/src/core/services/CollaborationService.ts',
  '/src/core/components/diagrams/freehandStrokeModel.ts',
  '/src/core/store/useDiagramStore.ts',
  '/src/core/utils/boundedResponse.ts',
  '/src/core/utils/diagramJsonImport.ts',
  '/src/core/utils/iconifySecurity.ts',
  '/src/hooks/useModalFocusTrap.ts',
  '/src/core/components/diagrams/nodeDescriptionText.ts',
  '/src/core/components/diagrams/useTransientStatusMessage.ts',
  '/src/core/utils/flowDataBridge.ts',
  '/src/core/utils/collaborationSecurity.ts',
  '/src/core/utils/layerName.ts',
  '/src/core/components/shared/baseReactFlowPrecompiledRoutePrefetch.ts',
  '/src/core/utils/mermaidDocumentBoundary.ts',
  '/src/components/ai/aiDiagramImport.ts',
  '/src/core/components/diagrams/annotationContent.ts',
  '/src/core/components/diagrams/containerCollapseRequest.ts',
  '/src/core/components/diagrams/useNodeUpdate.ts',
  '/src/core/components/shared/iconSearchLogging.ts',
  '/src/core/components/ui/dialogEscapeLayer.ts',
  '/src/hooks/modalNestingContext.ts',
  '/src/core/hooks/diagramExportLogging.ts',
  '/src/core/components/shared/diagramControlLogging.ts',
  '/src/core/components/mindmap-v2/mindMapAIConfigEvent.ts',
  '/src/core/components/diagrams/commentPageScope.ts',
  '/src/core/components/ui/viewportOverlayPortal.ts',
  '/src/core/components/diagrams/edgePropertyBoundary.ts',
]);

const basename = (id: string): string => {
  const normalized = normalizeModuleId(id);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
};

/** Safe logging is shared by several lazy features and must stay feature-neutral. */
export const matchesAppSafeLoggingModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id);
  return normalized.includes('/src/core/utils/')
    && APP_SAFE_LOGGING_FILES.has(basename(normalized));
};

/** Theme presets are lazy modules, but the diagram route loads them together. */
/** Co-load the small modules on the synchronous flowchart startup path. */
export const matchesFlowchartRuntimeModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id);
  return [...FLOWCHART_RUNTIME_MODULES].some(suffix => normalized.endsWith(suffix));
};

/**
 * Small configuration modules used by both the app and display worker must not
 * pull the full routing implementation into the initial diagram route.
 */
export const matchesDisplayRoutingNeutralModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id).split('?', 1)[0];
  return [...DISPLAY_ROUTING_NEUTRAL_MODULES].some(suffix => normalized.endsWith(suffix));
};

export const matchesFlowchartDesignerStartupModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id).split('?', 1)[0];
  return [...FLOWCHART_DESIGNER_STARTUP_MODULES].some(suffix => normalized.endsWith(suffix));
};

export const matchesFlowchartDesignerMicroModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id).split('?', 1)[0];
  return [...FLOWCHART_DESIGNER_MICRO_MODULES].some(suffix => normalized.endsWith(suffix));
};
