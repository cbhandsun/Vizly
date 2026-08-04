export const shouldConfirmFlowchartImport = <NodeShape, EdgeShape>(
    nodes: NodeShape[],
    edges: EdgeShape[],
): boolean => nodes.length > 0 || edges.length > 0;

export const buildFlowchartImportConfirm = ({
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

export type FlowchartImportRequestResult =
    | 'busy'
    | 'blocked'
    | 'opened'
    | 'confirmation-requested';

export const requestFlowchartImport = <NodeShape, EdgeShape>({
    editingEnabled,
    importInProgress = false,
    nodes,
    edges,
    title,
    content,
    okText,
    cancelText,
    onEditingUnavailable,
    onImportInProgress,
    openFilePicker,
    showConfirmation,
}: {
    editingEnabled: boolean;
    importInProgress?: boolean;
    nodes: NodeShape[];
    edges: EdgeShape[];
    title: string;
    content: string;
    okText: string;
    cancelText: string;
    onEditingUnavailable: () => void;
    onImportInProgress?: () => void;
    openFilePicker: () => void;
    showConfirmation: (config: ReturnType<typeof buildFlowchartImportConfirm>) => void;
}): FlowchartImportRequestResult => {
    if (importInProgress) {
        onImportInProgress?.();
        return 'busy';
    }

    if (!editingEnabled) {
        onEditingUnavailable();
        return 'blocked';
    }

    if (!shouldConfirmFlowchartImport(nodes, edges)) {
        openFilePicker();
        return 'opened';
    }

    showConfirmation(buildFlowchartImportConfirm({
        title,
        content,
        okText,
        cancelText,
        onConfirm: openFilePicker,
    }));
    return 'confirmation-requested';
};
