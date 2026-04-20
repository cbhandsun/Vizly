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
    diagramId?: string; // 用来验证存储数据的 ID 是否一致
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
}

const AUTOSAVE_PREFIX = 'flowchart-autosave-v2-';
const AUTOSAVE_GC_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/** 清理超过 7 天未访问的 autosave 条目，防止 localStorage 无限增长 */
function gcAutosaveEntries() {
    try {
        const now = Date.now();
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(AUTOSAVE_PREFIX)) continue;
            try {
                const data = JSON.parse(localStorage.getItem(key) || '{}');
                const lastAccess = data.lastAccessedAt ?? data.timestamp ?? 0;
                if (now - lastAccess > AUTOSAVE_GC_TTL_MS) {
                    toRemove.push(key);
                }
            } catch { /* ignore parse errors */ }
        }
        toRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`[AutoSave GC] Removed stale entry: ${key}`);
        });
    } catch { /* ignore */ }
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
        diagramId,
        onSaveSuccess,
        onSaveError
    } = options;

    const [saveState, setSaveState] = useState<AutoSaveState>({
        lastSaved: null,
        saving: false,
        error: null
    });

    // 脏检测用 content hash（排除 timestamp，避免永远 dirty）
    const lastSavedContentRef = useRef<string>('');
    const retryCountRef = useRef(0);
    const MAX_RETRIES = 3;

    // GC: 组件挂载时执行一次，清理 7 天未访问的旧条目
    useEffect(() => {
        gcAutosaveEntries();
    }, []); // 只在 mount 时运行一次

    // 核心保存函数
    const save = useCallback(async () => {
        try {
            // 脏检测：只比较内容（nodes + edges），不含 timestamp
            // 这样如果数据没变，就不会每 60 秒都写一次
            const contentKey = JSON.stringify({ nodes, edges });
            if (contentKey === lastSavedContentRef.current) {
                return;
            }

            setSaveState(prev => ({ ...prev, saving: true, error: null }));

            const now = Date.now();
            const data = {
                diagramId,
                nodes,
                edges,
                timestamp: now,
                lastAccessedAt: now,
                version: '1.0'
            };

            localStorage.setItem(storageKey, JSON.stringify(data));

            lastSavedContentRef.current = contentKey;
            retryCountRef.current = 0;

            setSaveState({
                lastSaved: now,
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
    }, [nodes, edges, storageKey, diagramId, onSaveSuccess, onSaveError]);

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

    // 加载保存的数据（同时更新 lastAccessedAt 刷新 GC TTL）
    const loadSaved = useCallback((): { diagramId?: string; nodes: Node[]; edges: Edge[]; isFreshSeed?: boolean; timestamp?: number } | null => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (!saved) return null;

            const data = JSON.parse(saved);

            // 刷新访问时间，防止活跃图表被 GC 清理
            try {
                localStorage.setItem(storageKey, JSON.stringify({ ...data, lastAccessedAt: Date.now() }));
            } catch { /* ignore */ }

            return {
                diagramId: data.diagramId,
                nodes: data.nodes || [],
                edges: data.edges || [],
                isFreshSeed: !!data.isFreshSeed,
                timestamp: data.timestamp   // ← required for isFreshSeed TTL check
            };
        } catch (error) {
            console.error('Failed to load auto-saved data:', error);
            return null;
        }
    }, [storageKey]);

    // 清除保存数据
    const clearSaved = useCallback(() => {
        localStorage.removeItem(storageKey);
        lastSavedContentRef.current = '';
    }, [storageKey]);

    return {
        saveState,
        saveNow,
        loadSaved,
        clearSaved
    };
};
