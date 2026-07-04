import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logSharedIconExplorerSearchFailure = (error: unknown): void => {
  safeLog.error('[IconExplorer] Failed to search icons:', redactSensitiveLogValue(error));
};

export const logDiagramIconExplorerFetchFailure = (error: unknown): void => {
  safeLog.error('[DiagramIconExplorer] Failed to fetch icons:', redactSensitiveLogValue(error));
};

export const logIconLibraryPanelSearchFailure = (error: unknown): void => {
  safeLog.error('[IconLibraryPanel] Icon search failed:', redactSensitiveLogValue(error));
};
