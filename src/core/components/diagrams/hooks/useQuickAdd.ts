import { useState, useCallback } from 'react';
import { Node, Edge, ReactFlowInstance, OnConnectEnd, MarkerType } from '@xyflow/react';
import { QuickConnectOption } from '../QuickConnectMenu';
import { projectFlowPositionToScreenPosition } from '../../../utils/domViewport';

export const useQuickAdd = (
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void,
    reactFlowInstance: ReactFlowInstance | null,
    getDefaultEdgeStyle?: () => Partial<Edge>,
    nodes?: Node[],
    edges?: Edge[],
    activeLayerId?: string,
    edgeMode: 'advanced-smart' | 'native' = 'advanced-smart'
) => {
    const [menuState, setMenuState] = useState<{
        visible: boolean;
        clientX: number; clientY: number;
        flowX: number; flowY: number;
        sourceNodeId: string;
        sourceHandleId: string | null;
    } | null>(null);

    const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
        if (!connectionState.isValid && connectionState.fromNode && reactFlowInstance) {
            const { clientX, clientY } = (event as MouseEvent | TouchEvent) as any;
            // Use native reactFlowInstance.screenToFlowPosition which implicitly handles counter-zoom CSS scaling perfectly
            const projected = reactFlowInstance.screenToFlowPosition({ x: clientX, y: clientY });
            
            // Counter-Zoom 使 net zoom=1.0，clientX 直接可用
            setMenuState({
                visible: true,
                clientX,
                clientY,
                flowX: projected.x,
                flowY: projected.y,
                sourceNodeId: connectionState.fromNode.id,
                sourceHandleId: connectionState.fromHandle?.id || null,
            });
        }
    }, [reactFlowInstance]);

    const closeMenu = useCallback(() => setMenuState(null), []);

    const openQuickAddMenu = useCallback((flowX: number, flowY: number) => {
        const { x: screenX, y: screenY } = projectFlowPositionToScreenPosition({
            flowX,
            flowY,
        });
        setMenuState({ visible: true, clientX: screenX, clientY: screenY, flowX, flowY, sourceNodeId: '', sourceHandleId: null });
    }, []);

    const enhancedHandleAddNode = useCallback((option: QuickConnectOption) => {
        if (!menuState || !reactFlowInstance) return;

        if (nodes && edges) {
            takeSnapshot(nodes, edges);
        }

        // 居中偏移（节点默认 120×60）
        const flowPos = { x: menuState.flowX - 60, y: menuState.flowY - 30 };


        const newNodeId = 'node-' + Date.now();
        const newNode: Node = {
            id: newNodeId,
            type: option.type,
            data: {
                label: option.label,
                ...option.data,
                layer: activeLayerId || 'layer-0',
                isEditing: true
            },
            position: flowPos,
            style: { width: 120, height: 60, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' },
            selected: true
        };

        setNodes((nds) => {
            const unselectedNds: Node[] = nds.map(n => ({ ...n, selected: false }));
            return unselectedNds.concat(newNode);
        });

        if (menuState.sourceNodeId) {
            const edgeStyle = getDefaultEdgeStyle ? getDefaultEdgeStyle() : {};
            const newEdge: Edge = {
                id: `e${menuState.sourceNodeId}-${newNodeId}`,
                source: menuState.sourceNodeId,
                target: newNodeId,
                sourceHandle: menuState.sourceHandleId,
                type: edgeMode === 'native' ? 'smoothstep' : 'advanced-smart-step',
                markerEnd: { type: MarkerType.ArrowClosed },
                ...edgeStyle
            };
            setEdges((eds) => eds.concat(newEdge));
        }

        setMenuState(null);
    }, [menuState, reactFlowInstance, setNodes, setEdges, takeSnapshot, getDefaultEdgeStyle, nodes, edges, activeLayerId, edgeMode]);

    const getFlowPosition = useCallback(() => {
        if (!menuState) return { x: 0, y: 0 };
        return { x: menuState.flowX - 60, y: menuState.flowY - 30 };
    }, [menuState]);

    return {
        quickAddMenu: menuState ? {
            visible: menuState.visible,
            clientX: menuState.clientX,
            clientY: menuState.clientY,
            sourceNodeId: menuState.sourceNodeId,
            sourceHandleId: menuState.sourceHandleId,
        } : null,
        onConnectEnd,
        handleAddNode: enhancedHandleAddNode,
        closeMenu,
        openQuickAddMenu,
        getFlowPosition,
    };
};
