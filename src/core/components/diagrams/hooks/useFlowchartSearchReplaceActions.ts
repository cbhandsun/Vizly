import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';

import {
    replaceFlowchartNodeLabel,
    replaceFlowchartNodeLabels,
} from '../flowchartSearchReplace';

interface UseFlowchartSearchReplaceActionsParams {
    setNodes: Dispatch<SetStateAction<Node[]>>;
    getNodes: () => Node[];
    getEdges: () => Edge[];
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
}

export const useFlowchartSearchReplaceActions = ({
    setNodes,
    getNodes,
    getEdges,
    takeSnapshot,
}: UseFlowchartSearchReplaceActionsParams) => {
    const handleSearchReplaceNode = useCallback((nodeId: string, newLabel: string) => {
        setNodes((nodes) => replaceFlowchartNodeLabel(nodes, nodeId, newLabel));
    }, [setNodes]);

    const handleSearchReplaceAll = useCallback((matchIds: string[], newLabel: string) => {
        setNodes((nodes) => replaceFlowchartNodeLabels(nodes, matchIds, newLabel));
    }, [setNodes]);

    const handleBeforeReplace = useCallback(() => {
        takeSnapshot(getNodes(), getEdges());
    }, [getEdges, getNodes, takeSnapshot]);

    return {
        handleSearchReplaceNode,
        handleSearchReplaceAll,
        handleBeforeReplace,
    };
};
