import { useCallback, useState } from 'react';
import { message } from 'antd';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { tryAttachDiagramSnapshot } from '@/core';
import { invalidateRemoteDiagramPreview } from '@/core';
import type { StandardDiagramData } from '@/core';

/**
 * 轻量云保存 Hook — 读取 __flowDataBridge 数据并上传到活动云提供商
 */
export function useCloudSave(diagramId: string, diagramName?: string) {
    const [shareDialogOpen, setShareDialogOpen] = useState(false);

    const saveToCloud = useCallback(async () => {
        if (!unifiedStorage.isConfigured()) {
            message.error('云存储未配置，请先在设置中配置');
            return;
        }

        const hide = message.loading('正在保存到云端...', 0);
        try {
            // 从桥接数据中读取（FlowchartDesigner 的 useEffect 会持续更新此数据）
            const bridge = (window as any).__flowDataBridge?.[diagramId];
            if (!bridge || !bridge.nodes || bridge.nodes.length === 0) {
                message.error('未找到图表数据');
                return;
            }

            const diagram: StandardDiagramData = {
                ...bridge,
                id: bridge.id || diagramId,
                name: diagramName || bridge.name || diagramId,
                metadata: {
                    ...(bridge.metadata || {}),
                    title: diagramName || bridge.metadata?.title || diagramId,
                },
            };

            const snap = await tryAttachDiagramSnapshot(diagram, diagramId);
            const provider = unifiedStorage.activeProvider;

            const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(diagram.id || '');
            const cloudId = bridge.metadata?.cloud?.id;
            const finalId = cloudId || (isValidUuid ? diagram.id : crypto.randomUUID());
            const finalTitle = diagramName || diagram.metadata?.title || diagram.name;

            await provider.saveDiagram({
                id: finalId!,
                title: finalTitle!,
                content: { ...snap.diagram, id: finalId, name: finalTitle } as any,
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

            message.success('已保存到云端');
        } catch (error) {
            console.error('Cloud save failed:', error);
            message.error('保存到云端失败');
        } finally {
            hide();
        }
    }, [diagramId, diagramName]);

    const openShareDialog = useCallback(() => {
        setShareDialogOpen(true);
    }, []);

    const closeShareDialog = useCallback(() => {
        setShareDialogOpen(false);
    }, []);

    /** 确保已保存再分享，返回云端 ID 或 false */
    const ensureSaved = useCallback(async (): Promise<string | false> => {
        try {
            await saveToCloud();
            const bridge = (window as any).__flowDataBridge?.[diagramId];
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
    };
}
