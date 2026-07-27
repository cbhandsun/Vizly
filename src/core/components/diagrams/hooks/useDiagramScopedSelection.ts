import { useCallback, useState } from 'react';
import type React from 'react';
import type { Edge, Node } from '@xyflow/react';

interface DiagramScopedSelection {
    diagramId?: string;
    nodes: Node[];
    edges: Edge[];
}

const resolveStateUpdate = <T,>(
    update: React.SetStateAction<T>,
    current: T,
): T => typeof update === 'function'
    ? (update as (previous: T) => T)(current)
    : update;

export const useDiagramScopedSelection = (diagramId?: string) => {
    const [selection, setSelection] = useState<DiagramScopedSelection>({
        diagramId,
        nodes: [],
        edges: [],
    });
    const isCurrentDiagram = selection.diagramId === diagramId;
    const selectedNodes = isCurrentDiagram ? selection.nodes : [];
    const selectedEdges = isCurrentDiagram ? selection.edges : [];

    const setSelectedNodes = useCallback<React.Dispatch<React.SetStateAction<Node[]>>>((update) => {
        setSelection(previous => {
            const sameDiagram = previous.diagramId === diagramId;
            return {
                diagramId,
                nodes: resolveStateUpdate(update, sameDiagram ? previous.nodes : []),
                edges: sameDiagram ? previous.edges : [],
            };
        });
    }, [diagramId]);

    const setSelectedEdges = useCallback<React.Dispatch<React.SetStateAction<Edge[]>>>((update) => {
        setSelection(previous => {
            const sameDiagram = previous.diagramId === diagramId;
            return {
                diagramId,
                nodes: sameDiagram ? previous.nodes : [],
                edges: resolveStateUpdate(update, sameDiagram ? previous.edges : []),
            };
        });
    }, [diagramId]);

    return {
        selectedNodes,
        selectedEdges,
        setSelectedNodes,
        setSelectedEdges,
    };
};
