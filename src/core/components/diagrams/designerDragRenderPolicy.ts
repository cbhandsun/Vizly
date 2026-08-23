export interface DesignerDragRenderPolicyInput {
    isDragging: boolean;
    isDraggingNode: boolean;
    performanceMode: boolean;
}

export interface DesignerDragRenderPolicy {
    canvasDragActive: boolean;
    usePerformanceNodes: boolean;
}

/**
 * Keeps the canvas on its drag-time node projection until the bounded visual
 * settle window closes. This prevents a full projection swap from competing
 * with the Worker routing commit while semantic interaction state can still
 * leave the active-drag state immediately on pointer release.
 */
export const resolveDesignerDragRenderPolicy = ({
    isDragging,
    isDraggingNode,
    performanceMode,
}: DesignerDragRenderPolicyInput): DesignerDragRenderPolicy => ({
    canvasDragActive: isDragging || isDraggingNode,
    usePerformanceNodes: performanceMode || isDraggingNode,
});
