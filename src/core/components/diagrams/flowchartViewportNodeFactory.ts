import type { Node } from '@xyflow/react';

type FlowViewport = {
    x: number;
    y: number;
    zoom: number;
};

type FlowCanvasSize = {
    width: number;
    height: number;
};

const defaultCreateStickyNoteId = (): string => (
    `sticky-${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
);

const defaultCreateMindMapId = (): string => (
    `mindmap-${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
);

export const getFlowchartViewportCenter = ({
    viewport,
    canvasSize,
    offsetX = 0,
    offsetY = 0,
}: {
    viewport: FlowViewport;
    canvasSize: FlowCanvasSize;
    offsetX?: number;
    offsetY?: number;
}): { x: number; y: number } => ({
    x: (canvasSize.width / 2 - viewport.x) / viewport.zoom + offsetX,
    y: (canvasSize.height / 2 - viewport.y) / viewport.zoom + offsetY,
});

export const createFlowchartStickyNoteNode = ({
    viewport,
    canvasSize,
    layer,
    offset = 0,
    createNodeId = defaultCreateStickyNoteId,
}: {
    viewport: FlowViewport;
    canvasSize: FlowCanvasSize;
    layer: string;
    offset?: number;
    createNodeId?: () => string;
}): Node => {
    const center = getFlowchartViewportCenter({
        viewport,
        canvasSize,
        offsetX: offset,
        offsetY: offset,
    });

    return {
        id: createNodeId(),
        type: 'sticky-note',
        position: { x: center.x - 100, y: center.y - 100 },
        data: {
            label: '',
            noteColor: 'yellow',
            layer,
            isEditing: true,
        },
        style: { width: 200, height: 200 },
        zIndex: 1000,
    };
};

export const createFlowchartMindMapNode = ({
    viewport,
    canvasSize,
    layer,
    label,
    createNodeId = defaultCreateMindMapId,
}: {
    viewport: FlowViewport;
    canvasSize: FlowCanvasSize;
    layer: string;
    label: string;
    createNodeId?: () => string;
}): Node => {
    const center = getFlowchartViewportCenter({
        viewport,
        canvasSize,
    });

    return {
        id: createNodeId(),
        type: 'mindmap',
        position: { x: center.x - 60, y: center.y - 20 },
        data: {
            label,
            layer,
            isEditing: true,
        },
        style: { width: 120, height: 40 },
    };
};
