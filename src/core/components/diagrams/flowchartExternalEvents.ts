import type { Edge, Node } from '@xyflow/react';

export const createFlowchartSnapshotEventHandler = ({
    getNodes,
    getEdges,
    takeSnapshot,
}: {
    getNodes: () => Node[];
    getEdges: () => Edge[];
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
}) => (): void => {
    takeSnapshot(getNodes(), getEdges());
};

export const createFlowchartReverseImportSuccessHandler = ({
    notifySuccess,
    scheduleFitView,
}: {
    notifySuccess: (filename: string) => void;
    scheduleFitView: () => void;
}) => (
    event: Pick<CustomEvent<{ filename?: string }>, 'detail'>
): void => {
    notifySuccess(event.detail?.filename || '');
    scheduleFitView();
};
