import { captureAuthSession, getAuthSessionOwner, getAuthSessionRevision, onAuthSessionInvalidated } from '@/context/authSessionBoundary';
import { useSyncExternalStore, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { DiagramVersion } from '@/services/storage/types';
import { appMessage } from '@vizly/core/antd';
import { getFlowDataBridge } from '@vizly/core/diagram-data';
import { coerceClipboardData } from '@vizly/core/diagram-import';
import { sanitizeCanvasEdgesForNodes } from '@vizly/core/security';
import { areVersionPreviewSnapshotsEqual, beginVersionPreview, discardVersionPreview, endVersionPreview, readVersionPreviewLive, withVersionPreviewPersistence } from '../collaboration/versionPreviewSession';
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
const sanitizeVersionCanvasSnapshot = (snapshot: ReturnType<typeof coerceClipboardData>) => (
    snapshot
        ? {
            ...snapshot,
            edges: sanitizeCanvasEdgesForNodes(snapshot.nodes, snapshot.edges),
        }
        : null
);
const readBridgeCanvasSnapshot = (bridge: ReturnType<typeof getFlowDataBridge>) => {
    if (!bridge) return null;
    const candidate = typeof bridge.getCanvasSnapshot === 'function'
        ? bridge.getCanvasSnapshot()
        : { nodes: bridge.nodes, edges: bridge.edges };
    return sanitizeVersionCanvasSnapshot(coerceClipboardData(candidate));
};
const readCurrentCanvasSnapshot = (getNodes: () => Node[], getEdges: () => Edge[]) => {
    try {
        return sanitizeVersionCanvasSnapshot(coerceClipboardData({ nodes: getNodes(), edges: getEdges() }));
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
    const sessionRevision = useSyncExternalStore(onAuthSessionInvalidated, getAuthSessionRevision);
    const scope = `${diagramId}:${sessionRevision}`;
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
    const versions = versionCollection.diagramId === scope ? versionCollection.items : [];

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
        const session = captureAuthSession(getAuthSessionOwner());
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
            if (!session.isCurrent() || requestId !== versionsRequestIdRef.current) return;
            const parsed = parseDiagramVersionList(data, diagramId);
            if (!parsed.ok) throw new Error('Storage returned an invalid version list.');
            setVersionCollection({ diagramId: scope, items: parsed.value });
        } catch (error) {
            if (!session.isCurrent() || requestId !== versionsRequestIdRef.current) return;
            setLoadError(true);
            logVersionHistoryLoadFailure(error);
            appMessage.error(t('designer.versionHistoryPanel.loadFailed'));
        } finally {
            if (session.isCurrent() && requestId === versionsRequestIdRef.current) setLoading(false);
        }
    }, [diagramId, scope, t]);

    useEffect(() => {
        const refresh = () => { void loadVersions(); };
        window.addEventListener('version-history-changed', refresh);
        return () => window.removeEventListener('version-history-changed', refresh);
    }, [loadVersions]);

    const saveVersion = useCallback(async (commitMessage: string): Promise<boolean> => {
        if (!diagramId) return false;
        const session = captureAuthSession(getAuthSessionOwner());

        return runExclusiveMutation(async () => {
            try {
                return await withVersionPreviewPersistence(diagramId, async assertCurrent => {
                const unifiedStorage = await loadUnifiedStorage();
                if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return false;
                const bridge = getFlowDataBridge(diagramId);
                const snapshot = readBridgeCanvasSnapshot(bridge);
                if (!snapshot) {
                    appMessage.error(t('designer.versionHistoryPanel.canvasUnavailable'));
                    return false;
                }

                assertCurrent();
                const newVersion = coerceDiagramVersion(
                    await unifiedStorage.saveVersion(diagramId, snapshot, commitMessage),
                );
                if (!newVersion || newVersion.diagramId !== diagramId) {
                    throw new Error('Storage returned an invalid saved version.');
                }
                if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return false;

                // Add new version to list without refetching all
                setVersionCollection(prev => ({
                    diagramId: scope,
                    items: prev.diagramId === scope
                        ? [newVersion, ...prev.items]
                        : [newVersion],
                }));
                const local = newVersion.storage?.location === 'local';
                if (local) appMessage.warning(t('designer.versionHistoryPanel.localSaved'));
                else appMessage.success(t('designer.versionHistoryPanel.cloudSaved'));
                return true;
                });
            } catch (error) {
                if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return false;
                logVersionHistorySaveFailure(error);
                appMessage.error(t('designer.versionHistoryPanel.saveFailed'));
                return false;
            }
        });
    }, [diagramId, scope, runExclusiveMutation, t]);

    const loadVersionData = useCallback(async (versionId: string) => {
        const session = captureAuthSession(getAuthSessionOwner());
        try {
            const unifiedStorage = await loadUnifiedStorage();
            const value = await unifiedStorage.loadVersion(diagramId, versionId);
            if (!session.isCurrent()) return null;
            if (value === null) return null;
            const version = coerceDiagramVersion(value);
            if (!version || version.diagramId !== diagramId || version.id !== versionId) {
                throw new Error('Storage returned an invalid version payload.');
            }
            return version;
        } catch (e) {
            if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return null;
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
        const session = captureAuthSession(getAuthSessionOwner());
        const requestId = ++previewRequestIdRef.current;
        const fullVersion = await loadVersionData(versionId);
        if (!session.isCurrent() || requestId !== previewRequestIdRef.current) return false;
        if (!fullVersion || !fullVersion.snapshotData) {
            appMessage.error(t('designer.versionHistoryPanel.previewMissing'));
            return false;
        }

        const snapshot = sanitizeVersionCanvasSnapshot(coerceClipboardData(fullVersion.snapshotData));
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

        if (!beginVersionPreview(diagramId, currentSnapshot)) {
            appMessage.error(t('designer.versionHistoryPanel.canvasUnavailable'));
            return false;
        }
        previewBaseRef.current ??= { diagramId, ...currentSnapshot };
        const bridge = getFlowDataBridge(diagramId);
        try {
            if (typeof bridge?.replaceCanvasSnapshot === 'function') bridge.replaceCanvasSnapshot(snapshot);
            else { setNodes(snapshot.nodes); setEdges(snapshot.edges); }
        } catch (error) {
            logVersionHistoryRestoreFailure(error);
            appMessage.error(t('designer.versionHistoryPanel.previewInvalid'));
            // Keep persistence blocked if the controlled canvas could not be replaced.
            setPreviewVersion(fullVersion);
            return false;
        }
        setPreviewVersion(fullVersion);
        return true;
    }, [diagramId, loadVersionData, t]);

    const exitPreview = useCallback(() => {
        previewRequestIdRef.current += 1;
        const previewBase = previewBaseRef.current;
        const live = endVersionPreview(diagramId);
        if (previewBase?.diagramId === diagramId) {
            const snapshot = live ?? { nodes: previewBase.nodes, edges: previewBase.edges };
            const bridge = getFlowDataBridge(diagramId);
            try {
                if (typeof bridge?.replaceCanvasSnapshot === 'function') bridge.replaceCanvasSnapshot(snapshot);
            } catch (error) {
                beginVersionPreview(diagramId, snapshot);
                logVersionHistoryRestoreFailure(error);
                appMessage.error(t('designer.versionHistoryPanel.restoreFailed'));
                return null;
            }
            previewBaseRef.current = null;
            setPreviewVersion(null);
            return snapshot;
        }
        previewBaseRef.current = null;
        setPreviewVersion(null);
        return null;
    }, [diagramId, t]);

    const restoreVersion = useCallback(async (
        versionId: string,
        setNodes: Dispatch<SetStateAction<Node[]>>,
        setEdges: Dispatch<SetStateAction<Edge[]>>
    ) => runExclusiveMutation(async () => {
        const session = captureAuthSession(getAuthSessionOwner());
        const fullVersion = previewVersion?.diagramId === diagramId && previewVersion.id === versionId
            ? previewVersion
            : await loadVersionData(versionId);
        if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return false;

        if (!fullVersion || !fullVersion.snapshotData) {
            appMessage.error(t('designer.versionHistoryPanel.restoreMissing'));
            return false;
        }

        const snapshot = sanitizeVersionCanvasSnapshot(coerceClipboardData(fullVersion.snapshotData));
        if (!snapshot) {
            appMessage.error(t('designer.versionHistoryPanel.restoreInvalid'));
            return false;
        }

        const bridge = getFlowDataBridge(diagramId);
        if (!bridge) {
            appMessage.error(t('designer.versionHistoryPanel.canvasUnavailable'));
            return false;
        }

        const backupSnapshot = readVersionPreviewLive(diagramId) ?? (previewBaseRef.current?.diagramId === diagramId
            ? sanitizeVersionCanvasSnapshot(coerceClipboardData(previewBaseRef.current))
            : readBridgeCanvasSnapshot(bridge));
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
            if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return false;
            const currentLive = readVersionPreviewLive(diagramId) ?? readBridgeCanvasSnapshot(getFlowDataBridge(diagramId));
            if (!areVersionPreviewSnapshotsEqual(backupSnapshot, currentLive)) {
                throw new Error('Live canvas changed during safety backup');
            }
            setVersionCollection(prev => ({
                diagramId: scope,
                items: prev.diagramId === scope
                    ? [backupVersion, ...prev.items]
                    : [backupVersion],
            }));
        } catch (e) {
            if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return false;
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
            discardVersionPreview(diagramId);

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
    }), [diagramId, scope, previewVersion, loadVersionData, runExclusiveMutation, t]);

    useLayoutEffect(() => {
        const abandonedLive = endVersionPreview(diagramId);
        if (abandonedLive) {
            const bridge = getFlowDataBridge(diagramId);
            try {
                if (typeof bridge?.replaceCanvasSnapshot !== 'function') throw new Error('Canvas restore unavailable');
                bridge.replaceCanvasSnapshot(abandonedLive);
            } catch (error) {
                beginVersionPreview(diagramId, abandonedLive);
                logVersionHistoryRestoreFailure(error);
            }
        }
        currentDiagramIdRef.current = diagramId;
        versionsRequestIdRef.current += 1;
        previewRequestIdRef.current += 1;
        previewBaseRef.current = null;
        mutationPromiseRef.current = null;
        return () => {
            currentDiagramIdRef.current = '';
            versionsRequestIdRef.current += 1;
            previewRequestIdRef.current += 1;
            const live = endVersionPreview(diagramId);
            const bridge = getFlowDataBridge(diagramId);
            if (live && typeof bridge?.replaceCanvasSnapshot === 'function') {
                try { bridge.replaceCanvasSnapshot(live); }
                catch (error) { beginVersionPreview(diagramId, live); logVersionHistoryRestoreFailure(error); }
            } else if (live) beginVersionPreview(diagramId, live);
        };
    }, [diagramId]);

    const retryVersion = useCallback((versionId: string) => runExclusiveMutation(async () => {
        const session = captureAuthSession(getAuthSessionOwner());
        try {
            const storage = await loadUnifiedStorage();
            if (!session.isCurrent()) return false;
            await storage.retryVersion(diagramId, versionId);
            if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return false;
            await loadVersions();
            appMessage.success(t('designer.versionHistoryPanel.cloudSaved'));
            return true;
        } catch {
            if (session.isCurrent() && currentDiagramIdRef.current === diagramId) {
                await loadVersions();
                appMessage.error(t('designer.versionHistoryPanel.retryFailed'));
            }
            return false;
        }
    }), [diagramId, loadVersions, runExclusiveMutation, t]);

    const exportVersion = useCallback(async (versionId: string) => {
        const session = captureAuthSession(getAuthSessionOwner());
        try {
            const version = await loadVersionData(versionId);
            if (!version?.snapshotData || !session.isCurrent()) return;
            const { downloadFile } = await import('@vizly/core/export');
            if (!session.isCurrent() || currentDiagramIdRef.current !== diagramId) return;
            downloadFile(JSON.stringify(version.snapshotData, null, 2), `vizly-version-${version.id}.json`, 'application/json');
        } catch {
            if (session.isCurrent() && currentDiagramIdRef.current === diagramId)
                appMessage.error(t('designer.versionHistoryPanel.exportFailed'));
        }
    }, [diagramId, loadVersionData, t]);

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
        restoreVersion,
        retryVersion,
        exportVersion
    };
}
