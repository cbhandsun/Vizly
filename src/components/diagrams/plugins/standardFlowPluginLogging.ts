import { redactSensitiveLogValue } from '@vizly/core/logging';
import { safeLog } from '@vizly/core/logging';

export const logStandardFlowTemplateLoadFailure = (error: unknown): void => {
  safeLog.error(
    '[StandardFlowPlugin] Template load failed:',
    redactSensitiveLogValue(error),
  );
};
