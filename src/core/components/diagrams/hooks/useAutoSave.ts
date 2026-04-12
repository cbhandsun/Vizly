import { useEffect, useRef, useCallback, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { appMessage as message } from '../../../utils/antdStaticBridge';

export interface AutoSaveState {
    lastSaved: number | null;
    saving: boolean;
    error: string | null;
}

export interface AutoSaveOptions {
    interval?: number; // 默认 60000ms (60秒)
    storageKey?: string; // 默认 'flowchart-autosave-default'
    enabled?: boolean; // 默认 true
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
}

export const useAutoSave = (
    nodes: Node[],
    edges: Edge[],
    options: AutoSaveOptions = {}
) => {
    const {
        interval = 60000,
        storageKey = 'flowchart-autosave-default',
        enabled = true,
        onSaveSuccess,
        onSaveError
    } = options;

    const [saveState, setSaveState] = useState<AutoSaveState>({
        lastSaved: null,
        saving: false,
        error: null
    });

    const lastSavedDataRef = useRef<string>('');
    const retryCountRef = useRef(0);
    const MAX_RETRIES = 3;

    // 核心保存函数
    const save = useCallback(async () => {
        try {
            const data = {
                nodes,
                edges,
                timestamp: Date.now(),
                version: '1.0'
            };

            const dataString = JSON.stringify(data);

            // 脏数据检测：无更改则跳过
            if (dataString === lastSavedDataRef.current) {
                return;
            }

            setSaveState(prev => ({ ...prev, saving: true, error: null }));

            // 保存到 localStorage
            localStorage.setItem(storageKey, dataString);

            lastSavedDataRef.current = dataString;
            retryCountRef.current = 0;

            setSaveState({
                lastSaved: Date.now(),
                saving: false,
                error: null
            });

            onSaveSuccess?.();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            setSaveState(prev => ({ ...prev, saving: false, error: errorMsg }));

            // 重试逻辑（最多3次，指数退避）
            if (retryCountRef.current < MAX_RETRIES) {
                retryCountRef.current++;
                const retryDelay = Math.pow(2, retryCountRef.current - 1) * 1000;
                setTimeout(() => save(), retryDelay);
            } else {
                onSaveError?.(error as Error);
                message.error(`自动保存失败: ${errorMsg}`);
            }
        }
    }, [nodes, edges, storageKey, onSaveSuccess, onSaveError]);

    // 定时自动保存
    useEffect(() => {
        if (!enabled) return;

        const timer = setInterval(() => {
            save();
        }, interval);

        return () => clearInterval(timer);
    }, [enabled, interval, save]);

    // 手动保存
    const saveNow = useCallback(() => {
        save();
    }, [save]);

    // 加载保存的数据
    const loadSaved = useCallback((): { nodes: Node[]; edges: Edge[] } | null => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (!saved) return null;

            const data = JSON.parse(saved);
            return {
                nodes: data.nodes || [],
                edges: data.edges || []
            };
        } catch (error) {
            console.error('Failed to load auto-saved data:', error);
            return null;
        }
    }, [storageKey]);

    // 清除保存数据
    const clearSaved = useCallback(() => {
        localStorage.removeItem(storageKey);
        lastSavedDataRef.current = '';
    }, [storageKey]);

    return {
        saveState,
        saveNow,
        loadSaved,
        clearSaved
    };
};
