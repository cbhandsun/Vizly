import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

const toDiagramLogPayload = (name: unknown) => redactSensitiveLogValue({
  name: typeof name === 'string' ? name.slice(0, 120) : name,
});

export const logDataRegistryInitializationFailure = (error: unknown): void => {
  safeLog.error('[DataRegistry] Initialization failed:', redactSensitiveLogValue(error));
};

export const logInvalidRemoteTemplateContent = (error: unknown): void => {
  safeLog.warn('[DataRegistry] Skipped invalid remote template content.', redactSensitiveLogValue(error));
};

export const logRemoteTemplateFetchFailure = (error: unknown): void => {
  safeLog.warn('[DataRegistry] Failed to fetch remote templates, falling back to local static JSONs.', redactSensitiveLogValue(error));
};

export const logInvalidLocalDiagram = (error: unknown): void => {
  safeLog.warn('[DataRegistry] Skipped invalid local diagram from IndexedDB.', redactSensitiveLogValue(error));
};

export const logLocalDiagramLoadFailure = (error: unknown): void => {
  safeLog.error('[DataRegistry] Failed to load local diagrams from IndexedDB.', redactSensitiveLogValue(error));
};

export const logDiagramMissingNodes = (name: unknown): void => {
  safeLog.warn('[DataRegistry] Diagram is missing node data.', toDiagramLogPayload(name));
};

export const logDiagramMissingEdges = (name: unknown): void => {
  safeLog.warn('[DataRegistry] Diagram is missing edge data.', toDiagramLogPayload(name));
};
