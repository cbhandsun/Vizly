import { focusFlowchartImportTrigger } from './flowchartImportFocus';

type FocusScheduler = (callback: () => void) => void;

const scheduleAfterOverlayCleanup: FocusScheduler = (callback) => {
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(callback);
    });
};

export const openFlowchartImportFilePicker = (
    input: HTMLInputElement | null,
    {
        focusReturn = focusFlowchartImportTrigger,
        scheduleFocusReturn = scheduleAfterOverlayCleanup,
    }: {
        focusReturn?: () => boolean;
        scheduleFocusReturn?: FocusScheduler;
    } = {},
): boolean => {
    if (!input?.isConnected || input.disabled) return false;

    input.click();
    scheduleFocusReturn(() => {
        focusReturn();
    });
    return true;
};
