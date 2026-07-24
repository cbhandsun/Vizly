import { safeLog } from '../../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../../utils/logSecurity';

/**
 * Composition-root payload assembled by FlowchartDesigner and consumed by its
 * region renderers. The concrete shape is intentionally inferred at assembly
 * sites until the shell is split into smaller, domain-specific view models.
 */
export type FlowchartDesignerViewModel = Record<string, ReturnType<typeof JSON.parse>>;

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
