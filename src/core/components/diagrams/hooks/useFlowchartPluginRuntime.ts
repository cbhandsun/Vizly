import { useEffect, useMemo } from 'react';
import type React from 'react';
import type { TFunction } from 'i18next';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';

import { PluginRegistry } from '../../../services/PluginRegistry';
import type { DiagramTypePlugin, PluginContext } from '../../../types/plugin';
import type { EdgeDataUpdate, NodeDataUpdate } from '../../../types/diagram-updates';
import { useDiagramStore } from '../../../store/useDiagramStore';
import {
    createFlowchartPluginNodeId,
    normalizeFlowchartPluginNodeData,
    normalizeFlowchartPluginNodeType,
    resolveFlowchartPluginNodeNotificationLabel,
    resolveFlowchartPluginNodePosition,
} from '../flowchartPluginRuntimeModel';
import {
    getStableFlowchartPluginEdgeTypes,
    getStableFlowchartPluginNodeTypes,
} from '../flowchartPluginRenderers';

interface UseFlowchartPluginRuntimeOptions {
    pluginId: string;
    diagramId: string;
    getNodes: () => Node[];
    getEdges: () => Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    updateNodesBatch: (ids: string[], updates: NodeDataUpdate, options?: { snapshot?: boolean }) => void;
    updateEdgesBatch: (ids: string[], updates: EdgeDataUpdate) => void;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance | null;
    reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
    activeLayerId: string;
    isMobile: boolean;
    t: TFunction;
    onMobileNodeAdded: () => void;
    notifyNodeAdded: (label: string) => void;
}

export interface FlowchartPluginRuntime {
    activePlugin?: DiagramTypePlugin;
    pluginCtx: PluginContext | null;
    dynamicNodeTypes: ReturnType<typeof getStableFlowchartPluginNodeTypes>;
    dynamicEdgeTypes: ReturnType<typeof getStableFlowchartPluginEdgeTypes>;
}

export function useFlowchartPluginRuntime({
    pluginId,
    diagramId,
    getNodes,
    getEdges,
    setNodes,
    setEdges,
    updateNodesBatch,
    updateEdgesBatch,
    takeSnapshot,
    reactFlowInstance,
    reactFlowWrapper,
    activeLayerId,
    isMobile,
    t,
    onMobileNodeAdded,
    notifyNodeAdded,
}: UseFlowchartPluginRuntimeOptions): FlowchartPluginRuntime {
    const activePlugin = useMemo(
        () => PluginRegistry.getInstance().getPlugin(pluginId),
        [pluginId],
    );

    const pluginCtx = useMemo<PluginContext | null>(() => {
        if (!activePlugin) return null;

        const context: PluginContext = {
            diagramId,
            getNodes,
            getEdges,
            updateNodesBatch: (ids, updates) => updateNodesBatch(ids, updates, { snapshot: false }),
            updateEdgesBatch,
            takeSnapshot: () => takeSnapshot(getNodes(), getEdges()),
            nodes: [],
            edges: [],
            setNodes,
            setEdges,
            reactFlowInstance,
            addNode: (requestedType, requestedData = {}, requestedPosition) => {
                const type = normalizeFlowchartPluginNodeType(requestedType);
                const data = normalizeFlowchartPluginNodeData(requestedData);
                const viewport = reactFlowInstance?.getViewport();
                const container = reactFlowWrapper.current;
                const position = resolveFlowchartPluginNodePosition({
                    requestedPosition,
                    viewport,
                    containerWidth: container?.offsetWidth ?? window.innerWidth,
                    containerHeight: container?.offsetHeight ?? window.innerHeight,
                    existingNodes: getNodes(),
                });

                takeSnapshot(getNodes(), getEdges());
                const id = createFlowchartPluginNodeId(type);
                const newNode: Node = {
                    id,
                    type,
                    position,
                    data: {
                        label: t('designer.flowchart.newNode'),
                        ...data,
                        layer: activeLayerId,
                    },
                };
                setNodes(currentNodes => [...currentNodes, newNode]);
                notifyNodeAdded(resolveFlowchartPluginNodeNotificationLabel(newNode.data, type));
                if (isMobile) onMobileNodeAdded();
                return id;
            },
            getPluginState: <T,>() =>
                useDiagramStore.getState().pluginStates[pluginId] as T | undefined,
            setPluginState: (patch) => useDiagramStore.getState().setPluginState(pluginId, patch),
        };

        Object.defineProperty(context, 'nodes', { get: getNodes });
        Object.defineProperty(context, 'edges', { get: getEdges });
        return context;
    }, [
        activeLayerId,
        activePlugin,
        diagramId,
        getEdges,
        getNodes,
        isMobile,
        notifyNodeAdded,
        onMobileNodeAdded,
        pluginId,
        reactFlowInstance,
        reactFlowWrapper,
        setEdges,
        setNodes,
        t,
        takeSnapshot,
        updateEdgesBatch,
        updateNodesBatch,
    ]);

    useEffect(() => {
        if (!activePlugin || !pluginCtx) return;
        activePlugin.onInit?.(pluginCtx);
        return () => activePlugin.onDestroy?.(pluginCtx);
    }, [activePlugin, pluginCtx]);

    return {
        activePlugin,
        pluginCtx,
        dynamicNodeTypes: getStableFlowchartPluginNodeTypes(activePlugin),
        dynamicEdgeTypes: getStableFlowchartPluginEdgeTypes(activePlugin),
    };
}
