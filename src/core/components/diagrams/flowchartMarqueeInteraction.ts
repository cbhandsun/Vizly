import { SelectionMode, type Edge } from '@xyflow/react';

export interface FlowchartMarqueeCanvasInteraction {
    selectionOnDrag: boolean;
    panOnDrag: false | undefined;
    selectionMode: SelectionMode;
}

export function getFlowchartMarqueeCanvasInteraction(
    isMarqueeActive: boolean,
): FlowchartMarqueeCanvasInteraction {
    return {
        selectionOnDrag: isMarqueeActive,
        panOnDrag: isMarqueeActive ? false : undefined,
        selectionMode: isMarqueeActive ? SelectionMode.Full : SelectionMode.Partial,
    };
}

export function getFlowchartMarqueeEdges<TEdge extends Edge>(
    edges: TEdge[],
    isMarqueeActive: boolean,
): TEdge[] {
    if (!isMarqueeActive) return edges;

    return edges.map(edge => edge.selectable === false
        ? edge
        : { ...edge, selectable: false });
}
