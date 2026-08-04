import { useCallback, type RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { MessageInstance } from 'antd/es/message/interface';
import type { Edge, Node } from '@xyflow/react';

import { appModal } from '@/core/utils/antdStaticBridge';
import { requestFlowchartImport } from '../flowchartImportRequest';

export const useFlowchartImportRequest = ({
    editingEnabled,
    nodesRef,
    edgesRef,
    fileInputRef,
    messageApi,
    t,
}: {
    editingEnabled: boolean;
    nodesRef: RefObject<Node[]>;
    edgesRef: RefObject<Edge[]>;
    fileInputRef: RefObject<HTMLInputElement | null>;
    messageApi: MessageInstance;
    t: TFunction;
}) => useCallback(() => {
    const currentNodes = nodesRef.current ?? [];
    const currentEdges = edgesRef.current ?? [];
    const openFilePicker = () => fileInputRef.current?.click();
    requestFlowchartImport({
        editingEnabled,
        nodes: currentNodes,
        edges: currentEdges,
        title: t('designer.flowchart.import.confirmTitle'),
        content: t('designer.flowchart.import.confirmContent', {
            nodes: currentNodes.length,
            edges: currentEdges.length,
        }),
        okText: t('designer.flowchart.import.confirmOk'),
        cancelText: t('common.cancel'),
        onEditingUnavailable: () => {
            messageApi.info(t('designer.flowchart.import.editingRequired'));
        },
        openFilePicker,
        showConfirmation: appModal.confirm,
    });
}, [editingEnabled, edgesRef, fileInputRef, messageApi, nodesRef, t]);
