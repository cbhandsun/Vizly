import { useCallback } from 'react';
import type { TFunction } from 'i18next';

import { appMessage } from '@/core/utils/antdStaticBridge';
import { dispatchDiagramControl } from '../../shared/diagramControl';

interface UseFlowchartHostActionsOptions {
    diagramId?: string;
    onOpenSettings?: () => void;
    t: TFunction;
}

export const useFlowchartHostActions = ({
    diagramId,
    onOpenSettings,
    t,
}: UseFlowchartHostActionsOptions) => {
    const handleFitView = useCallback(() => {
        dispatchDiagramControl('fit', diagramId);
    }, [diagramId]);

    const handleOpenSettings = useCallback(() => {
        if (onOpenSettings) {
            onOpenSettings();
            return;
        }
        appMessage.info(t('designer.flowchart.settingsNotAvailable'));
    }, [onOpenSettings, t]);

    const notifyPluginNodeAdded = useCallback((label: string) => {
        appMessage.success(t('designer.flowchart.nodeAdded', { label }));
    }, [t]);

    return { handleFitView, handleOpenSettings, notifyPluginNodeAdded };
};
