import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDiagramHostStorageReadFailure = (key: string, error: unknown): void => {
    safeLog.warn(`[diagramHostStorage] Failed to read "${key}":`, redactSensitiveLogValue(error));
};

export const logDiagramHostStorageWriteFailure = (key: string, error: unknown): void => {
    safeLog.warn(`[diagramHostStorage] Failed to write "${key}":`, redactSensitiveLogValue(error));
};
