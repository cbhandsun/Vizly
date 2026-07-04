import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logFlowchartShapesDragPreviewFailure = (label: string, error: unknown): void => {
  safeLog.warn(
    `[FlowchartShapesPanel] Failed to create drag preview for "${label}":`,
    redactSensitiveLogValue(error)
  );
};
