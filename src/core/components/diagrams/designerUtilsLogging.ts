import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDesignerUtilsMigrationFailure = (pluginId: string, error: unknown): void => {
  safeLog.error(`[designerUtils] Diagram migration failed for ${pluginId}:`, redactSensitiveLogValue(error));
};

export const logDesignerUtilsThemeRestoreFailure = (themeId: string, error: unknown): void => {
  safeLog.warn(`[designerUtils] Failed to restore theme "${themeId}":`, redactSensitiveLogValue(error));
};

export const logDesignerUtilsDomainLayoutFailure = (error: unknown): void => {
  safeLog.error('[designerUtils] Domain layout failed, falling back to flat dagre:', redactSensitiveLogValue(error));
};
