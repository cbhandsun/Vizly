import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logAIConfigModalCloudLoadFailure = (error: unknown): void => {
  safeLog.error('AIConfigModal: Failed to load cloud config', redactSensitiveLogValue(error));
};

export const logAIConfigCloudSaveFailure = (error: unknown): void => {
  safeLog.error('Cloud save failed', redactSensitiveLogValue(error));
};

export const logAIConfigEndpointValidationFailure = (providerName: string, action: 'testConnection' | 'fetchModels', error: unknown): void => {
  safeLog.warn(`[AIConfigModal] ${action} endpoint validation failed for "${providerName}":`, redactSensitiveLogValue(error));
};

export const logAIConfigRequestFailure = (action: 'testConnection' | 'fetchModels', providerName: string, error: unknown): void => {
  safeLog.error(`[AIConfigModal] ${action} failed for "${providerName}":`, redactSensitiveLogValue(error));
};

export const logAIConfigStorageFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[aiConfigStorage] ${action} failed:`, redactSensitiveLogValue(error));
};

export const logAIChatCloudConfigLoadFailure = (error: unknown): void => {
  safeLog.error('AIChatPanel: Failed to load cloud AI config', redactSensitiveLogValue(error));
};

export const logAIChatEndpointValidationFailure = (providerName: string, error: unknown): void => {
  safeLog.warn(`[AIChatPanel] Invalid endpoint for provider "${providerName}":`, redactSensitiveLogValue(error));
};

export const logAIChatCancelFailure = (error: unknown): void => {
  safeLog.warn('[AIChatPanel] Stream cancel failed:', redactSensitiveLogValue(error));
};

export const logAIChatInvalidDiagramSavePayload = (error: unknown): void => {
  safeLog.warn('[AIChatPanel] Invalid AI diagram payload for save:', redactSensitiveLogValue(error));
};

export const logAIChatLocalIndexPersistFailure = (error: unknown): void => {
  safeLog.warn('[AIChatPanel] Failed to persist local diagram index:', redactSensitiveLogValue(error));
};

export const logBlockedAutonomousCommand = (action: unknown, reason: unknown): void => {
  safeLog.warn('[AI Pilot] Blocked autonomous command:', redactSensitiveLogValue({ action, reason }));
};

export const logAICommandExecutionError = (error: unknown, command: unknown): void => {
  safeLog.error('[AI Pilot] Command execution error:', redactSensitiveLogValue({ error, command }));
};
