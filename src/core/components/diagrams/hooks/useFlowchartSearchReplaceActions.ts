import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';

import {
    planFlowchartCanvasTextReplacement,
    type FlowchartCanvasSearchMatch,
} from '../flowchartSearchReplace';

interface UseFlowchartSearchReplaceActionsParams {
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    getNodes: () => Node[];
    getEdges: () => Edge[];
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
}

export const useFlowchartSearchReplaceActions = ({
    setNodes,
    setEdges,
    getNodes,
    getEdges,
    takeSnapshot,
}: UseFlowchartSearchReplaceActionsParams) => {
    const applyReplacement = useCallback((matches: FlowchartCanvasSearchMatch[], query: string, replacement: string) => {
        const currentNodes = getNodes();
        const currentEdges = getEdges();
        const result = planFlowchartCanvasTextReplacement(currentNodes, currentEdges, matches, query, replacement);
        if (result.changedMatches.length > 0) {
            takeSnapshot(currentNodes, currentEdges);
            if (result.changedMatches.some(match => match.kind === 'node')) setNodes(result.nodes);
            if (result.changedMatches.some(match => match.kind === 'edge')) setEdges(result.edges);
        }
        return result;
    }, [getEdges, getNodes, setEdges, setNodes, takeSnapshot]);

    const handleSearchReplaceMatch = useCallback((match: FlowchartCanvasSearchMatch, query: string, replacement: string) => (
        applyReplacement([match], query, replacement)
    ), [applyReplacement]);

    const handleSearchReplaceAll = useCallback((matches: FlowchartCanvasSearchMatch[], query: string, replacement: string) => (
        applyReplacement(matches, query, replacement)
    ), [applyReplacement]);

    return {
        handleSearchReplaceMatch,
        handleSearchReplaceAll,
    };
};
