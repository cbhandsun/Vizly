import { useMemo } from 'react';

import { createFlowchartViewportPersistenceKey } from '../flowchartResponsiveChrome';

export const useFlowchartViewportPersistenceKey = ({
    diagramId,
    pageId,
    isMobile,
}: {
    diagramId: string;
    pageId: string;
    isMobile: boolean;
}): string => useMemo(() => createFlowchartViewportPersistenceKey({
    diagramId,
    pageId,
    isMobile,
}), [diagramId, isMobile, pageId]);
