import { useEffect, useMemo } from 'react';
import type React from 'react';
import type { TFunction } from 'i18next';
import { MarkerType, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';

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
import { resolveFlowchartConnectedAddPlan } from '../flowchartConnectedAdd';
import {
    calculateCanvasVisibleLeft,
    calculateCanvasVisibleRight,
    calculateQuickCloneViewportAdjustment,
} from '../../custom-nodes/flowchartQuickClone';

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

        const ensureAddedNodeVisible = (position: { x: number; y: number }) => {
            if (!reactFlowInstance) return;
            const container = reactFlowWrapper.current?.querySelector<HTMLElement>('.react-flow')
                ?? document.querySelector<HTMLElement>('.react-flow');
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const drawer = document.querySelector<HTMLElement>('.side-drawer');
            const drawerRect = drawer?.getBoundingClientRect();
            const sidebar = document.querySelector<HTMLElement>('.designer-right-sidebar');
            const sidebarRect = sidebar?.getBoundingClientRect();
            const visibleLeft = calculateCanvasVisibleLeft({
                containerLeft: containerRect.left,
                containerRight: containerRect.right,
                containerWidth: containerRect.width,
                drawerLeft: drawerRect?.left,
                drawerRight: drawerRect?.right,
                drawerWidth: drawerRect?.width,
                drawerHeight: drawerRect?.height,
                drawerVisible: Boolean(
                    drawer
                    && drawerRect
                    && getComputedStyle(drawer).visibility !== 'hidden'
                ),
            });
            const visibleRight = calculateCanvasVisibleRight({
                containerLeft: containerRect.left,
                containerRight: containerRect.right,
                containerWidth: containerRect.width,
                sidebarLeft: sidebarRect?.left,
                sidebarRight: sidebarRect?.right,
                sidebarWidth: sidebarRect?.width,
                sidebarHeight: sidebarRect?.height,
                sidebarVisible: Boolean(
                    sidebar
                    && sidebarRect
                    && getComputedStyle(sidebar).visibility !== 'hidden'
                ),
            });
            const viewport = reactFlowInstance.getViewport();
            const adjustment = calculateQuickCloneViewportAdjustment({
                containerWidth: containerRect.width,
                containerHeight: containerRect.height,
                visibleLeft,
                visibleRight,
                nodeX: position.x,
                nodeY: position.y,
                nodeWidth: 120,
                nodeHeight: 60,
                viewportX: viewport.x,
                viewportY: viewport.y,
                zoom: viewport.zoom,
            });
            if (adjustment) {
                void reactFlowInstance.setViewport(adjustment, { duration: 260 });
            }
        };

        const addPluginNode = (
            requestedType: string,
            requestedData: unknown = {},
            requestedPosition?: { x: number; y: number },
            selectAddedNode = false,
        ): string => {
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
                selected: selectAddedNode,
            };
            setNodes(currentNodes => [
                ...currentNodes.map(node => (
                    selectAddedNode ? { ...node, selected: false } : node
                )),
                newNode,
            ]);
            if (selectAddedNode) {
                setEdges(currentEdges => currentEdges.map(edge => ({ ...edge, selected: false })));
            }
            notifyNodeAdded(resolveFlowchartPluginNodeNotificationLabel(newNode.data, type));
            if (isMobile) onMobileNodeAdded();
            return id;
        };

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
            addNode: (requestedType, requestedData = {}, requestedPosition) => (
                addPluginNode(requestedType, requestedData, requestedPosition)
            ),
            addConnectedNode: (requestedType, requestedData = {}) => {
                const type = normalizeFlowchartPluginNodeType(requestedType);
                const data = normalizeFlowchartPluginNodeData(requestedData);
                const currentNodes = getNodes();
                const currentEdges = getEdges();
                const plan = resolveFlowchartConnectedAddPlan(currentNodes, type);
                if (!plan) {
                    return addPluginNode(type, data, undefined, true);
                }

                takeSnapshot(currentNodes, currentEdges);
                const id = createFlowchartPluginNodeId(type);
                const newNode: Node = {
                    id,
                    type,
                    position: plan.position,
                    data: {
                        label: t('designer.flowchart.newNode'),
                        ...data,
                        layer: activeLayerId,
                    },
                    selected: true,
                };
                const newEdge: Edge = {
                    id: `e-${plan.sourceNode.id}-${id}`,
                    source: plan.sourceNode.id,
                    target: id,
                    sourceHandle: plan.sourceHandle,
                    targetHandle: plan.targetHandle,
                    type: 'advanced-smart-step',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    selected: false,
                };
                setNodes(nodes => [
                    ...nodes.map(node => ({ ...node, selected: false })),
                    newNode,
                ]);
                setEdges(edges => [
                    ...edges.map(edge => ({ ...edge, selected: false })),
                    newEdge,
                ]);
                notifyNodeAdded(resolveFlowchartPluginNodeNotificationLabel(newNode.data, type));
                if (isMobile) onMobileNodeAdded();
                window.setTimeout(() => ensureAddedNodeVisible(plan.position), 80);
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
