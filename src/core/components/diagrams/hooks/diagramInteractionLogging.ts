import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const logConnectionMicrointeractionFailure = (operation: string, error: unknown): void => {
  safeLog.warn(`[useConnectionMicrointeractions] ${operation} failed:`, redactSensitiveLogValue(error));
};

export const logDiagramDragDropImportRejected = (reason: unknown): void => {
  safeLog.warn('[useDiagramDragDrop] reverse import rejected:', redactSensitiveLogValue(reason));
};

export const logDiagramDragDropReverseImportFailure = (error: unknown): void => {
  safeLog.error('[useDiagramDragDrop] reverse import failed:', redactSensitiveLogValue(error));
};

export const logDiagramDragDropFailure = (error: unknown): void => {
  safeLog.error('[useDiagramDragDrop] drop failed:', redactSensitiveLogValue(error));
};

export const logLayoutOrphanEdgeDropped = (details: {
  edgeId: string;
  hasSource: boolean;
  hasTarget: boolean;
}): void => {
  safeLog.warn('[useLayoutStrategy] Dropping orphan edge after layout sanitation:', details);
};

export const logLayoutNoLayoutableNodes = (): void => {
  safeLog.warn('[useLayoutStrategy] No layoutable nodes available; skipping layout.');
};

export const logLayoutStrategyFailure = (strategyName: string, error: unknown): void => {
  const redacted = redactSensitiveLogValue(error);
  const detail = isRecord(redacted)
    && typeof redacted.message === 'string'
    ? redacted.message
    : redacted;
  safeLog.error(`[useLayoutStrategy] Layout failed (${strategyName}):`, detail);
};

export const logLayoutStrategySafetyFallback = (strategyName: string): void => {
  safeLog.info(`[useLayoutStrategy] Using ELK safety fallback for hard-defective ${strategyName} geometry.`);
};

export const logLayoutStrategyDomainPreservingFallback = (strategyName: string): void => {
  safeLog.info(`[useLayoutStrategy] Using domain-preserving layered fallback for hard-defective ${strategyName} geometry.`);
};

export const logSmartRoutingConfigLayerSyncFailure = (error: unknown): void => {
  safeLog.warn('[useSmartRoutingConfig] Layered config sync failed:', redactSensitiveLogValue(error));
};

export const logSmartRoutingConfigSyncFailure = (error: unknown): void => {
  safeLog.warn('[useSmartRoutingConfig] Config sync failed:', redactSensitiveLogValue(error));
};
