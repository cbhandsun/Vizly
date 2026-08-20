import { useCallback } from 'react';
import { addEdge, type Connection, type Edge } from '@xyflow/react';

import type { UseDesignerInteractionsProps } from './useDesignerInteractions';

type ConnectionHandlerOptions = Pick<
    UseDesignerInteractionsProps,
    'edgesRef' | 'nodesRef' | 'setEdges' | 'takeSnapshot'
> & {
    relationshipLabel: string;
};

export const useFlowchartConnectionHandler = ({
    edgesRef,
    nodesRef,
    relationshipLabel,
    setEdges,
    takeSnapshot,
}: ConnectionHandlerOptions) => useCallback((connection: Connection) => {
    takeSnapshot(nodesRef.current, edgesRef.current);
    const isRelationship = connection.sourceHandle?.includes('relationship')
        || connection.targetHandle?.includes('relationship');

    if (isRelationship) {
        const relationshipEdge: Edge = {
            ...connection,
            id: `rel-${Date.now()}`,
            type: 'relationshipEdge',
            data: { label: relationshipLabel },
            animated: true,
        };
        setEdges(edges => addEdge(relationshipEdge, edges));
        return;
    }

    setEdges(edges => addEdge(connection, edges));
}, [edgesRef, nodesRef, relationshipLabel, setEdges, takeSnapshot]);
