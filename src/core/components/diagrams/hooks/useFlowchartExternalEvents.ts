import { useEffect } from 'react';

import { createFlowchartFocusEntityEventHandler } from '../flowchartFocusEntity';
import {
    createFlowchartDesignerCommandEventHandler,
    createFlowchartSummaryEventHandler,
} from '../flowchartDesignerEventHandlers';
import {
    createFlowchartReverseImportSuccessHandler,
    createFlowchartSnapshotEventHandler,
} from '../flowchartExternalEvents';

interface UseFlowchartExternalEventsOptions {
    snapshot: Parameters<typeof createFlowchartSnapshotEventHandler>[0];
    reverseImport: Parameters<typeof createFlowchartReverseImportSuccessHandler>[0];
    focus: Omit<Parameters<typeof createFlowchartFocusEntityEventHandler>[0], 'nodes' | 'edges'> & {
        getNodes: () => Parameters<typeof createFlowchartFocusEntityEventHandler>[0]['nodes'];
        getEdges: () => Parameters<typeof createFlowchartFocusEntityEventHandler>[0]['edges'];
    };
    command: Parameters<typeof createFlowchartDesignerCommandEventHandler>[0];
    summary: Parameters<typeof createFlowchartSummaryEventHandler>[0];
}

export function useFlowchartExternalEvents({
    snapshot,
    reverseImport,
    focus,
    command,
    summary,
}: UseFlowchartExternalEventsOptions): void {
    const {
        getNodes: getSnapshotNodes,
        getEdges: getSnapshotEdges,
        takeSnapshot,
    } = snapshot;
    const { notifySuccess, scheduleFitView } = reverseImport;
    const {
        reactFlowInstance: focusInstance,
        getNodes: getFocusNodes,
        getEdges: getFocusEdges,
        setSelectedNodes,
        setSelectedEdges,
    } = focus;
    const {
        handleSmartLayout,
        handleStrategyLayout,
        handleExport,
        setAiChatVisible,
        setActiveRightTab,
        reactFlowInstance: commandInstance,
        activePlugin,
        setNodes: setCommandNodes,
        newNodeLabel,
        confirmClearCanvas,
    } = command;
    const {
        nodesRef,
        edgesRef,
        label: summaryLabel,
        takeSnapshot: takeSummarySnapshot,
        setNodes: setSummaryNodes,
        scheduleSelection,
    } = summary;

    useEffect(() => {
        const handleSnapshot = createFlowchartSnapshotEventHandler({
            getNodes: getSnapshotNodes,
            getEdges: getSnapshotEdges,
            takeSnapshot,
        });
        const handleReverseImport = createFlowchartReverseImportSuccessHandler({ notifySuccess, scheduleFitView });
        window.addEventListener('diagram:save-snapshot', handleSnapshot);
        window.addEventListener('vizly:reverse-import-success', handleReverseImport);
        return () => {
            window.removeEventListener('diagram:save-snapshot', handleSnapshot);
            window.removeEventListener('vizly:reverse-import-success', handleReverseImport);
        };
    }, [getSnapshotEdges, getSnapshotNodes, notifySuccess, scheduleFitView, takeSnapshot]);

    useEffect(() => {
        const handleFocus = (event: Event) => createFlowchartFocusEntityEventHandler({
            reactFlowInstance: focusInstance,
            nodes: getFocusNodes(),
            edges: getFocusEdges(),
            setSelectedNodes,
            setSelectedEdges,
        })({ detail: event instanceof CustomEvent ? event.detail : undefined });
        window.addEventListener('editor:focus-entity', handleFocus);
        return () => window.removeEventListener('editor:focus-entity', handleFocus);
    }, [focusInstance, getFocusEdges, getFocusNodes, setSelectedEdges, setSelectedNodes]);

    useEffect(() => {
        const handleCommand = createFlowchartDesignerCommandEventHandler({
            handleSmartLayout,
            handleStrategyLayout,
            handleExport,
            setAiChatVisible,
            setActiveRightTab,
            reactFlowInstance: commandInstance,
            activePlugin,
            setNodes: setCommandNodes,
            newNodeLabel,
            confirmClearCanvas,
        });
        const handleSummary = createFlowchartSummaryEventHandler({
            nodesRef,
            edgesRef,
            label: summaryLabel,
            takeSnapshot: takeSummarySnapshot,
            setNodes: setSummaryNodes,
            scheduleSelection,
        });
        window.addEventListener('editor:command', handleCommand as EventListener);
        window.addEventListener('editor:add-summary-node', handleSummary as EventListener);
        return () => {
            window.removeEventListener('editor:command', handleCommand as EventListener);
            window.removeEventListener('editor:add-summary-node', handleSummary as EventListener);
        };
    }, [
        activePlugin,
        commandInstance,
        confirmClearCanvas,
        edgesRef,
        handleExport,
        handleSmartLayout,
        handleStrategyLayout,
        newNodeLabel,
        nodesRef,
        scheduleSelection,
        setActiveRightTab,
        setAiChatVisible,
        setCommandNodes,
        setSummaryNodes,
        summaryLabel,
        takeSummarySnapshot,
    ]);
}
