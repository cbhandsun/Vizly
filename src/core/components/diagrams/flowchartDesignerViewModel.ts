import { safeLog } from '../../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../../utils/logSecurity';
import type { useFlowchartDesignerController } from './useFlowchartDesignerController';

export type FlowchartDesignerViewModel =
    ReturnType<typeof useFlowchartDesignerController>['viewModel'];

export interface FlowchartDesignerViewProps { model: FlowchartDesignerViewModel }

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
