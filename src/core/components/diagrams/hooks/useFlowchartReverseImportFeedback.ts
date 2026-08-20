import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { useScheduledFlowchartFit } from './useMobileFlowchartViewportGuard';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const useFlowchartReverseImportFeedback = (
    messageApi: Pick<MessageInstance, 'success'>,
    translate: Translate,
    fitView: () => void,
    setActiveRightTab: (tab: 'ai' | 'property') => void,
) => {
    const notifyReverseImportSuccess = useCallback((filename: string) => {
        messageApi.success(translate('designer.flowchart.import.reverseSuccess', { filename }));
    }, [messageApi, translate]);
    const scheduleReverseImportFit = useScheduledFlowchartFit(fitView, 300);
    const selectExternalRightTab = useCallback((tab: string) => {
        setActiveRightTab(tab === 'ai' ? 'ai' : 'property');
    }, [setActiveRightTab]);

    return { notifyReverseImportSuccess, scheduleReverseImportFit, selectExternalRightTab };
};
