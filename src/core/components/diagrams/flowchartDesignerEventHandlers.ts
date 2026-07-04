import type { Node } from '@xyflow/react';

import {
    createFlowchartEditorCommandEventHandler,
    findFlowchartEditorCommandExportButton,
    readFlowchartEditorCommandWindowSize,
    type FlowchartEditorCommandDetail,
} from './flowchartEditorCommand';
import {
    applyFlowchartSummarySelection,
    runFlowchartSummaryInsert,
} from './flowchartSummaryInsert';

type ReactFlowViewportApi = {
    getViewport: () => {
        x: number;
        y: number;
        zoom: number;
    };
};

type NodeTypePlugin = {
    getNodeTypes?: () => Record<string, unknown>;
};

export const createFlowchartDesignerCommandEventHandler = ({
    handleSmartLayout,
    handleStrategyLayout,
    handleExport,
    setAiChatVisible,
    setActiveRightTab,
    reactFlowInstance,
    activePlugin,
    setNodes,
    newNodeLabel,
    confirmClearCanvas,
}: {
    handleSmartLayout: () => void;
    handleStrategyLayout: (engineName: string, nodeLayout: string | undefined, direction: 'LR' | 'TB') => void;
    handleExport: () => void;
    setAiChatVisible: (visible: boolean) => void;
    setActiveRightTab: (tab: string) => void;
    reactFlowInstance: ReactFlowViewportApi | null | undefined;
    activePlugin?: NodeTypePlugin;
    setNodes: (updater: (nodes: Node[]) => Node[]) => void;
    newNodeLabel: string;
    confirmClearCanvas: () => void;
}): ((event: Pick<CustomEvent<FlowchartEditorCommandDetail>, 'detail'>) => boolean) => {
    const { width: windowWidth, height: windowHeight } = readFlowchartEditorCommandWindowSize();

    return createFlowchartEditorCommandEventHandler({
        handleSmartLayout,
        handleStrategyLayout,
        handleExport,
        findToolbarExportButton: findFlowchartEditorCommandExportButton,
        setAiChatVisible,
        setActiveRightTab,
        reactFlowInstance,
        activePlugin,
        setNodes,
        newNodeLabel,
        windowWidth,
        windowHeight,
        confirmClearCanvas,
    });
};

export const createFlowchartSummaryEventHandler = ({
    nodesRef,
    edgesRef,
    label,
    takeSnapshot,
    setNodes,
    scheduleSelection = (callback: () => void) => setTimeout(callback, 50),
}: {
    nodesRef: { current: Node[] };
    edgesRef: { current: unknown[] };
    label: string;
    takeSnapshot: (nodes: Node[], edges: unknown[]) => void;
    setNodes: (updater: (nodes: Node[]) => Node[]) => void;
    scheduleSelection?: (callback: () => void) => void;
}) => (event: Pick<CustomEvent<{ sourceIds?: string[] }>, 'detail'>): Node | null => (
    runFlowchartSummaryInsert({
        nodes: nodesRef.current,
        edges: edgesRef.current,
        sourceIds: event.detail?.sourceIds,
        label,
        takeSnapshot,
        appendNode: (summaryNode) => {
            setNodes((nodes) => [...nodes, summaryNode]);
        },
        applySelection: (summaryNodeId) => {
            setNodes((nodes) => applyFlowchartSummarySelection(nodes, summaryNodeId));
        },
        scheduleSelection,
    })
);
