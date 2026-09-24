import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';

export const logDiagramLayoutFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[DiagramLayout] ${action} failed:`, redactSensitiveLogValue(error));
};
