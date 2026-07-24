import type { Edge, Node } from '@xyflow/react';

import {
    createFlowchartEditorCommandEventHandler,
    findFlowchartEditorCommandExportButton,
    readFlowchartEditorCommandWindowSize,
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

const FLOWCHART_SUMMARY_MAX_SOURCE_IDS = 1_000;
const FLOWCHART_SUMMARY_SOURCE_ID_MAX_CHARS = 256;

const containsControlCharacter = (value: string): boolean => (
    Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1F || codePoint === 0x7F;
    })
);

export const coerceFlowchartSummarySourceIds = (value: unknown): string[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const sourceIds = (value as Record<string, unknown>).sourceIds;
    if (!Array.isArray(sourceIds)) return [];

    return [...new Set(sourceIds.slice(0, FLOWCHART_SUMMARY_MAX_SOURCE_IDS).flatMap((sourceId): string[] => {
        if (typeof sourceId !== 'string') return [];
        const normalized = sourceId.trim();
        if (
            !normalized
            || normalized.length > FLOWCHART_SUMMARY_SOURCE_ID_MAX_CHARS
            || containsControlCharacter(normalized)
        ) {
            return [];
        }
        return [normalized];
    }))];
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
}): ((event: Event | { detail?: unknown }) => boolean) => {
    const { width: windowWidth, height: windowHeight } = readFlowchartEditorCommandWindowSize();

    const handleCommand = createFlowchartEditorCommandEventHandler({
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
    return (event) => handleCommand('detail' in event ? event : { detail: undefined });
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
    edgesRef: { current: Edge[] };
    label: string;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    setNodes: (updater: (nodes: Node[]) => Node[]) => void;
    scheduleSelection?: (callback: () => void) => void;
}) => (event: Event | { detail?: unknown }): Node | null => (
    runFlowchartSummaryInsert({
        nodes: nodesRef.current,
        edges: edgesRef.current,
        sourceIds: coerceFlowchartSummarySourceIds('detail' in event ? event.detail : undefined),
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
