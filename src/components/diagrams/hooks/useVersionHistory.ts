import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { DiagramVersion } from '@/services/storage/types';
import { tryAttachDiagramSnapshot } from '@/core';

export function useVersionHistory(diagramId: string) {
    const [versions, setVersions] = useState<DiagramVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewVersion, setPreviewVersion] = useState<DiagramVersion | null>(null);

    const loadVersions = useCallback(async () => {
        if (!diagramId) return;
        setLoading(true);
        try {
            const data = await unifiedStorage.listVersions(diagramId);
            setVersions(data);
        } catch (error) {
            console.error("Failed to load versions:", error);
            message.error("加载历史版本失败");
        } finally {
            setLoading(false);
        }
    }, [diagramId]);

    const saveVersion = useCallback(async (commitMessage: string) => {
        if (!diagramId) return;
        
        try {
            const bridge = (window as any).__flowDataBridge?.[diagramId];
            if (!bridge) {
                message.error('无法提取当前图表数据');
                return;
            }

            const snap = await tryAttachDiagramSnapshot(bridge, diagramId);
            const dataToSave = snap?.diagram || bridge;

            const newVersion = await unifiedStorage.saveVersion(diagramId, dataToSave, commitMessage);
            
            // Add new version to list without refetching all
            setVersions(prev => [newVersion, ...prev]);
            message.success("已保存快照");
            
        } catch (error) {
            console.error("Failed to save version:", error);
            message.error("保存版本失败");
        }
    }, [diagramId]);

    const loadVersionData = useCallback(async (versionId: string) => {
        try {
            return await unifiedStorage.loadVersion(diagramId, versionId);
        } catch (e) {
            console.error("Failed to load version payload:", e);
            message.error("加载快照详细数据失败");
            return null;
        }
    }, [diagramId]);

    const enterPreview = useCallback(async (versionId: string) => {
        const fullVersion = await loadVersionData(versionId);
        if (fullVersion) {
            setPreviewVersion(fullVersion);
        }
    }, [loadVersionData]);

    const exitPreview = useCallback(() => {
        setPreviewVersion(null);
    }, []);

    const restoreVersion = useCallback(async (versionId: string, setNodes: any, setEdges: any) => {
        const fullVersion = previewVersion?.id === versionId 
            ? previewVersion 
            : await loadVersionData(versionId);

        if (!fullVersion || !fullVersion.snapshotData) {
            message.error("无法恢复：快照数据缺失");
            return false;
        }

        try {
            // Restore functionality using the active bridge
            const bridge = (window as any).__flowDataBridge?.[diagramId];
            if (bridge) {
                // If it exposes actions directly
                setNodes(fullVersion.snapshotData.nodes || []);
                setEdges(fullVersion.snapshotData.edges || []);
                
                // Keep the bridge intact, overwrite internal values if necessary!
                message.success(`已恢复至快照: ${fullVersion.message || fullVersion.id.substring(0, 8)}`);
                setPreviewVersion(null);
                return true;
            }
        } catch (e) {
            console.error(e);
            message.error("恢复出错");
        }
        return false;
    }, [diagramId, previewVersion, loadVersionData]);

    // Initial load
    useEffect(() => {
        loadVersions();
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
