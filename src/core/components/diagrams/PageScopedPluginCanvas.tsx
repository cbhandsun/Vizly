import React, { useMemo } from 'react';
import type { Edge, Node } from '@xyflow/react';

import type { PluginContext } from '../../types/plugin';

interface PageScopedPluginCanvasProps {
    pageScope: string;
    ready?: boolean;
    context: PluginContext;
    nodes: Node[];
    edges: Edge[];
    renderCanvas: (context: PluginContext) => React.ReactNode;
}

/**
 * Third-party canvas plugins may own rendering state outside React Flow.
 * A page operation must remount that subtree so it loads the target page snapshot.
 */
export function PageScopedPluginCanvas({
    pageScope,
    ready = true,
    context,
    nodes,
    edges,
    renderCanvas,
}: PageScopedPluginCanvasProps) {
    const pageContext = useMemo<PluginContext>(() => ({
        ...context,
        getNodes: () => nodes,
        getEdges: () => edges,
        nodes,
        edges,
    }), [context, edges, nodes]);

    if (!ready) return null;
    return (
        <React.Fragment key={pageScope}>
            {renderCanvas(pageContext)}
        </React.Fragment>
    );
}
