import { useCallback } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';

import { dispatchDiagramControl } from '../../shared/diagramControl';
import { scheduleFlowchartInitialFit } from '../flowchartInitialFit';

export const useFlowchartReactFlowInit = ({
    diagramId,
    setReactFlowInstance,
}: {
    diagramId?: string;
    setReactFlowInstance: (instance: ReactFlowInstance) => void;
}) => useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
    scheduleFlowchartInitialFit({
        reactFlowInstance: instance,
        dispatchFit: () => dispatchDiagramControl('fit', diagramId),
    });
}, [diagramId, setReactFlowInstance]);
