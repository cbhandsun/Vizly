import { useCallback } from 'react';
import type { TFunction } from 'i18next';
import Input from 'antd/es/input';
import type { DiagramSaveAsTarget } from '@/core/types/diagram-components';

import { addCustomPreset } from '@/core/utils/customPresetStorage';
import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { tryAttachDiagramSnapshot } from '@/core/utils/diagramSnapshot';
import { getFlowDataBridge } from '@/core/utils/flowDataBridge';
import { invalidateRemoteDiagramPreview } from '@/services/remoteDiagramPreview';
import {
    logDiagramViewerDirectSaveFailure,
    logDiagramViewerSaveAsFailure,
} from './diagramViewerLogging';
import {
    isDiagramViewerBridgeSavable,
    normalizeDiagramSaveAsName,
    saveDiagramViewerCloudReplica,
    saveDiagramViewerDirectCloud,
} from './diagramViewerSave';

interface UseDiagramViewerSaveActionsOptions {
    selectedDiagramId: string;
    t: TFunction;
    onCloudReplicaSaved: (id: string) => void;
}

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const getStorageProvider = async (providerName: 's3' | 'supabase') => {
    const { unifiedStorage } = await import('@/services/UnifiedStorageService');
    return unifiedStorage.getProvider(providerName);
};

const getSaveTargetLabel = (target: DiagramSaveAsTarget, t: TFunction): string => {
    if (target === 'local') return t('workspace.local');
    return target === 's3' ? 'S3' : 'Supabase';
};

export function useDiagramViewerSaveActions({
    selectedDiagramId,
    t,
    onCloudReplicaSaved,
}: UseDiagramViewerSaveActionsOptions) {
    const handleSaveTo = useCallback(async (target: DiagramSaveAsTarget) => {
        const bridge = getFlowDataBridge(selectedDiagramId);
        if (!isDiagramViewerBridgeSavable(bridge)) {
            appMessage.error('未找到图表数据，无法保存');
            return;
        }

        const defaultName = bridge.metadata?.title || bridge.name || t('diagramViewer.saveAs.defaultName');
        const targetLabel = getSaveTargetLabel(target, t);
        let newName = String(defaultName);
        appModal.confirm({
            title: t('diagramViewer.saveAs.title', { target: targetLabel }),
            content: (
                <div style={{ marginTop: 16 }}>
                    <p style={{ marginBottom: 8, color: '#666' }}>{t('diagramViewer.saveAs.namePlaceholder')}</p>
                    <Input
                        aria-label={t('diagramViewer.saveAs.nameLabel')}
                        defaultValue={newName}
                        onChange={event => { newName = event.target.value; }}
                    />
                </div>
            ),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                const normalizedName = normalizeDiagramSaveAsName(newName);
                if (!normalizedName) {
                    appMessage.error(t('diagramViewer.saveAs.nameRequired'));
                    return;
                }

                const hideLoading = appMessage.loading(t('diagramViewer.saveAs.saving', { target: targetLabel }), 0);
                try {
                    const dataToSave = {
                        ...bridge,
                        id: crypto.randomUUID(),
                        name: normalizedName,
                        metadata: { ...(bridge.metadata || {}), title: normalizedName },
                    };

                    if (target === 'local') {
                        if (!addCustomPreset(normalizedName, dataToSave)) {
                            throw new Error('本地模板数据无效');
                        }
                        appMessage.success(t('diagramViewer.saveAs.localSuccess'));
                        return;
                    }

                    const savedId = await saveDiagramViewerCloudReplica({
                        bridge,
                        selectedDiagramId,
                        providerName: target,
                        title: normalizedName,
                        getProvider: getStorageProvider,
                        attachSnapshot: tryAttachDiagramSnapshot,
                        invalidatePreview: invalidateRemoteDiagramPreview,
                        createId: () => crypto.randomUUID(),
                    });
                    onCloudReplicaSaved(savedId);
                    appMessage.success(t('diagramViewer.saveAs.cloudSuccess'));
                } catch (error) {
                    logDiagramViewerSaveAsFailure(target, error);
                    appMessage.error(t('diagramViewer.saveAs.error', { message: getErrorMessage(error) }));
                } finally {
                    hideLoading();
                }
            },
        });
    }, [onCloudReplicaSaved, selectedDiagramId, t]);

    const handleDirectSave = useCallback(async () => {
        const bridge = getFlowDataBridge(selectedDiagramId);
        const cloudMeta = bridge?.metadata?.cloud;
        if (!bridge) {
            appMessage.error(t('diagramViewer.canvasNotFound'));
            return;
        }
        if (!cloudMeta?.provider || !cloudMeta.title) {
            appMessage.info(t('diagramViewer.directSave.locationRequired'));
            return;
        }

        const hideLoading = appMessage.loading(t('diagramViewer.directSave.saving', { provider: cloudMeta.provider }), 0);
        try {
            await saveDiagramViewerDirectCloud({
                bridge,
                selectedDiagramId,
                getProvider: getStorageProvider,
                attachSnapshot: tryAttachDiagramSnapshot,
                invalidatePreview: invalidateRemoteDiagramPreview,
            });
            appMessage.success(t('diagramViewer.directSave.success'));
        } catch (error) {
            logDiagramViewerDirectSaveFailure(String(cloudMeta.provider), error);
            appMessage.error(t('diagramViewer.directSave.error', { message: getErrorMessage(error) }));
        } finally {
            hideLoading();
        }
    }, [selectedDiagramId, t]);

    return { handleSaveTo, handleDirectSave };
}
