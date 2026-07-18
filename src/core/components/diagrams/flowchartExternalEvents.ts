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
    event: Event | Pick<CustomEvent<{ filename?: string }>, 'detail'>
): void => {
    const detail = 'detail' in event ? event.detail : undefined;
    notifySuccess(detail?.filename || '');
    scheduleFitView();
};
