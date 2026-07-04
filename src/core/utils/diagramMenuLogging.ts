import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

const DIAGRAM_MENU_COLLAPSED_GROUPS_KEY = 'diagramMenu.collapsedGroups';
const DIAGRAM_MENU_SCROLL_TOP_KEY = 'diagramMenu.scrollTop';

const READ_ACTIONS = new Set(['readCollapsedGroups', 'readMenuScrollTop']);

const getDiagramMenuStorageKey = (action: string): string => {
  switch (action) {
    case 'readMenuScrollTop':
    case 'writeMenuScrollTop':
      return DIAGRAM_MENU_SCROLL_TOP_KEY;
    case 'readCollapsedGroups':
    case 'writeCollapsedGroups':
    default:
      return DIAGRAM_MENU_COLLAPSED_GROUPS_KEY;
  }
};

export const logDiagramMenuStorageFailure = (action: string, error: unknown): void => {
  const key = getDiagramMenuStorageKey(action);
  if (READ_ACTIONS.has(action)) {
    logUiStorageReadFailure(`diagramMenuStorage.${action}`, key, error);
    return;
  }

  logUiStorageWriteFailure(`diagramMenuStorage.${action}`, key, error);
};

export const logModernDiagramMenuFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[ModernDiagramMenu] ${action} failed:`, redactSensitiveLogValue(error));
};
