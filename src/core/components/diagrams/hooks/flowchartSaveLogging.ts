import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

import type { FlowchartSaveTarget } from './useTrackedFlowchartSaves';

export const logTrackedFlowchartSaveFailure = (
    target: FlowchartSaveTarget,
    error: unknown,
): void => {
    safeLog.error(
        `[useTrackedFlowchartSaves] ${target} save failed:`,
        redactSensitiveLogValue(error),
    );
};
