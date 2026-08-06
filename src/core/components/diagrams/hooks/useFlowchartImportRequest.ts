import { useCallback, type RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { MessageInstance } from 'antd/es/message/interface';
import type { Edge, Node } from '@xyflow/react';

import { appModal } from '@/core/utils/antdStaticBridge';
import { focusFlowchartImportTrigger } from '../flowchartImportFocus';
import { requestFlowchartImport } from '../flowchartImportRequest';

export interface FlowchartImportRequestOptions {
    startImport?: () => void;
    okText?: string;
    onConfirmationClosed?: () => void;
}

export const useFlowchartImportRequest = ({
    editingEnabled,
    nodesRef,
    edgesRef,
    fileInputRef,
    importInFlightRef,
    messageApi,
    t,
}: {
    editingEnabled: boolean;
    nodesRef: RefObject<Node[]>;
    edgesRef: RefObject<Edge[]>;
    fileInputRef: RefObject<HTMLInputElement | null>;
    importInFlightRef: RefObject<boolean>;
    messageApi: MessageInstance;
    t: TFunction;
}) => useCallback((options?: FlowchartImportRequestOptions) => {
    const currentNodes = nodesRef.current ?? [];
    const currentEdges = edgesRef.current ?? [];
    const startImport = options?.startImport ?? (() => fileInputRef.current?.click());
    requestFlowchartImport({
        editingEnabled,
        importInProgress: importInFlightRef.current,
        nodes: currentNodes,
        edges: currentEdges,
        title: t('designer.flowchart.import.confirmTitle'),
        content: t('designer.flowchart.import.confirmContent', {
            nodes: currentNodes.length,
            edges: currentEdges.length,
        }),
        okText: options?.okText ?? t('designer.flowchart.import.confirmOk'),
        cancelText: t('common.cancel'),
        onEditingUnavailable: () => {
            messageApi.info(t('designer.flowchart.import.editingRequired'));
        },
        onImportInProgress: () => {
            messageApi.info(t('designer.flowchart.import.inProgress'));
        },
        openFilePicker: startImport,
        onConfirmationClosed: options?.onConfirmationClosed ?? focusFlowchartImportTrigger,
        showConfirmation: appModal.confirm,
    });
}, [editingEnabled, edgesRef, fileInputRef, importInFlightRef, messageApi, nodesRef, t]);
