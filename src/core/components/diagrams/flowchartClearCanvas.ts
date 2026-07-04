export const clearFlowchartCanvas = <NodeShape, EdgeShape>({
    setNodes,
    setEdges,
    takeSnapshot,
}: {
    setNodes: (nodes: NodeShape[]) => void;
    setEdges: (edges: EdgeShape[]) => void;
    takeSnapshot: (nodes: NodeShape[], edges: EdgeShape[]) => void;
}): void => {
    setNodes([]);
    setEdges([]);
    takeSnapshot([], []);
};

export const buildFlowchartClearCanvasConfirm = ({
    title,
    content,
    okText,
    cancelText,
    onConfirm,
}: {
    title: string;
    content: string;
    okText: string;
    cancelText: string;
    onConfirm: () => void;
}) => ({
    title,
    content,
    okText,
    cancelText,
    onOk: onConfirm,
});
