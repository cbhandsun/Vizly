import { useCallback, useMemo, useState } from 'react';
import type React from 'react';
import type { Edge, Node } from '@xyflow/react';

interface DiagramScopedSelection {
    diagramId?: string;
    nodeIds: string[];
    edgeIds: string[];
}

const resolveStateUpdate = <T,>(
    update: React.SetStateAction<T>,
    current: T,
): T => typeof update === 'function'
    ? (update as (previous: T) => T)(current)
    : update;

export const useDiagramScopedSelection = (
    diagramId: string | undefined,
    nodes: Node[],
    edges: Edge[],
) => {
    const [selection, setSelection] = useState<DiagramScopedSelection>({
        diagramId,
        nodeIds: [],
        edgeIds: [],
    });
    const isCurrentDiagram = selection.diagramId === diagramId;
    const nodeById = useMemo(
        () => new Map(nodes.map(node => [node.id, node])),
        [nodes],
    );
    const edgeById = useMemo(
        () => new Map(edges.map(edge => [edge.id, edge])),
        [edges],
    );
    const selectedNodes = useMemo(
        () => isCurrentDiagram
            ? selection.nodeIds.flatMap(id => {
                const node = nodeById.get(id);
                return node ? [node] : [];
            })
            : [],
        [isCurrentDiagram, nodeById, selection.nodeIds],
    );
    const selectedEdges = useMemo(
        () => isCurrentDiagram
            ? selection.edgeIds.flatMap(id => {
                const edge = edgeById.get(id);
                return edge ? [edge] : [];
            })
            : [],
        [edgeById, isCurrentDiagram, selection.edgeIds],
    );

    const setSelectedNodes = useCallback<React.Dispatch<React.SetStateAction<Node[]>>>((update) => {
        setSelection(previous => {
            const sameDiagram = previous.diagramId === diagramId;
            const currentNodes = sameDiagram
                ? previous.nodeIds.flatMap(id => {
                    const node = nodeById.get(id);
                    return node ? [node] : [];
                })
                : [];
            const nextNodes = resolveStateUpdate(update, currentNodes);
            return {
                diagramId,
                nodeIds: nextNodes.map(node => node.id),
                edgeIds: sameDiagram ? previous.edgeIds : [],
            };
        });
    }, [diagramId, nodeById]);

    const setSelectedEdges = useCallback<React.Dispatch<React.SetStateAction<Edge[]>>>((update) => {
        setSelection(previous => {
            const sameDiagram = previous.diagramId === diagramId;
            const currentEdges = sameDiagram
                ? previous.edgeIds.flatMap(id => {
                    const edge = edgeById.get(id);
                    return edge ? [edge] : [];
                })
                : [];
            const nextEdges = resolveStateUpdate(update, currentEdges);
            return {
                diagramId,
                nodeIds: sameDiagram ? previous.nodeIds : [],
                edgeIds: nextEdges.map(edge => edge.id),
            };
        });
    }, [diagramId, edgeById]);

    const clearSelection = useCallback(() => {
        setSelection({
            diagramId,
            nodeIds: [],
            edgeIds: [],
        });
    }, [diagramId]);

    return {
        selectedNodes,
        selectedEdges,
        setSelectedNodes,
        setSelectedEdges,
        clearSelection,
    };
};
