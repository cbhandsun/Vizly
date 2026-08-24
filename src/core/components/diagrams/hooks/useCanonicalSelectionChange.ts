import {
    startTransition,
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import type { Edge, Node } from '@xyflow/react';

import { useDiagramStore } from '../../../store/useDiagramStore';
import { canonicalizeSelectionById } from './selectionCanonicalization';

interface CanonicalSelectionChangeOptions {
    nodesRef: MutableRefObject<Node[]>;
    edgesRef: MutableRefObject<Edge[]>;
    setSelectedNodes: Dispatch<SetStateAction<Node[]>>;
    setSelectedEdges: Dispatch<SetStateAction<Edge[]>>;
}

interface SelectionChange {
    nodes: Node[];
    edges: Edge[];
}

export const useCanonicalSelectionChange = ({
    nodesRef,
    edgesRef,
    setSelectedNodes,
    setSelectedEdges,
}: CanonicalSelectionChangeOptions) => useCallback(({ nodes, edges }: SelectionChange) => {
    const canonicalNodes = canonicalizeSelectionById(nodes, nodesRef.current);
    const canonicalEdges = canonicalizeSelectionById(edges, edgesRef.current);

    // React Flow's controlled edge update is the urgent visual commit. Sidebar,
    // toolbar and scoped-selection projections may render substantially more UI,
    // so keep them in a transition to avoid delaying the selected edge paint.
    startTransition(() => {
        setSelectedNodes(canonicalNodes);
        setSelectedEdges(canonicalEdges);
    });

    const diagramStore = useDiagramStore.getState();
    diagramStore.setSelectedNodes(canonicalNodes);
    diagramStore.setSelectedEdges(canonicalEdges);
}, [edgesRef, nodesRef, setSelectedEdges, setSelectedNodes]);
