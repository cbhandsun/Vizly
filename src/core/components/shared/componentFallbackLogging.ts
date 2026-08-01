import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logArchitectureNodeMissingData = (): void => {
  safeLog.warn('[ArchitectureNode] Rendered without data. Falling back to invalid-node placeholder.');
};

export const logUnifiedDesignerUnsupportedAction = (
  method: 'updateNodesBatch' | 'updateEdgesBatch' | 'takeSnapshot' | 'addNode',
  pluginId?: string
): void => {
  const pluginSuffix = pluginId ? ` for plugin "${pluginId}"` : '';
  safeLog.warn(`[UnifiedDesigner] ${method} is not implemented in the placeholder context${pluginSuffix}.`);
};

export const logUnifiedDesignerBatchUpdateUnavailable = (method: 'updateNodesBatch' | 'updateEdgesBatch'): void => {
  logUnifiedDesignerUnsupportedAction(method);
};

export const logUnifiedDesignerInitialDataFallback = (pluginId: string | undefined, error: unknown): void => {
  const pluginSuffix = pluginId ? ` for plugin "${pluginId}"` : '';
  safeLog.warn(
    `[UnifiedDesigner] Failed to parse initialData${pluginSuffix}. Falling back to empty state.`,
    redactSensitiveLogValue(error)
  );
};
