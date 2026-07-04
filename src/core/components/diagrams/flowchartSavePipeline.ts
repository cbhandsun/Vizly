import type { Edge, Node } from '@xyflow/react';

import type { DiagramTypePlugin, PluginContext } from '@/core/types/plugin';

type SaveAction = (() => Promise<void>) | undefined;

export const runFlowchartSavePipeline = async ({
    activePlugin,
    pluginCtx,
    nodes,
    edges,
    saveAction,
}: {
    activePlugin?: Pick<DiagramTypePlugin, 'onDataSync'> | null;
    pluginCtx?: PluginContext | null;
    nodes: Node[];
    edges: Edge[];
    saveAction: SaveAction;
}): Promise<void> => {
    if (activePlugin?.onDataSync && pluginCtx) {
        activePlugin.onDataSync(nodes, edges, false, pluginCtx);
    }

    if (saveAction) {
        await saveAction();
    }
};
