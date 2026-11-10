import { captureAuthSession, getAuthSessionRevision, onAuthSessionInvalidated } from '@/context/authSessionBoundary';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { TFunction } from 'i18next';

import { dataRegistry } from '@/data/DataRegistry';
import { sanitizeAIProviderError } from '@/services/ai/errorSecurity';
import { appMessage } from '@vizly/core/antd';
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
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const savingRef = useRef<{ session: object } | null>(null);
    const revision = useSyncExternalStore(onAuthSessionInvalidated, getAuthSessionRevision, getAuthSessionRevision);
    const [draftOwner, setDraftOwner] = useState({ userId, revision });
    const ownsDraft = draftOwner.userId === userId && draftOwner.revision === revision;
    const session = useMemo(() => ({ revision, ...captureAuthSession(userId) }), [userId, revision]);
    if (!ownsDraft) {
        setSaveModalVisible(false); setSaveJson(''); setSaveTitle(''); setSaveError(''); setSaving(false);
        setDraftOwner({ userId, revision });
    }

    const handleSaveDiagramTo = useCallback((jsonContent: string, target: AIChatSaveTarget) => {
        if (!session.isCurrent()) return;
        try {
            const preparedSave = prepareAIChatDiagramSave({
                jsonContent,
                target,
                parseDiagram: parseAIDiagramJson,
                getDiagramTitle: getAIDiagramTitle,
                serializeDiagram: serializeAIDiagram,
            });
            setSaveError('');
            setSaveTitle(preparedSave.saveTitle);
            setSaveJson(preparedSave.saveJson);
            setSaveTarget(preparedSave.saveTarget);
            setSaveModalVisible(true);
        } catch (error) {
            logAIChatInvalidDiagramSavePayload(error);
            appMessage.error(t('aiChat.invalidDiagram'));
        }
    }, [t, session]);

    const executeSave = useCallback(async () => {
        if (!ownsDraft || !saveTarget || !saveJson || savingRef.current?.session === session || !session.isCurrent()) return;
        const request = { session };
        savingRef.current = request;
        setSaving(true);
        setSaveError('');

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
                if (!session.isCurrent() || savingRef.current !== request) return;
                setSaveModalVisible(false);
                appMessage.success(t('aiChat.status.saveSuccess', { target: targetLabel, title: result.title }));
            } finally {
                hideLoading();
            }
        } catch (error) {
            if (!session.isCurrent() || savingRef.current !== request) return;
            const message = t('aiChat.status.saveFailed', { error: sanitizeAIProviderError(error) });
            setSaveError(message);
            appMessage.error(message);
        } finally {
            if (savingRef.current === request) {
                savingRef.current = null;
                setSaving(false);
            }
        }
    }, [saveJson, saveTarget, saveTitle, t, userId, session, ownsDraft]);

    return {
        saveModalVisible: ownsDraft && saveModalVisible,
        saving: ownsDraft && saving,
        saveError: ownsDraft ? saveError : '',
        setSaveModalVisible,
        saveTarget,
        saveTitle,
        setSaveTitle,
        handleSaveDiagramTo,
        executeSave,
    };
}
