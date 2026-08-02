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
  '/src/core/themes/useCoreTheme.ts',
  '/src/core/types/layout.ts',
  '/src/core/utils/antdStaticBridge.ts',
  '/src/core/utils/diagramDiff.ts',
  '/src/core/utils/domainKey.ts',
  '/src/core/utils/downloadUtils.ts',
  '/src/core/utils/fileImportGuards.ts',
  '/src/core/utils/flowchartClipboard.ts',
  '/src/core/utils/formatRelativeTime.ts',
  '/src/core/utils/inputBoundary.ts',
  '/src/core/utils/sanitizeHtml.ts',
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
export const matchesThemePresetModule = (id: string): boolean => (
  normalizeModuleId(id).includes('/src/core/themes/presets/')
);

/** Co-load the small modules on the synchronous flowchart startup path. */
export const matchesFlowchartRuntimeModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id);
  return [...FLOWCHART_RUNTIME_MODULES].some(suffix => normalized.endsWith(suffix));
};
