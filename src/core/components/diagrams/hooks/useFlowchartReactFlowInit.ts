import { useCallback } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';

import { dispatchDiagramControl } from '../../shared/diagramControl';
import { getLastViewport } from '../../shared/viewportStore';
import { scheduleFlowchartInitialFit } from '../flowchartInitialFit';

export const useFlowchartReactFlowInit = ({
    diagramId,
    viewportPersistenceKey,
    setReactFlowInstance,
}: {
    diagramId?: string;
    viewportPersistenceKey: string;
    setReactFlowInstance: (instance: ReactFlowInstance) => void;
}) => useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
    if (getLastViewport(viewportPersistenceKey)) return;
    scheduleFlowchartInitialFit({
        reactFlowInstance: instance,
        dispatchFit: () => dispatchDiagramControl('fit', diagramId),
    });
}, [diagramId, setReactFlowInstance, viewportPersistenceKey]);
