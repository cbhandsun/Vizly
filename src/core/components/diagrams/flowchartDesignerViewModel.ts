import { safeLog } from '../../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../../utils/logSecurity';

export type FlowchartDesignerViewModel = Record<string, any>;

export const resolveFlowchartPluginContribution = <T>(
    region: 'sidebar' | 'toolbar' | 'canvas',
    contribute: (() => T) | null | undefined,
    fallback: T,
): T => {
    if (!contribute) return fallback;
    try {
        return contribute();
    } catch (error) {
        safeLog.warn(
            `[FlowchartDesigner] Plugin ${region} contribution failed:`,
            redactSensitiveLogValue(error),
        );
        return fallback;
    }
};
