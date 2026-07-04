import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logFlowchartDesignerOnboardingStorageReadFailure = (error: unknown): void => {
  safeLog.warn(
    '[FlowchartDesigner] Failed to read onboarding dismissal state:',
    redactSensitiveLogValue(error)
  );
};

export const logFlowchartDesignerOnboardingStorageWriteFailure = (error: unknown): void => {
  safeLog.warn(
    '[FlowchartDesigner] Failed to persist onboarding dismissal state:',
    redactSensitiveLogValue(error)
  );
};

export const logFlowchartDesignerMermaidImportFailure = (error: unknown): void => {
  safeLog.error(
    '[FlowchartDesigner] Mermaid import failed:',
    redactSensitiveLogValue(error)
  );
};
