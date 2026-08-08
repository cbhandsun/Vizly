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
    onClosed,
}: {
    title: string;
    content: string;
    okText: string;
    cancelText: string;
    onConfirm: () => void;
    onClosed?: () => void;
}) => {
    return {
        title,
        content,
        okText,
        cancelText,
        okButtonProps: { danger: true },
        autoFocusButton: 'cancel' as const,
        onOk: () => {
            onConfirm();
        },
        afterClose: () => {
            onClosed?.();
        },
    };
};

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
    onConfirmationClosed,
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
    onConfirmationClosed?: () => void;
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
        onClosed: onConfirmationClosed,
    }));
    return 'confirmation-requested';
};
