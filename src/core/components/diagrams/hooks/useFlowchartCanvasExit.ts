import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';

import { useDiagramStore } from '../../../store/useDiagramStore';

const clearSelectedNodes = (nodes: Node[]): Node[] => {
    let changed = false;
    const nextNodes = nodes.map(node => {
        const isEditing = node.data?.isEditing === true;
        if (!node.selected && !isEditing) return node;

        changed = true;
        return {
            ...node,
            selected: false,
            data: isEditing
                ? { ...node.data, isEditing: false }
                : node.data,
        };
    });
    return changed ? nextNodes : nodes;
};

const clearSelectedEdges = (edges: Edge[]): Edge[] => {
    let changed = false;
    const nextEdges = edges.map(edge => {
        if (!edge.selected) return edge;
        changed = true;
        return { ...edge, selected: false };
    });
    return changed ? nextEdges : edges;
};

interface FlowchartCanvasExitOptions {
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    clearScopedSelection: () => void;
    activatePointer: () => void;
    closeQuickAdd: () => void;
}

export const useFlowchartCanvasExit = ({
    setNodes,
    setEdges,
    clearScopedSelection,
    activatePointer,
    closeQuickAdd,
}: FlowchartCanvasExitOptions) => {
    const reconciliationFrameRef = useRef<number | null>(null);

    const clearCanvasSelection = useCallback(() => {
        setNodes(clearSelectedNodes);
        setEdges(clearSelectedEdges);
        clearScopedSelection();

        const diagramStore = useDiagramStore.getState();
        diagramStore.setSelectedNodes([]);
        diagramStore.setSelectedEdges([]);
    }, [clearScopedSelection, setEdges, setNodes]);

    const exitCanvasInteraction = useCallback(() => {
        activatePointer();
        closeQuickAdd();
        clearCanvasSelection();

        if (reconciliationFrameRef.current !== null) {
            cancelAnimationFrame(reconciliationFrameRef.current);
        }
        reconciliationFrameRef.current = requestAnimationFrame(() => {
            reconciliationFrameRef.current = null;
            clearCanvasSelection();
        });
    }, [activatePointer, clearCanvasSelection, closeQuickAdd]);

    useEffect(() => () => {
        if (reconciliationFrameRef.current !== null) {
            cancelAnimationFrame(reconciliationFrameRef.current);
        }
    }, []);

    return { clearCanvasSelection, exitCanvasInteraction };
};

export const flowchartCanvasExitTestUtils = {
    clearSelectedNodes,
    clearSelectedEdges,
};
