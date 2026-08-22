import { createRef, useCallback } from 'react';
import type { TFunction } from 'i18next';
import type { InputRef } from 'antd';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Input from 'antd/es/input';
import type { DiagramSaveAsTarget } from '@/core/types/diagram-components';

import {
    CUSTOM_PRESET_NAME_MAX_LENGTH,
    CUSTOM_PRESETS_LIMIT,
    getCustomPreset,
    saveCustomPreset,
    type CustomPresetSaveError,
} from '@/core/utils/customPresetStorage';
import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { tryAttachDiagramSnapshot } from '@/core/utils/diagramSnapshot';
import { getFlowDataBridge } from '@/core/utils/flowDataBridge';
import { invalidateRemoteDiagramPreview } from '@/services/remoteDiagramPreview';
import {
    logDiagramViewerDirectSaveFailure,
    logDiagramViewerSaveAsFailure,
} from './diagramViewerLogging';
import {
    DIAGRAM_SAVE_AS_NAME_MAX_LENGTH,
    isDiagramViewerBridgeSavable,
    saveDiagramViewerCloudReplica,
    saveDiagramViewerDirectCloud,
    validateDiagramSaveAsName,
} from './diagramViewerSave';
import { openLocalWorkspaceManager } from './diagrams/ui/openLocalWorkspaceManager';

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
        const nameMaxLength = target === 'local'
            ? CUSTOM_PRESET_NAME_MAX_LENGTH
            : DIAGRAM_SAVE_AS_NAME_MAX_LENGTH;
        const nameInputRef = createRef<InputRef>();
        let newName = String(defaultName);
        let isSaving = false;
        let isOverwriteConfirmOpen = false;
        let shouldRestoreInputAfterOverwriteClose = false;
        let inlineSaveError: string | null = null;
        let inlineLocalSaveError: CustomPresetSaveError | null = null;

        const renderNameContent = () => (
            <div style={{ marginTop: 16 }}>
                <p style={{ marginBottom: 8, color: '#666' }}>{t('diagramViewer.saveAs.namePlaceholder')}</p>
                <Input
                    ref={nameInputRef}
                    aria-label={t('diagramViewer.saveAs.nameLabel')}
                    defaultValue={newName}
                    maxLength={nameMaxLength}
                    showCount
                    onChange={event => { newName = event.target.value; }}
                />
                {inlineSaveError && (
                    <Alert
                        type="error"
                        showIcon
                        message={(
                            <div className="flex flex-col items-start gap-3">
                                <span>{inlineSaveError}</span>
                                {inlineLocalSaveError === 'capacity' ? (
                                    <Button size="small" onClick={() => openLocalWorkspaceManager(t)}>
                                        {t('diagramViewer.switcher.localManager.manage')}
                                    </Button>
                                ) : null}
                            </div>
                        )}
                        style={{ marginTop: 12 }}
                    />
                )}
            </div>
        );

        const saveValidatedName = async (normalizedName: string) => {
            if (isSaving) return;

            inlineSaveError = null;
            inlineLocalSaveError = null;
            isSaving = true;
            modalHandle?.update({
                content: renderNameContent(),
                okButtonProps: { loading: true, onClick: () => { void handleConfirm(); } },
                cancelButtonProps: { disabled: true },
            });
            const hideLoading = appMessage.loading(t('diagramViewer.saveAs.saving', { target: targetLabel }), 0);
            let saveSucceeded = false;
            try {
                const dataToSave = {
                    ...bridge,
                    id: crypto.randomUUID(),
                    name: normalizedName,
                    metadata: { ...(bridge.metadata || {}), title: normalizedName },
                };

                if (target === 'local') {
                    const localSaveResult = saveCustomPreset(normalizedName, dataToSave);
                    if (!localSaveResult.ok) {
                        inlineLocalSaveError = localSaveResult.error;
                        const errorKey = localSaveResult.error === 'capacity'
                            ? 'diagramViewer.saveAs.localCapacityError'
                            : localSaveResult.error === 'readFailed'
                                ? 'diagramViewer.saveAs.localReadError'
                                : localSaveResult.error === 'writeFailed'
                                    ? 'diagramViewer.saveAs.localWriteError'
                                    : 'diagramViewer.saveAs.localInvalidError';
                        throw new Error(t(errorKey, { max: CUSTOM_PRESETS_LIMIT }));
                    }
                    appMessage.success(t('diagramViewer.saveAs.localSuccess'));
                    saveSucceeded = true;
                } else {
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
                    saveSucceeded = true;
                }
            } catch (error) {
                inlineSaveError = getErrorMessage(error);
                logDiagramViewerSaveAsFailure(target, error);
                appMessage.error(t('diagramViewer.saveAs.error', { message: inlineSaveError }));
            } finally {
                hideLoading();
                isSaving = false;
            }

            if (saveSucceeded) {
                modalHandle?.destroy();
            } else {
                modalHandle?.update({
                    content: renderNameContent(),
                    okButtonProps: { loading: false, onClick: () => { void handleConfirm(); } },
                    cancelButtonProps: { disabled: false },
                });
                window.requestAnimationFrame(() => nameInputRef.current?.focus());
            }
        };

        const markNameInputForFocusRestore = () => {
            isOverwriteConfirmOpen = false;
            shouldRestoreInputAfterOverwriteClose = true;
        };

        const restoreNameInputFocusAfterClose = () => {
            if (!shouldRestoreInputAfterOverwriteClose) return;
            shouldRestoreInputAfterOverwriteClose = false;
            window.requestAnimationFrame(() => nameInputRef.current?.focus());
        };

        const handleConfirm = async () => {
            if (isSaving || isOverwriteConfirmOpen) return;

            const validation = validateDiagramSaveAsName(newName, nameMaxLength);
            if (!validation.ok) {
                appMessage.error(t(
                    validation.error === 'tooLong'
                        ? 'diagramViewer.saveAs.nameTooLong'
                        : 'diagramViewer.saveAs.nameRequired',
                    { max: nameMaxLength },
                ));
                window.requestAnimationFrame(() => nameInputRef.current?.focus());
                return;
            }
            const normalizedName = validation.value;

            if (target === 'local' && getCustomPreset(normalizedName)) {
                isOverwriteConfirmOpen = true;
                appModal.confirm({
                    title: t('diagramViewer.saveAs.overwriteTitle'),
                    content: t('diagramViewer.saveAs.overwriteDescription', { name: normalizedName }),
                    okText: t('diagramViewer.saveAs.replace'),
                    cancelText: t('diagramViewer.saveAs.keepEditing'),
                    okButtonProps: { danger: true },
                    onOk: async () => {
                        isOverwriteConfirmOpen = false;
                        await saveValidatedName(normalizedName);
                    },
                    onCancel: markNameInputForFocusRestore,
                    afterClose: restoreNameInputFocusAfterClose,
                });
                return;
            }

            await saveValidatedName(normalizedName);
        };

        const modalHandle = appModal.confirm({
            title: t('diagramViewer.saveAs.title', { target: targetLabel }),
            content: renderNameContent(),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            okButtonProps: { onClick: () => { void handleConfirm(); } },
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
