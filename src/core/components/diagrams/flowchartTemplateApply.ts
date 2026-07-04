import type { Edge, Node } from '@xyflow/react';

import type { NodeTemplate } from './hooks/useNodeTemplates';

type ViewportLike = {
    x: number;
    y: number;
    zoom: number;
};

export const buildFlowchartTemplateApplyPlan = ({
    template,
    viewport,
    createFromTemplate,
}: {
    template: NodeTemplate;
    viewport: ViewportLike;
    createFromTemplate: (
        template: NodeTemplate,
        viewportX: number,
        viewportY: number,
        viewportZoom: number
    ) => { nodes: Node[]; edges: Edge[] };
}): {
    nodes: Node[];
    edges: Edge[];
} => createFromTemplate(template, viewport.x, viewport.y, viewport.zoom);
