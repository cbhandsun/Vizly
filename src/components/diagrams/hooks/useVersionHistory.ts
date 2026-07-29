import { useState, useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { DiagramVersion } from '@/services/storage/types';
import { tryAttachDiagramSnapshot } from '@/core/utils/diagramSnapshot';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { getFlowDataBridge, getStandardFlowDataBridge } from '@/core/utils/flowDataBridge';
import { coerceClipboardData } from '@/core/utils/flowchartClipboard';
import {
    logVersionHistoryLoadFailure,
    logVersionHistoryPayloadLoadFailure,
    logVersionHistoryRestoreFailure,
    logVersionHistorySaveFailure,
} from './diagramStorageLogging';

const loadUnifiedStorage = async () => (await import('@/services/UnifiedStorageService')).unifiedStorage;

export function useVersionHistory(diagramId: string) {
    const [versions, setVersions] = useState<DiagramVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewVersion, setPreviewVersion] = useState<DiagramVersion | null>(null);
    const previewBaseRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

    const loadVersions = useCallback(async () => {
        if (!diagramId) return;
        setLoading(true);
        try {
            const unifiedStorage = await loadUnifiedStorage();
            const data = await unifiedStorage.listVersions(diagramId);
            setVersions(data);
        } catch (error) {
            logVersionHistoryLoadFailure(error);
            appMessage.error("加载历史版本失败");
        } finally {
            setLoading(false);
        }
    }, [diagramId]);

    const saveVersion = useCallback(async (commitMessage: string) => {
        if (!diagramId) return;

        try {
            const unifiedStorage = await loadUnifiedStorage();
            const bridge = getStandardFlowDataBridge(diagramId);
            if (!bridge) {
                appMessage.error('无法提取当前图表数据');
                return;
            }

            const snap = await tryAttachDiagramSnapshot(bridge, diagramId);
            const dataToSave = snap?.diagram || bridge;

            const newVersion = await unifiedStorage.saveVersion(diagramId, dataToSave, commitMessage);
            
            // Add new version to list without refetching all
            setVersions(prev => [newVersion, ...prev]);
            appMessage.success("已保存快照");
            
        } catch (error) {
            logVersionHistorySaveFailure(error);
            appMessage.error("保存版本失败");
        }
    }, [diagramId]);

    const loadVersionData = useCallback(async (versionId: string) => {
        try {
            const unifiedStorage = await loadUnifiedStorage();
            return await unifiedStorage.loadVersion(diagramId, versionId);
        } catch (e) {
            logVersionHistoryPayloadLoadFailure(e);
            appMessage.error("加载快照详细数据失败");
            return null;
        }
    }, [diagramId]);

    const enterPreview = useCallback(async (
        versionId: string,
        setNodes: Dispatch<SetStateAction<Node[]>>,
        setEdges: Dispatch<SetStateAction<Edge[]>>,
        currentNodes: Node[],
        currentEdges: Edge[]
    ) => {
        const fullVersion = await loadVersionData(versionId);
        if (!fullVersion || !fullVersion.snapshotData) {
            appMessage.error("无法预览：快照数据缺失");
            return false;
        }

        const snapshot = coerceClipboardData(fullVersion.snapshotData);
        if (!snapshot) {
            appMessage.error("无法预览：快照结构无效");
            return false;
        }

        previewBaseRef.current ??= { nodes: currentNodes, edges: currentEdges };
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        setPreviewVersion(fullVersion);
        return true;
    }, [loadVersionData]);

    const exitPreview = useCallback(() => {
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
            appMessage.error("无法恢复：快照数据缺失");
            return false;
        }

        try {
            // Restore functionality using the active bridge
            const bridge = getFlowDataBridge(diagramId);
            if (bridge) {
                const snapshot = coerceClipboardData(fullVersion.snapshotData);
                if (!snapshot) {
                    appMessage.error("无法恢复：快照结构无效");
                    return false;
                }
                // If it exposes actions directly
                if (typeof bridge.replaceCanvasSnapshot === 'function') {
                    bridge.replaceCanvasSnapshot(snapshot);
                } else {
                    setNodes(snapshot.nodes);
                    setEdges(snapshot.edges);
                }
                
                appMessage.success(`已恢复至快照: ${fullVersion.message || fullVersion.id.substring(0, 8)}`);
                previewBaseRef.current = null;
                setPreviewVersion(null);
                return true;
            }
        } catch (e) {
            logVersionHistoryRestoreFailure(e);
            appMessage.error("恢复出错");
        }
        return false;
    }, [diagramId, previewVersion, loadVersionData]);

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
        previewVersion,
        loadVersions,
        saveVersion,
        enterPreview,
        exitPreview,
        restoreVersion
    };
}
