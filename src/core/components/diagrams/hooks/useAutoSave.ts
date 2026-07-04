import { useEffect, useRef, useCallback, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { appMessage } from '../../../utils/antdStaticBridge';
import {
    AUTOSAVE_PREFIX,
    createAutoSavePayload,
    parseAutoSavePayload,
    refreshAutoSaveAccess,
    shouldCollectAutoSave,
    type AutoSavePayload,
} from '../../../utils/autoSaveStorage';
import {
    logAutoSaveAccessRefreshFailure,
    logAutoSaveBeforeUnloadSaveFailure,
    logAutoSaveGcEntryParseFailure,
    logAutoSaveGcFailure,
    logAutoSaveLoadFailure,
} from '../diagramImportLogging';

export interface AutoSaveState {
    lastSaved: number | null;
    saving: boolean;
    error: string | null;
}

export interface AutoSaveOptions {
    interval?: number; // default 60000ms (60s)
    storageKey?: string; // default 'flowchart-autosave-default'
    enabled?: boolean; // default true
    diagramId?: string; // ensures storage key matches diagram ID
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
}

/** GC: remove autosave entries not accessed in 7 days */
function gcAutosaveEntries() {
    try {
        const now = Date.now();
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(AUTOSAVE_PREFIX)) continue;
            try {
                const payload = parseAutoSavePayload(localStorage.getItem(key));
                if (shouldCollectAutoSave(payload, now)) {
                    toRemove.push(key);
                }
            } catch (error) {
                logAutoSaveGcEntryParseFailure(key, error);
            }
        }
        toRemove.forEach(key => {
            localStorage.removeItem(key);
        });
    } catch (error) {
        logAutoSaveGcFailure(error);
    }
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

    // Track content hash + timestamp + dirty flag
    const lastSavedContentRef = useRef<string>('');
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveRef = useRef<(() => Promise<void>) | null>(null);
    const MAX_RETRIES = 3;

    // Use refs so the save callback inside setInterval always sees latest nodes/edges
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);

    useEffect(() => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, [nodes, edges]);

    // GC: run once on mount to clean up stale entries older than 7 days
    useEffect(() => {
        gcAutosaveEntries();
    }, []); // only on mount

    // Core save logic with dedup check
    const save = useCallback(async () => {
        try {
            // Only write if content (nodes + edges) actually changed since last save
            const currentNodes = nodesRef.current;
            const currentEdges = edgesRef.current;
            const contentKey = JSON.stringify({ nodes: currentNodes, edges: currentEdges });
            if (contentKey === lastSavedContentRef.current) {
                return;
            }

            setSaveState(prev => ({ ...prev, saving: true, error: null }));

            const now = Date.now();
            const data = createAutoSavePayload({
                diagramId,
                nodes: currentNodes,
                edges: currentEdges,
                timestamp: now,
            });

            if (!data) {
                setSaveState(prev => ({
                    ...prev,
                    saving: false,
                    error: 'Invalid auto-save payload',
                }));
                return;
            }

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

            // Retry with exponential backoff, up to MAX_RETRIES
            if (retryCountRef.current < MAX_RETRIES) {
                retryCountRef.current++;
                const retryDelay = Math.pow(2, retryCountRef.current - 1) * 1000;
                retryTimerRef.current = setTimeout(() => {
                    saveRef.current?.();
                }, retryDelay);
            } else {
                onSaveError?.(error as Error);
                appMessage.error(`Auto-save failed: ${errorMsg}`);
            }
        }
    }, [storageKey, diagramId, onSaveSuccess, onSaveError]);

    useEffect(() => {
        saveRef.current = save;
        return () => {
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };
    }, [save]);

    // Periodic auto-save timer
    useEffect(() => {
        if (!enabled) return;

        const timer = setInterval(() => {
            save();
        }, interval);

        return () => clearInterval(timer);
    }, [enabled, interval, save]);

    // [FIX-AUTOSAVE] 页面关闭/刷新前同步保存。
    // 核心问题：React 在页面卸载时会运行 useEffect cleanup，取消所有防抖计时器。
    // 用户刷新时 -> 组件卸载 -> cleanup 删除计时器 -> save 永远不发生。
    // beforeunload 在页面卸载前触发，localStorage.setItem 是同步操作，完全可靠。
    useEffect(() => {
        const handleBeforeUnload = () => {
            // 同步保存：直接操作 localStorage，不经过 async/await
            const currentNodes = nodesRef.current;
            const currentEdges = edgesRef.current;
            if (!currentNodes || !enabled) return;
            const contentKey = JSON.stringify({ nodes: currentNodes, edges: currentEdges });
            if (contentKey === lastSavedContentRef.current) return; // 无变化无需写入
            try {
                const data = createAutoSavePayload({
                    diagramId,
                    nodes: currentNodes,
                    edges: currentEdges,
                    timestamp: Date.now(),
                });
                if (!data) return;
                localStorage.setItem(storageKey, JSON.stringify(data));
                lastSavedContentRef.current = contentKey;
            } catch (error) {
                logAutoSaveBeforeUnloadSaveFailure(storageKey, error);
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [enabled, storageKey, diagramId]);

    // Manual save trigger
    const saveNow = useCallback(() => {
        save();
    }, [save]);

    // Load saved data, also refreshes lastAccessedAt to prevent GC expiry
    const loadSaved = useCallback((): Pick<AutoSavePayload, 'diagramId' | 'nodes' | 'edges' | 'isFreshSeed' | 'timestamp'> | null => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (!saved) return null;

            const data = parseAutoSavePayload(saved);
            if (!data) {
                localStorage.removeItem(storageKey);
                return null;
            }

            // Refresh access time to prevent premature GC
            try {
                localStorage.setItem(storageKey, JSON.stringify(refreshAutoSaveAccess(data)));
            } catch (error) {
                logAutoSaveAccessRefreshFailure(storageKey, error);
            }

            return {
                diagramId: data.diagramId,
                nodes: data.nodes || [],
                edges: data.edges || [],
                isFreshSeed: !!data.isFreshSeed,
                timestamp: data.timestamp   // required for isFreshSeed TTL check
            };
        } catch (error) {
            logAutoSaveLoadFailure(error);
            return null;
        }
    }, [storageKey]);

    // Clear auto-save data for this key
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
