export const clearFlowchartCanvas = <NodeShape, EdgeShape>({
    nodes,
    edges,
    setNodes,
    setEdges,
    takeSnapshot,
}: {
    nodes: NodeShape[];
    edges: EdgeShape[];
    setNodes: (nodes: NodeShape[]) => void;
    setEdges: (edges: EdgeShape[]) => void;
    takeSnapshot: (nodes: NodeShape[], edges: EdgeShape[]) => void;
}): void => {
    takeSnapshot(nodes, edges);
    setNodes([]);
    setEdges([]);
};

export const shouldConfirmFlowchartClearCanvas = <NodeShape, EdgeShape>(
    nodes: NodeShape[],
    edges: EdgeShape[],
): boolean => nodes.length > 0 || edges.length > 0;

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
    okButtonProps: { danger: true },
    onOk: onConfirm,
});
