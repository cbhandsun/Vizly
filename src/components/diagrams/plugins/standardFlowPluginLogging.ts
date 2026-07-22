import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { safeLog } from '@/core/utils/consoleCleanup';

export const logStandardFlowTemplateLoadFailure = (error: unknown): void => {
  safeLog.error(
    '[StandardFlowPlugin] Template load failed:',
    redactSensitiveLogValue(error),
  );
};
