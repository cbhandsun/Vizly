import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { DiagramVersion } from '@/services/storage/types';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { getFlowDataBridge } from '@/core/utils/flowDataBridge';
import { coerceClipboardData } from '@/core/utils/flowchartClipboard';
import {
    coerceDiagramVersion,
    parseDiagramVersionList,
} from '@/services/versionSnapshotSecurity';
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
const readCurrentCanvasSnapshot = (getNodes: () => Node[], getEdges: () => Edge[]) => {
    try {
        return coerceClipboardData({ nodes: getNodes(), edges: getEdges() });
    } catch {
        return null;
    }
};
const readPreviewBaseSnapshot = (
    diagramId: string,
    getNodes: () => Node[],
    getEdges: () => Edge[],
) => readCurrentCanvasSnapshot(getNodes, getEdges)
    ?? readBridgeCanvasSnapshot(getFlowDataBridge(diagramId));

export function useVersionHistory(diagramId: string) {
    const { t } = useTranslation();
    const [versionCollection, setVersionCollection] = useState<{
        diagramId: string;
        items: DiagramVersion[];
    }>({ diagramId: '', items: [] });
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [previewVersion, setPreviewVersion] = useState<DiagramVersion | null>(null);
    const previewBaseRef = useRef<{ diagramId: string; nodes: Node[]; edges: Edge[] } | null>(null);
    const previewRequestIdRef = useRef(0);
    const versionsRequestIdRef = useRef(0);
    const mutationPromiseRef = useRef<Promise<boolean> | null>(null);
    const currentDiagramIdRef = useRef(diagramId);
    const versions = versionCollection.diagramId === diagramId ? versionCollection.items : [];

    const runExclusiveMutation = useCallback((operation: () => Promise<boolean>): Promise<boolean> => {
        if (mutationPromiseRef.current) return Promise.resolve(false);

        const pendingOperation = operation();
        mutationPromiseRef.current = pendingOperation;
        return pendingOperation.finally(() => {
            if (mutationPromiseRef.current === pendingOperation) {
                mutationPromiseRef.current = null;
            }
        });
    }, []);

    const loadVersions = useCallback(async () => {
        const requestId = ++versionsRequestIdRef.current;
        if (!diagramId) {
            setLoadError(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(false);
        try {
            const unifiedStorage = await loadUnifiedStorage();
            const data = await unifiedStorage.listVersions(diagramId);
            if (requestId !== versionsRequestIdRef.current) return;
            const parsed = parseDiagramVersionList(data, diagramId);
            if (!parsed.ok) throw new Error('Storage returned an invalid version list.');
            setVersionCollection({ diagramId, items: parsed.value });
        } catch (error) {
            if (requestId !== versionsRequestIdRef.current) return;
            setLoadError(true);
            logVersionHistoryLoadFailure(error);
            appMessage.error(t('designer.versionHistoryPanel.loadFailed'));
        } finally {
            if (requestId === versionsRequestIdRef.current) setLoading(false);
        }
    }, [diagramId, t]);

    const saveVersion = useCallback(async (commitMessage: string): Promise<boolean> => {
        if (!diagramId) return false;

        return runExclusiveMutation(async () => {
            try {
                const unifiedStorage = await loadUnifiedStorage();
                if (currentDiagramIdRef.current !== diagramId) return false;
                const bridge = getFlowDataBridge(diagramId);
                const snapshot = readBridgeCanvasSnapshot(bridge);
                if (!snapshot) {
                    appMessage.error(t('designer.versionHistoryPanel.canvasUnavailable'));
                    return false;
                }

                const newVersion = coerceDiagramVersion(
                    await unifiedStorage.saveVersion(diagramId, snapshot, commitMessage),
                );
                if (!newVersion || newVersion.diagramId !== diagramId) {
                    throw new Error('Storage returned an invalid saved version.');
                }
                if (currentDiagramIdRef.current !== diagramId) return false;

                // Add new version to list without refetching all
                setVersionCollection(prev => ({
                    diagramId,
                    items: prev.diagramId === diagramId
                        ? [newVersion, ...prev.items]
                        : [newVersion],
                }));
                appMessage.success(t('designer.versionHistoryPanel.saveSuccess'));
                return true;
            } catch (error) {
                if (currentDiagramIdRef.current !== diagramId) return false;
                logVersionHistorySaveFailure(error);
                appMessage.error(t('designer.versionHistoryPanel.saveFailed'));
                return false;
            }
        });
    }, [diagramId, runExclusiveMutation, t]);

    const loadVersionData = useCallback(async (versionId: string) => {
        try {
            const unifiedStorage = await loadUnifiedStorage();
            const value = await unifiedStorage.loadVersion(diagramId, versionId);
            if (value === null) return null;
            const version = coerceDiagramVersion(value);
            if (!version || version.diagramId !== diagramId || version.id !== versionId) {
                throw new Error('Storage returned an invalid version payload.');
            }
            return version;
        } catch (e) {
            if (currentDiagramIdRef.current !== diagramId) return null;
            logVersionHistoryPayloadLoadFailure(e);
            appMessage.error(t('designer.versionHistoryPanel.payloadLoadFailed'));
            return null;
        }
    }, [diagramId, t]);

    const enterPreview = useCallback(async (
        versionId: string,
        setNodes: Dispatch<SetStateAction<Node[]>>,
        setEdges: Dispatch<SetStateAction<Edge[]>>,
        getCurrentNodes: () => Node[],
        getCurrentEdges: () => Edge[]
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

        const currentSnapshot = readPreviewBaseSnapshot(
            diagramId,
            getCurrentNodes,
            getCurrentEdges,
        );
        if (!currentSnapshot) {
            appMessage.error(t('designer.versionHistoryPanel.canvasUnavailable'));
            return false;
        }

        previewBaseRef.current ??= { diagramId, ...currentSnapshot };
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        setPreviewVersion(fullVersion);
        return true;
    }, [diagramId, loadVersionData, t]);

    const exitPreview = useCallback(() => {
        previewRequestIdRef.current += 1;
        const previewBase = previewBaseRef.current;
        if (previewBase?.diagramId === diagramId) {
            previewBaseRef.current = null;
            setPreviewVersion(null);
            return { nodes: previewBase.nodes, edges: previewBase.edges };
        }
        previewBaseRef.current = null;
        setPreviewVersion(null);
        return null;
    }, [diagramId]);

    const restoreVersion = useCallback(async (
        versionId: string,
        setNodes: Dispatch<SetStateAction<Node[]>>,
        setEdges: Dispatch<SetStateAction<Edge[]>>
    ) => runExclusiveMutation(async () => {
        const fullVersion = previewVersion?.diagramId === diagramId && previewVersion.id === versionId
            ? previewVersion
            : await loadVersionData(versionId);
        if (currentDiagramIdRef.current !== diagramId) return false;

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

        const backupSnapshot = previewBaseRef.current?.diagramId === diagramId
            ? coerceClipboardData(previewBaseRef.current)
            : readBridgeCanvasSnapshot(bridge);
        if (!backupSnapshot) {
            appMessage.error(t('designer.versionHistoryPanel.backupFailed'));
            return false;
        }

        try {
            const unifiedStorage = await loadUnifiedStorage();
            const backupVersion = coerceDiagramVersion(
                await unifiedStorage.saveVersion(
                    diagramId,
                    backupSnapshot,
                    t('designer.versionHistoryPanel.backupMessage'),
                ),
            );
            if (!backupVersion || backupVersion.diagramId !== diagramId) {
                throw new Error('Storage returned an invalid backup version.');
            }
            if (currentDiagramIdRef.current !== diagramId) return false;
            setVersionCollection(prev => ({
                diagramId,
                items: prev.diagramId === diagramId
                    ? [backupVersion, ...prev.items]
                    : [backupVersion],
            }));
        } catch (e) {
            if (currentDiagramIdRef.current !== diagramId) return false;
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
    }), [diagramId, previewVersion, loadVersionData, runExclusiveMutation, t]);

    useLayoutEffect(() => {
        currentDiagramIdRef.current = diagramId;
        versionsRequestIdRef.current += 1;
        previewRequestIdRef.current += 1;
        previewBaseRef.current = null;
        mutationPromiseRef.current = null;
    }, [diagramId]);

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
        previewVersion: previewVersion?.diagramId === diagramId ? previewVersion : null,
        loadVersions,
        saveVersion,
        enterPreview,
        exitPreview,
        restoreVersion
    };
}
