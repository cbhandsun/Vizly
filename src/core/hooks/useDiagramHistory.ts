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

const MAX_HISTORY = 50;
const EMPTY_HISTORY_STATE: HistoryState = { nodes: [], edges: [] };

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
    const pastRef = useRef<StoredHistoryEntry[]>([]);
    const futureRef = useRef<StoredHistoryEntry[]>([]);
    const snapshotCounter = useRef(0);

    const updateInfo = useCallback(() => {
        setHistoryInfo({
            pastCount: pastRef.current.length,
            futureCount: futureRef.current.length,
        });
        setPastEntries(pastRef.current.map(item => item.entry));
    }, []);

    const takeSnapshot = useCallback((
        nodes: Node[],
        edges: Edge[],
        label?: string,
        options?: HistorySnapshotOptions,
    ) => {
        const state = cloneHistoryState(nodes, edges);
        const previousState = pastRef.current.at(-1)?.state;
        const shouldBuildPatch = options?.dedupe !== false || options?.notify !== false;
        const patch = shouldBuildPatch
            ? compare(previousState ?? EMPTY_HISTORY_STATE, state)
            : [];
        if (options?.dedupe !== false && previousState && patch.length === 0) return;

        snapshotCounter.current += 1;
        pastRef.current.push({
            state,
            entry: {
                patch,
                changeCount: shouldBuildPatch ? patch.length : 1,
                timestamp: Date.now(),
                label: label || `操作 #${snapshotCounter.current}`,
            },
        });
        if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
        futureRef.current = [];
        if (options?.notify !== false) updateInfo();
    }, [updateInfo]);

    const undo = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        const target = pastRef.current.pop();
        if (!target) return null;

        const currentState = cloneHistoryState(currentNodes, currentEdges);
        futureRef.current.push({
            state: currentState,
            entry: {
                ...target.entry,
                patch: compare(target.state, currentState),
            },
        });
        updateInfo();
        return deepClone(target.state);
    }, [updateInfo]);

    const redo = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        const target = futureRef.current.pop();
        if (!target) return null;

        const currentState = cloneHistoryState(currentNodes, currentEdges);
        pastRef.current.push({
            state: currentState,
            entry: {
                ...target.entry,
                patch: compare(currentState, target.state),
            },
        });
        if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
        updateInfo();
        return deepClone(target.state);
    }, [updateInfo]);

    const jumpTo = useCallback((index: number, currentNodes: Node[], currentEdges: Edge[]) => {
        if (index < 0 || index >= pastRef.current.length) return null;

        const target = pastRef.current[index];
        const laterEntries = pastRef.current.slice(index + 1).reverse();
        const currentState = cloneHistoryState(currentNodes, currentEdges);
        futureRef.current = [
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
        pastRef.current = pastRef.current.slice(0, index);
        updateInfo();
        return deepClone(target.state);
    }, [updateInfo]);

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
        getPreviousState: () => pastRef.current.at(-1)?.state ?? null,
    };
};
