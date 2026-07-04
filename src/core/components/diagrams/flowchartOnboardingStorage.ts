import {
    logFlowchartDesignerOnboardingStorageReadFailure,
    logFlowchartDesignerOnboardingStorageWriteFailure,
} from './flowchartDesignerLogging';

export const FLOWCHART_ONBOARDING_DISMISSED_STORAGE_KEY = 'designer.flowchart.onboarding.dismissed';

export const readFlowchartOnboardingDismissed = (
    storage: Pick<Storage, 'getItem'> = localStorage
): boolean => {
    try {
        return storage.getItem(FLOWCHART_ONBOARDING_DISMISSED_STORAGE_KEY) === '1';
    } catch (error) {
        logFlowchartDesignerOnboardingStorageReadFailure(error);
        return false;
    }
};

export const persistFlowchartOnboardingDismissed = (
    storage: Pick<Storage, 'setItem'> = localStorage
): void => {
    try {
        storage.setItem(FLOWCHART_ONBOARDING_DISMISSED_STORAGE_KEY, '1');
    } catch (error) {
        logFlowchartDesignerOnboardingStorageWriteFailure(error);
    }
};
