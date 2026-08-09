import { useState, useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { DiagramVersion } from '@/services/storage/types';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { getFlowDataBridge } from '@/core/utils/flowDataBridge';
import { coerceClipboardData } from '@/core/utils/flowchartClipboard';
import {
    logVersionHistoryLoadFailure,
    logVersionHistoryPayloadLoadFailure,
    logVersionHistoryRestoreFailure,
    logVersionHistorySaveFailure,
} from './diagramStorageLogging';

const loadUnifiedStorage = async () => (await import('@/services/UnifiedStorageService')).unifiedStorage;
const readBridgeCanvasSnapshot = (bridge: ReturnType<typeof getFlowDataBridge>) => {
    if (!bridge) return null;
    const candidate = typeof bridge.getCanvasSnapshot === 'function'
        ? bridge.getCanvasSnapshot()
        : { nodes: bridge.nodes, edges: bridge.edges };
    return coerceClipboardData(candidate);
};

export function useVersionHistory(diagramId: string) {
    const { t } = useTranslation();
    const [versions, setVersions] = useState<DiagramVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [previewVersion, setPreviewVersion] = useState<DiagramVersion | null>(null);
    const previewBaseRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
    const previewRequestIdRef = useRef(0);

    const loadVersions = useCallback(async () => {
        if (!diagramId) return;
        setLoading(true);
        setLoadError(false);
        try {
            const unifiedStorage = await loadUnifiedStorage();
            const data = await unifiedStorage.listVersions(diagramId);
            setVersions(data);
        } catch (error) {
            setLoadError(true);
            logVersionHistoryLoadFailure(error);
            appMessage.error(t('designer.versionHistoryPanel.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [diagramId, t]);

    const saveVersion = useCallback(async (commitMessage: string): Promise<boolean> => {
        if (!diagramId) return false;

        try {
            const unifiedStorage = await loadUnifiedStorage();
            const bridge = getFlowDataBridge(diagramId);
            const snapshot = readBridgeCanvasSnapshot(bridge);
            if (!snapshot) {
                appMessage.error(t('designer.versionHistoryPanel.canvasUnavailable'));
                return false;
            }

            const newVersion = await unifiedStorage.saveVersion(diagramId, snapshot, commitMessage);
            
            // Add new version to list without refetching all
            setVersions(prev => [newVersion, ...prev]);
            appMessage.success(t('designer.versionHistoryPanel.saveSuccess'));
            return true;
            
        } catch (error) {
            logVersionHistorySaveFailure(error);
            appMessage.error(t('designer.versionHistoryPanel.saveFailed'));
            return false;
        }
    }, [diagramId, t]);

    const loadVersionData = useCallback(async (versionId: string) => {
        try {
            const unifiedStorage = await loadUnifiedStorage();
            return await unifiedStorage.loadVersion(diagramId, versionId);
        } catch (e) {
            logVersionHistoryPayloadLoadFailure(e);
            appMessage.error(t('designer.versionHistoryPanel.payloadLoadFailed'));
            return null;
        }
    }, [diagramId, t]);

    const enterPreview = useCallback(async (
        versionId: string,
        setNodes: Dispatch<SetStateAction<Node[]>>,
        setEdges: Dispatch<SetStateAction<Edge[]>>,
        currentNodes: Node[],
        currentEdges: Edge[]
    ) => {
        const requestId = ++previewRequestIdRef.current;
        const fullVersion = await loadVersionData(versionId);
        if (requestId !== previewRequestIdRef.current) return false;
        if (!fullVersion || !fullVersion.snapshotData) {
            appMessage.error(t('designer.versionHistoryPanel.previewMissing'));
            return false;
        }

        const snapshot = coerceClipboardData(fullVersion.snapshotData);
        if (!snapshot) {
            appMessage.error(t('designer.versionHistoryPanel.previewInvalid'));
            return false;
        }

        previewBaseRef.current ??= { nodes: currentNodes, edges: currentEdges };
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        setPreviewVersion(fullVersion);
        return true;
    }, [loadVersionData, t]);

    const exitPreview = useCallback(() => {
        previewRequestIdRef.current += 1;
        const previewBase = previewBaseRef.current;
        if (previewBase) {
            previewBaseRef.current = null;
            setPreviewVersion(null);
            return previewBase;
        }
        setPreviewVersion(null);
        return null;
    }, []);

    const restoreVersion = useCallback(async (
        versionId: string,
        setNodes: Dispatch<SetStateAction<Node[]>>,
        setEdges: Dispatch<SetStateAction<Edge[]>>
    ) => {
        const fullVersion = previewVersion?.id === versionId 
            ? previewVersion 
            : await loadVersionData(versionId);

        if (!fullVersion || !fullVersion.snapshotData) {
            appMessage.error(t('designer.versionHistoryPanel.restoreMissing'));
            return false;
        }

        const snapshot = coerceClipboardData(fullVersion.snapshotData);
        if (!snapshot) {
            appMessage.error(t('designer.versionHistoryPanel.restoreInvalid'));
            return false;
        }

        const bridge = getFlowDataBridge(diagramId);
        if (!bridge) {
            appMessage.error(t('designer.versionHistoryPanel.canvasUnavailable'));
            return false;
        }

        const backupSnapshot = previewBaseRef.current
            ? coerceClipboardData(previewBaseRef.current)
            : readBridgeCanvasSnapshot(bridge);
        if (!backupSnapshot) {
            appMessage.error(t('designer.versionHistoryPanel.backupFailed'));
            return false;
        }

        try {
            const unifiedStorage = await loadUnifiedStorage();
            const backupVersion = await unifiedStorage.saveVersion(
                diagramId,
                backupSnapshot,
                t('designer.versionHistoryPanel.backupMessage'),
            );
            setVersions(prev => [backupVersion, ...prev]);
        } catch (e) {
            logVersionHistoryRestoreFailure(e);
            appMessage.error(t('designer.versionHistoryPanel.backupFailed'));
            return false;
        }

        try {
            if (typeof bridge.replaceCanvasSnapshot === 'function') {
                bridge.replaceCanvasSnapshot(snapshot);
            } else {
                setNodes(snapshot.nodes);
                setEdges(snapshot.edges);
            }

            appMessage.success(t('designer.versionHistoryPanel.restoreSuccess', {
                message: fullVersion.message || fullVersion.id.substring(0, 8),
            }));
            previewBaseRef.current = null;
            setPreviewVersion(null);
            return true;
        } catch (e) {
            logVersionHistoryRestoreFailure(e);
            appMessage.error(t('designer.versionHistoryPanel.restoreFailed'));
        }
        return false;
    }, [diagramId, previewVersion, loadVersionData, t]);

    // Initial load
    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) void loadVersions();
        });
        return () => { cancelled = true; };
    }, [loadVersions]);

    return {
        versions,
        loading,
        loadError,
        previewVersion,
        loadVersions,
        saveVersion,
        enterPreview,
        exitPreview,
        restoreVersion
    };
}
