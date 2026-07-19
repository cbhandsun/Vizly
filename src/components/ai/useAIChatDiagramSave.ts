import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';

import { dataRegistry } from '@/data/DataRegistry';
import { sanitizeAIProviderError } from '@/services/ai/errorSecurity';
import { appMessage } from '@/core/utils/antdStaticBridge';
import {
    getAIDiagramTitle,
    parseAIDiagramJson,
    registerAIDiagramLocally,
    serializeAIDiagram,
    upsertDiagramConfigIndex,
} from './aiDiagramImport';
import {
    executeAIChatDiagramSave,
    prepareAIChatDiagramSave,
    type AIChatSaveTarget,
} from './aiChatSave';
import {
    logAIChatInvalidDiagramSavePayload,
    logAIChatLocalIndexPersistFailure,
} from './aiLogging';

const loadUnifiedStorage = async () => (await import('@/services/UnifiedStorageService')).unifiedStorage;

interface UseAIChatDiagramSaveOptions {
    t: TFunction;
    userId?: string;
}

export function useAIChatDiagramSave({ t, userId }: UseAIChatDiagramSaveOptions) {
    const [saveModalVisible, setSaveModalVisible] = useState(false);
    const [saveTarget, setSaveTarget] = useState<AIChatSaveTarget | null>(null);
    const [saveTitle, setSaveTitle] = useState('');
    const [saveJson, setSaveJson] = useState('');

    const handleSaveDiagramTo = useCallback((jsonContent: string, target: AIChatSaveTarget) => {
        try {
            const preparedSave = prepareAIChatDiagramSave({
                jsonContent,
                target,
                parseDiagram: parseAIDiagramJson,
                getDiagramTitle: getAIDiagramTitle,
                serializeDiagram: serializeAIDiagram,
            });
            setSaveTitle(preparedSave.saveTitle);
            setSaveJson(preparedSave.saveJson);
            setSaveTarget(preparedSave.saveTarget);
            setSaveModalVisible(true);
        } catch (error) {
            logAIChatInvalidDiagramSavePayload(error);
            appMessage.error(t('aiChat.invalidDiagram'));
        }
    }, [t]);

    const executeSave = useCallback(async () => {
        if (!saveTarget || !saveJson) return;
        setSaveModalVisible(false);

        try {
            const targetLabel = saveTarget === 'local'
                ? t('storage.manager.local')
                : (saveTarget === 's3' ? 'S3' : 'Supabase');
            const hideLoading = appMessage.loading(t('aiChat.status.savingTo', { target: targetLabel }), 0);
            try {
                const result = await executeAIChatDiagramSave({
                    jsonContent: saveJson,
                    target: saveTarget,
                    title: saveTitle,
                    userId,
                    localStorage,
                    parseDiagram: parseAIDiagramJson,
                    getLocalDataService: () => dataRegistry.getDataService(),
                    registerLocalDiagram: registerAIDiagramLocally,
                    persistLocalIndex: (storage, diagram, title) => {
                        try {
                            upsertDiagramConfigIndex(storage, diagram, title);
                        } catch (error) {
                            logAIChatLocalIndexPersistFailure(error);
                        }
                    },
                    loadUnifiedStorage,
                });
                appMessage.success(t('aiChat.status.saveSuccess', { target: targetLabel, title: result.title }));
            } finally {
                hideLoading();
            }
        } catch (error) {
            appMessage.error(t('aiChat.status.saveFailed', { error: sanitizeAIProviderError(error) }));
        }
    }, [saveJson, saveTarget, saveTitle, t, userId]);

    return {
        saveModalVisible,
        setSaveModalVisible,
        saveTarget,
        saveTitle,
        setSaveTitle,
        handleSaveDiagramTo,
        executeSave,
    };
}
