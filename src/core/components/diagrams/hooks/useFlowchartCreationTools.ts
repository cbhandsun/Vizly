import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type { TFunction } from 'i18next';

import {
    addFlowchartMindMapNode,
    addFlowchartStickyNote,
} from '../flowchartDesignerCanvasActions';
import { createFreehandNode, type FreehandStroke } from '../freehandStrokeModel';
import { useFlowchartToolModeShortcuts } from './useFlowchartToolModeShortcuts';

interface FlowchartCreationToolsOptions {
    editingEnabled: boolean;
    isDrawingMode: boolean;
    isMarqueeActive: boolean;
    isCommentMode: boolean;
    setIsDrawingMode: Dispatch<SetStateAction<boolean>>;
    setIsMarqueeActive: Dispatch<SetStateAction<boolean>>;
    setIsCommentMode: (enabled: boolean) => void;
    activeLayerId: string;
    nodesRef: MutableRefObject<Node[]>;
    edgesRef: MutableRefObject<Edge[]>;
    reactFlowInstance: ReactFlowInstance | null;
    setNodes: Dispatch<SetStateAction<Node[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    t: TFunction;
}

export const useFlowchartCreationTools = ({
    editingEnabled,
    isDrawingMode,
    isMarqueeActive,
    isCommentMode,
    setIsDrawingMode,
    setIsMarqueeActive,
    setIsCommentMode,
    activeLayerId,
    nodesRef,
    edgesRef,
    reactFlowInstance,
    setNodes,
    takeSnapshot,
    t,
}: FlowchartCreationToolsOptions) => {
    const addStickyNote = useCallback(() => {
        if (!editingEnabled || !reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        addFlowchartStickyNote({ layer: activeLayerId, setNodes });
    }, [activeLayerId, edgesRef, editingEnabled, nodesRef, reactFlowInstance, setNodes, takeSnapshot]);

    const addMindMap = useCallback(() => {
        if (!editingEnabled || !reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        addFlowchartMindMapNode({
            layer: activeLayerId,
            label: t('designer.flowchart.mindMapCenter'),
            setNodes,
        });
    }, [activeLayerId, edgesRef, editingEnabled, nodesRef, reactFlowInstance, setNodes, t, takeSnapshot]);

    const modeActions = useFlowchartToolModeShortcuts({
        editingEnabled,
        isDrawingMode,
        isMarqueeActive,
        isCommentMode,
        setIsDrawingMode,
        setIsMarqueeActive,
        setIsCommentMode,
        onAddStickyNote: addStickyNote,
        onAddMindMap: addMindMap,
    });
    const { activatePointer } = modeActions;

    const handleAddStickyNote = useCallback(() => {
        activatePointer();
        addStickyNote();
    }, [activatePointer, addStickyNote]);

    const handleAddMindMap = useCallback(() => {
        activatePointer();
        addMindMap();
    }, [activatePointer, addMindMap]);

    const handleAddFreehandStroke = useCallback((stroke: FreehandStroke) => {
        const node = createFreehandNode(stroke, activeLayerId);
        if (!node) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        setNodes(currentNodes => [...currentNodes, node]);
    }, [activeLayerId, edgesRef, nodesRef, setNodes, takeSnapshot]);

    return { ...modeActions, handleAddFreehandStroke, handleAddMindMap, handleAddStickyNote };
};
