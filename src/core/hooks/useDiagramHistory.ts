import { useCallback, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import jsonpatch from 'fast-json-patch';

const { compare, deepClone } = jsonpatch;

export type Operation = ReturnType<typeof compare>[number];

export interface HistoryState {
    nodes: Node[];
    edges: Edge[];
}

/** Snapshot metadata shown by the history panel. */
export interface HistoryEntry {
    patch: Operation[];
    changeCount?: number;
    timestamp: number;
    label: string;
}

export interface HistorySnapshotOptions {
    /**
     * Heavy interactions can record the snapshot first and refresh history UI
     * after the gesture completes, keeping the first pointer-move responsive.
     */
    notify?: boolean;
    /** Skip full-state comparison for gestures that already crossed a drag threshold. */
    dedupe?: boolean;
}

interface StoredHistoryEntry {
    state: HistoryState;
    entry: HistoryEntry;
}

interface HistoryScope {
    past: StoredHistoryEntry[];
    future: StoredHistoryEntry[];
    snapshotCounter: number;
}

const MAX_HISTORY = 50;
const EMPTY_HISTORY_STATE: HistoryState = { nodes: [], edges: [] };
const DEFAULT_HISTORY_SCOPE = 'default';

const createHistoryScope = (): HistoryScope => ({
    past: [],
    future: [],
    snapshotCounter: 0,
});

const cloneHistoryState = (nodes: Node[], edges: Edge[]): HistoryState => (
    deepClone({ nodes, edges })
);

/**
 * Diagram history stores pre-operation snapshots.
 *
 * Callers already invoke `takeSnapshot` immediately before an edit. Treating
 * that snapshot as undoable at once keeps the first drag/add/group operation
 * reversible without requiring a second edit to "commit" the first one.
 */
export const useDiagramHistory = (_initialNodes: Node[], _initialEdges: Edge[]) => {
    const [historyInfo, setHistoryInfo] = useState({ pastCount: 0, futureCount: 0 });
    const [pastEntries, setPastEntries] = useState<HistoryEntry[]>([]);
    const scopesRef = useRef<Map<string, HistoryScope>>(new Map([
        [DEFAULT_HISTORY_SCOPE, createHistoryScope()],
    ]));
    const activeScopeKeyRef = useRef(DEFAULT_HISTORY_SCOPE);

    const getActiveScope = useCallback((): HistoryScope => {
        const activeKey = activeScopeKeyRef.current;
        const existingScope = scopesRef.current.get(activeKey);
        if (existingScope) return existingScope;

        const scope = createHistoryScope();
        scopesRef.current.set(activeKey, scope);
        return scope;
    }, []);

    const updateInfo = useCallback(() => {
        const scope = getActiveScope();
        setHistoryInfo({
            pastCount: scope.past.length,
            futureCount: scope.future.length,
        });
        setPastEntries(scope.past.map(item => item.entry));
    }, [getActiveScope]);

    const switchScope = useCallback((scopeKey: string) => {
        if (!scopeKey || scopeKey === activeScopeKeyRef.current) return;
        activeScopeKeyRef.current = scopeKey;
        if (!scopesRef.current.has(scopeKey)) {
            scopesRef.current.set(scopeKey, createHistoryScope());
        }
        updateInfo();
    }, [updateInfo]);

    const removeScopes = useCallback((scopeKeys: readonly string[]) => {
        const keys = new Set(scopeKeys.filter(Boolean));
        if (keys.size === 0) return;

        for (const scopeKey of keys) {
            scopesRef.current.delete(scopeKey);
        }
        if (keys.has(activeScopeKeyRef.current)) {
            activeScopeKeyRef.current = DEFAULT_HISTORY_SCOPE;
        }
        updateInfo();
    }, [updateInfo]);

    const removeScope = useCallback((scopeKey: string) => {
        removeScopes([scopeKey]);
    }, [removeScopes]);

    const takeSnapshot = useCallback((
        nodes: Node[],
        edges: Edge[],
        label?: string,
        options?: HistorySnapshotOptions,
    ) => {
        const scope = getActiveScope();
        const state = cloneHistoryState(nodes, edges);
        const previousState = scope.past.at(-1)?.state;
        const shouldBuildPatch = options?.dedupe !== false || options?.notify !== false;
        const patch = shouldBuildPatch
            ? compare(previousState ?? EMPTY_HISTORY_STATE, state)
            : [];
        if (options?.dedupe !== false && previousState && patch.length === 0) {
            const previousEntry = scope.past.at(-1);
            if (label && previousEntry) {
                previousEntry.entry = {
                    ...previousEntry.entry,
                    timestamp: Date.now(),
                    label,
                };
            }
            // A silent gesture snapshot may already hold this exact state. A
            // later named operation must still surface that snapshot in the UI,
            // and starting a new branch invalidates any stale redo states.
            scope.future = [];
            if (options?.notify !== false) updateInfo();
            return;
        }

        scope.snapshotCounter += 1;
        scope.past.push({
            state,
            entry: {
                patch,
                changeCount: shouldBuildPatch ? patch.length : 1,
                timestamp: Date.now(),
                label: label || `操作 #${scope.snapshotCounter}`,
            },
        });
        if (scope.past.length > MAX_HISTORY) scope.past.shift();
        scope.future = [];
        if (options?.notify !== false) updateInfo();
    }, [getActiveScope, updateInfo]);

    const undo = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        const scope = getActiveScope();
        const target = scope.past.pop();
        if (!target) return null;

        const currentState = cloneHistoryState(currentNodes, currentEdges);
        scope.future.push({
            state: currentState,
            entry: {
                ...target.entry,
                patch: compare(target.state, currentState),
            },
        });
        updateInfo();
        return deepClone(target.state);
    }, [getActiveScope, updateInfo]);

    const redo = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        const scope = getActiveScope();
        const target = scope.future.pop();
        if (!target) return null;

        const currentState = cloneHistoryState(currentNodes, currentEdges);
        scope.past.push({
            state: currentState,
            entry: {
                ...target.entry,
                patch: compare(currentState, target.state),
            },
        });
        if (scope.past.length > MAX_HISTORY) scope.past.shift();
        updateInfo();
        return deepClone(target.state);
    }, [getActiveScope, updateInfo]);

    const jumpTo = useCallback((index: number, currentNodes: Node[], currentEdges: Edge[]) => {
        const scope = getActiveScope();
        if (index < 0 || index >= scope.past.length) return null;

        const target = scope.past[index];
        const laterEntries = scope.past.slice(index + 1).reverse();
        const currentState = cloneHistoryState(currentNodes, currentEdges);
        scope.future = [
            {
                state: currentState,
                entry: {
                    patch: compare(target.state, currentState),
                    timestamp: Date.now(),
                    label: '跳回前状态',
                },
            },
            ...laterEntries,
        ];
        scope.past = scope.past.slice(0, index);
        updateInfo();
        return deepClone(target.state);
    }, [getActiveScope, updateInfo]);

    return {
        takeSnapshot,
        notifyHistoryChanged: updateInfo,
        undo,
        redo,
        canUndo: historyInfo.pastCount > 0,
        canRedo: historyInfo.futureCount > 0,
        pastEntries,
        jumpTo,
        historyDeep: historyInfo.pastCount,
        getPreviousState: () => getActiveScope().past.at(-1)?.state ?? null,
        switchScope,
        removeScope,
        removeScopes,
    };
};
