import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';

import {
    applyFlowchartNodeVisualSelection,
    clearFlowchartEdgeVisualSelection,
    focusFlowchartNode,
} from '../flowchartFocusEntity';

interface UseFlowchartNodeFocusOptions {
    reactFlowInstance: ReactFlowInstance | null;
    nodesRef: RefObject<Node[]>;
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    setSelectedNodes: Dispatch<SetStateAction<Node[]>>;
    setSelectedEdges: Dispatch<SetStateAction<Edge[]>>;
}

export const useFlowchartNodeFocus = ({
    reactFlowInstance,
    nodesRef,
    setNodes,
    setEdges,
    setSelectedNodes,
    setSelectedEdges,
}: UseFlowchartNodeFocusOptions) => useCallback((nodeId: string) => {
    const focused = focusFlowchartNode({
        reactFlowInstance,
        nodes: nodesRef.current,
        nodeId,
        setSelectedNodes,
        setSelectedEdges,
        duration: 800,
        zoom: 1.2,
    });
    if (!focused) return;

    setNodes(currentNodes => applyFlowchartNodeVisualSelection(currentNodes, nodeId));
    setEdges(currentEdges => clearFlowchartEdgeVisualSelection(currentEdges));
}, [nodesRef, reactFlowInstance, setEdges, setNodes, setSelectedEdges, setSelectedNodes]);
