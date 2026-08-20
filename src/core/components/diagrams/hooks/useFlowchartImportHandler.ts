import { useCallback } from 'react';

import {
    createFlowchartImportHandler,
    type CreateFlowchartImportHandlerOptions,
    type FlowchartImportEvent,
} from '../flowchartImportHandler';
import { registerImportedFlowchartDiagram } from '../flowchartImportRegistration';

type FlowchartImportHandlerOptions = Omit<
    CreateFlowchartImportHandlerOptions,
    'registerStandardReload'
>;

export const useFlowchartImportHandler = ({
    activePlugin,
    businessDataId,
    diagramId,
    editingEnabled,
    fitView,
    getOperationScope,
    importInFlightRef,
    messageApi,
    onBeforeCanvasReplace,
    onImportFinished,
    onImportStarted,
    setEdges,
    setNodes,
    t,
}: FlowchartImportHandlerOptions) => useCallback((event: FlowchartImportEvent) => createFlowchartImportHandler({
    activePlugin,
    businessDataId,
    diagramId,
    editingEnabled,
    fitView,
    getOperationScope,
    importInFlightRef,
    messageApi,
    onBeforeCanvasReplace,
    onImportFinished,
    onImportStarted,
    registerStandardReload: registerImportedFlowchartDiagram,
    setEdges,
    setNodes,
    t,
})(event), [
    activePlugin,
    businessDataId,
    diagramId,
    editingEnabled,
    fitView,
    getOperationScope,
    importInFlightRef,
    messageApi,
    onBeforeCanvasReplace,
    onImportFinished,
    onImportStarted,
    setEdges,
    setNodes,
    t,
]);
