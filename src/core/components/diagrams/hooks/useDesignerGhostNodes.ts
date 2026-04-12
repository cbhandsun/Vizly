import { useState, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';

export interface UseDesignerGhostNodesProps {
    layerSyncedNodes: Node[];
    enhancedEdges: Edge[];
    quickAddMenu: any;
    getFlowPosition: () => { x: number; y: number };
}

export function useDesignerGhostNodes({
    layerSyncedNodes,
    enhancedEdges,
    quickAddMenu,
    getFlowPosition
}: UseDesignerGhostNodesProps) {
    const [quickConnectPreview, setQuickConnectPreview] = useState<any | null>(null);

    const nodesWithGhost = useMemo(() => {
        if (!quickAddMenu?.visible || !quickConnectPreview) return layerSyncedNodes;

        const shapeType = quickConnectPreview.data?.shape || quickConnectPreview.type;
        const ghostId = `ghost-preview-node-${shapeType}`;
        const ghostNode: Node = {
            id: ghostId,
            type: quickConnectPreview.type,
            position: getFlowPosition(),
            data: { label: quickConnectPreview.label, ...quickConnectPreview.data, isGhost: true },
            style: {
                width: 120, height: 60,
                opacity: 0.5,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 0 12px rgba(24,144,255,0.4)) saturate(120%)',
                zIndex: 9999
            },
            selectable: false,
            draggable: false,
        };
        return [...layerSyncedNodes, ghostNode];
    }, [layerSyncedNodes, quickAddMenu, quickConnectPreview, getFlowPosition]);

    const edgesWithGhost = useMemo(() => {
        if (!quickAddMenu?.visible || !quickConnectPreview || !quickAddMenu.sourceNodeId) return enhancedEdges;

        const shapeType = quickConnectPreview.data?.shape || quickConnectPreview.type;
        const ghostTargetId = `ghost-preview-node-${shapeType}`;

        const ghostEdge: Edge = {
            id: `ghost-preview-edge-${shapeType}`,
            source: quickAddMenu.sourceNodeId,
            target: ghostTargetId,
            sourceHandle: quickAddMenu.sourceHandleId,
            type: 'advanced-smart-step',
            style: { strokeDasharray: '4,4', stroke: '#1890ff', opacity: 0.6, strokeWidth: 2 },
            animated: true,
        };
        return [...enhancedEdges, ghostEdge];
    }, [enhancedEdges, quickAddMenu, quickConnectPreview]);

    return {
        quickConnectPreview,
        setQuickConnectPreview,
        nodesWithGhost,
        edgesWithGhost
    };
}
