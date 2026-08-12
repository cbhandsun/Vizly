import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tryAttachDiagramSnapshot } from '@/core/utils/diagramSnapshot';
import { invalidateRemoteDiagramPreview } from '@/services/remoteDiagramPreview';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { getFlowDataBridge } from '@/core/utils/flowDataBridge';
import { coerceToStandardDiagramData } from '@/core/utils/coerceDiagram';
import { logCloudSaveFailure } from './diagramStorageLogging';
import { showCloudSaveConfigurationRecovery } from './cloudSaveRecovery';
import { useAuth } from '@/context/useAuth';
import type { DiagramSaveResult } from '@/core/types/diagram-components';

const loadUnifiedStorage = async () => (await import('@/services/UnifiedStorageService')).unifiedStorage;

class CloudSaveBoundaryError extends Error {
    constructor(readonly userMessage: string) {
        super(userMessage);
        this.name = 'CloudSaveBoundaryError';
    }
}

class PendingCloudSave {
    readonly promise: Promise<DiagramSaveResult>;
    private resolvePromise: ((result: DiagramSaveResult) => void) | null = null;
    private rejectPromise: ((error: unknown) => void) | null = null;

    constructor() {
        this.promise = new Promise<DiagramSaveResult>((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    }

    resolve(result: DiagramSaveResult): void {
        this.resolvePromise?.(result);
        this.clear();
    }

    reject(error: unknown): void {
        this.rejectPromise?.(error);
        this.clear();
    }

    private clear(): void {
        this.resolvePromise = null;
        this.rejectPromise = null;
    }
}

/**
 * 轻量云保存 Hook — 读取 __flowDataBridge 数据并上传到活动云提供商
 */
export function useCloudSave(diagramId: string, diagramName?: string) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [cloudSaveAuthOpen, setCloudSaveAuthOpen] = useState(false);
    const [cloudSaveAuthEnabled, setCloudSaveAuthEnabled] = useState(false);
    const shareDialogTriggerRef = useRef<HTMLElement | null>(null);
    const cloudSaveTriggerRef = useRef<HTMLElement | null>(null);
    const pendingCloudSaveRef = useRef<PendingCloudSave | null>(null);

    const performCloudSave = useCallback(async () => {
        let hideLoading: (() => void) | undefined;
        try {
            const unifiedStorage = await loadUnifiedStorage();
            if (!unifiedStorage.isConfigured()) {
                throw new CloudSaveBoundaryError('云存储未配置，请先在设置中配置');
            }
            const provider = unifiedStorage.activeProvider;

            // 从桥接数据中读取（FlowchartDesigner 的 useEffect 会持续更新此数据）
            const bridge = getFlowDataBridge(diagramId);
            if (!bridge || !bridge.nodes || bridge.nodes.length === 0) {
                throw new CloudSaveBoundaryError('未找到图表数据');
            }

            hideLoading = appMessage.loading('正在保存到云端...', 0);

            const bridgeCloud = bridge.metadata?.cloud;
            const cloudProvider = bridgeCloud?.provider;
            const normalizedCloud: NonNullable<StandardDiagramData['metadata']>['cloud'] = (
                cloudProvider === provider.id
                && (cloudProvider === 'supabase' || cloudProvider === 's3')
                && typeof bridgeCloud?.id === 'string'
                && bridgeCloud.id.length > 0
            ) ? {
                provider: cloudProvider,
                id: bridgeCloud.id,
                title: typeof bridgeCloud.title === 'string' ? bridgeCloud.title : undefined,
                openedAt: typeof bridgeCloud.openedAt === 'string' ? bridgeCloud.openedAt : undefined,
            } : undefined;

            const diagram = coerceToStandardDiagramData({
                ...bridge,
                id: bridge.id || diagramId,
                name: diagramName || bridge.name || diagramId,
                metadata: {
                    ...(bridge.metadata || {}),
                    title: diagramName || bridge.metadata?.title || diagramId,
                    cloud: normalizedCloud,
                },
            }, {
                id: bridge.id || diagramId,
                title: diagramName || bridge.name || diagramId,
            });

            const snap = await tryAttachDiagramSnapshot(diagram, diagramId);

            const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(diagram.id || '');
            const hasForeignCloudIdentity = (
                (cloudProvider === 'supabase' || cloudProvider === 's3')
                && cloudProvider !== provider.id
                && typeof bridgeCloud?.id === 'string'
                && bridgeCloud.id.length > 0
            );
            const cloudId = normalizedCloud?.id;
            const finalId = cloudId || (
                hasForeignCloudIdentity || !isValidUuid
                    ? crypto.randomUUID()
                    : diagram.id
            );
            const finalTitle = diagramName || diagram.metadata?.title || diagram.name;

            await provider.saveDiagram({
                id: finalId,
                title: finalTitle,
                content: { ...snap.diagram, id: finalId, name: finalTitle },
                updated_at: new Date().toISOString(),
                user_id: 'anonymous',
            });

            invalidateRemoteDiagramPreview(finalId!);

            // 回写 cloud 信息以便下次更新而非新增
            if (bridge) {
                bridge.metadata = {
                    ...(bridge.metadata || {}),
                    cloud: { provider: provider.id, id: finalId, title: finalTitle },
                };
            }

            appMessage.success('已保存到云端');
        } catch (error) {
            if (error instanceof CloudSaveBoundaryError) {
                appMessage.error(error.userMessage);
            } else {
                logCloudSaveFailure('useCloudSave', error);
                appMessage.error('保存到云端失败');
            }
            throw error;
        } finally {
            hideLoading?.();
        }
    }, [diagramId, diagramName]);

    const captureCloudSaveTrigger = useCallback(() => {
        const activeElement = document.activeElement;
        const fallbackTrigger = document.querySelector<HTMLElement>('[data-cloud-save-focus-return="true"]');
        cloudSaveTriggerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
            ? activeElement
            : fallbackTrigger;
    }, []);

    const saveToCloud = useCallback(async (): Promise<DiagramSaveResult> => {
        captureCloudSaveTrigger();
        let unifiedStorage: Awaited<ReturnType<typeof loadUnifiedStorage>>;
        let provider: Awaited<ReturnType<typeof loadUnifiedStorage>>['activeProvider'];
        let isProviderConfigured: boolean;
        try {
            unifiedStorage = await loadUnifiedStorage();
            provider = unifiedStorage.activeProvider;
            isProviderConfigured = unifiedStorage.isConfigured();
        } catch (error) {
            logCloudSaveFailure('useCloudSave.bootstrap', error);
            appMessage.error(t('storage.manager.cloudSaveUnavailable'));
            throw error;
        }

        if (!isProviderConfigured) {
            const providerName = provider.id === 's3' ? 'S3' : 'Supabase';
            showCloudSaveConfigurationRecovery({
                title: t('storage.manager.providerNotConfigured', { provider: providerName }),
                description: t('storage.manager.cloudSaveConfigureHint'),
                actionLabel: t('storage.manager.goConfig'),
            });
            return 'cancelled';
        }

        if (provider.id === 'supabase' && !user) {
            if (!pendingCloudSaveRef.current) {
                pendingCloudSaveRef.current = new PendingCloudSave();
                appMessage.warning(t('storage.manager.needLoginForSupabase'));
                setCloudSaveAuthEnabled(true);
                setCloudSaveAuthOpen(true);
            }
            return pendingCloudSaveRef.current.promise;
        }
        return performCloudSave();
    }, [captureCloudSaveTrigger, performCloudSave, t, user]);

    const cancelCloudSaveAuthentication = useCallback(() => {
        pendingCloudSaveRef.current?.resolve('cancelled');
        pendingCloudSaveRef.current = null;
        setCloudSaveAuthOpen(false);
    }, []);

    const completeCloudSaveAuthentication = useCallback(() => {
        const pendingSave = pendingCloudSaveRef.current;
        pendingCloudSaveRef.current = null;
        setCloudSaveAuthOpen(false);
        if (!pendingSave) return;

        void performCloudSave().then(
            () => pendingSave.resolve(undefined),
            error => pendingSave.reject(error),
        );
    }, [performCloudSave]);

    const restoreCloudSaveFocus = useCallback(() => {
        const fallbackTrigger = document.querySelector<HTMLElement>('[data-cloud-save-focus-return="true"]');
        const trigger = cloudSaveTriggerRef.current?.isConnected
            ? cloudSaveTriggerRef.current
            : fallbackTrigger;
        cloudSaveTriggerRef.current = null;
        window.requestAnimationFrame(() => trigger?.focus());
    }, []);

    useEffect(() => () => {
        pendingCloudSaveRef.current?.resolve('cancelled');
        pendingCloudSaveRef.current = null;
    }, []);

    const openShareDialog = useCallback(() => {
        const activeElement = document.activeElement;
        const activeTrigger = activeElement instanceof HTMLElement && activeElement !== document.body
            ? activeElement
            : document.querySelector<HTMLElement>('[data-share-dialog-trigger]');
        shareDialogTriggerRef.current = activeTrigger?.isConnected ? activeTrigger : null;
        setShareDialogOpen(true);
    }, []);

    const closeShareDialog = useCallback(() => {
        const trigger = shareDialogTriggerRef.current;
        shareDialogTriggerRef.current = null;
        setShareDialogOpen(false);

        window.requestAnimationFrame(() => {
            if (!trigger?.isConnected || trigger.hasAttribute('disabled')) return;
            trigger.focus();
        });
    }, []);

    /** 确保已保存再分享，返回云端 ID 或 false */
    const ensureSaved = useCallback(async (): Promise<string | false> => {
        try {
            const result = await saveToCloud();
            if (result === 'cancelled') return false;
            const bridge = getFlowDataBridge(diagramId);
            return bridge?.metadata?.cloud?.id || false;
        } catch {
            return false;
        }
    }, [saveToCloud, diagramId]);

    return {
        saveToCloud,
        shareDialogOpen,
        openShareDialog,
        closeShareDialog,
        ensureSaved,
        cloudSaveAuthOpen,
        cloudSaveAuthEnabled,
        cancelCloudSaveAuthentication,
        completeCloudSaveAuthentication,
        restoreCloudSaveFocus,
    };
}
