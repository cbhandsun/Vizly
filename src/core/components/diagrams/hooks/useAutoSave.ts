import { useEffect, useRef, useCallback, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { appMessage as message } from '../../../utils/antdStaticBridge';

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

const AUTOSAVE_PREFIX = 'flowchart-autosave-v2-';
const AUTOSAVE_GC_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** GC: remove autosave entries not accessed in 7 days */
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

    // Track content hash + timestamp + dirty flag
    const lastSavedContentRef = useRef<string>('');
    const retryCountRef = useRef(0);
    const MAX_RETRIES = 3;

    // Use refs so the save callback inside setInterval always sees latest nodes/edges
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    nodesRef.current = nodes;
    edgesRef.current = edges;

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
            const data = {
                diagramId,
                nodes: currentNodes,
                edges: currentEdges,
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

            // Retry with exponential backoff, up to MAX_RETRIES
            if (retryCountRef.current < MAX_RETRIES) {
                retryCountRef.current++;
                const retryDelay = Math.pow(2, retryCountRef.current - 1) * 1000;
                setTimeout(() => save(), retryDelay);
            } else {
                onSaveError?.(error as Error);
                message.error(`Auto-save failed: ${errorMsg}`);
            }
        }
    }, [storageKey, diagramId, onSaveSuccess, onSaveError]);

    // Periodic auto-save timer
    useEffect(() => {
        if (!enabled) return;

        const timer = setInterval(() => {
            save();
        }, interval);

        return () => clearInterval(timer);
    }, [enabled, interval, save]);

    // Manual save trigger
    const saveNow = useCallback(() => {
        save();
    }, [save]);

    // Load saved data, also refreshes lastAccessedAt to prevent GC expiry
    const loadSaved = useCallback((): { diagramId?: string; nodes: Node[]; edges: Edge[]; isFreshSeed?: boolean; timestamp?: number } | null => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (!saved) return null;

            const data = JSON.parse(saved);

            // Refresh access time to prevent premature GC
            try {
                localStorage.setItem(storageKey, JSON.stringify({ ...data, lastAccessedAt: Date.now() }));
            } catch { /* ignore */ }

            return {
                diagramId: data.diagramId,
                nodes: data.nodes || [],
                edges: data.edges || [],
                isFreshSeed: !!data.isFreshSeed,
                timestamp: data.timestamp   // required for isFreshSeed TTL check
            };
        } catch (error) {
            console.error('Failed to load auto-saved data:', error);
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
