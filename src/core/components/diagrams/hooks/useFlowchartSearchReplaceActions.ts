import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';

import {
    planFlowchartLabelReplacement,
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
    const applyReplacement = useCallback((targetIds: string[], query: string, replacement: string) => {
        const currentNodes = getNodes();
        const result = planFlowchartLabelReplacement(currentNodes, targetIds, query, replacement);
        if (result.changedIds.length > 0) {
            takeSnapshot(currentNodes, getEdges());
            setNodes(result.nodes);
        }
        return result;
    }, [getEdges, getNodes, setNodes, takeSnapshot]);

    const handleSearchReplaceNode = useCallback((nodeId: string, query: string, replacement: string) => (
        applyReplacement([nodeId], query, replacement)
    ), [applyReplacement]);

    const handleSearchReplaceAll = useCallback((matchIds: string[], query: string, replacement: string) => (
        applyReplacement(matchIds, query, replacement)
    ), [applyReplacement]);

    return {
        handleSearchReplaceNode,
        handleSearchReplaceAll,
    };
};
