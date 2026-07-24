import { useState, useCallback, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import jsonpatch from 'fast-json-patch';

const { compare, applyPatch, deepClone } = jsonpatch;

export type Operation = ReturnType<typeof compare>[number];

export interface HistoryState {
    nodes: Node[];
    edges: Edge[];
}

/** 增量快照条目 */
export interface HistoryEntry {
    patch: Operation[]; // 从上一状态到当前状态的前向补丁
    timestamp: number;
    label: string;
}

const MAX_HISTORY = 50;

/**
 * 图表历史管理 Hook (Patch-Based History)
 * 占用更少内存：只保存一份初始的 Base 状态以及增量快照（Patches）
 */
export const useDiagramHistory = (_initialNodes: Node[], _initialEdges: Edge[]) => {
    const [historyInfo, setHistoryInfo] = useState({ pastCount: 0, futureCount: 0 });
    const [pastEntries, setPastEntries] = useState<HistoryEntry[]>([]);

    const baseStateRef = useRef<HistoryState | null>(null);
    const pastRef = useRef<HistoryEntry[]>([]);
    const futureRef = useRef<HistoryEntry[]>([]);
    const lastStateRef = useRef<HistoryState | null>(null);
    const snapshotCounter = useRef(0);

    const canUndo = historyInfo.pastCount > 0;
    const canRedo = historyInfo.futureCount > 0;

    const updateInfo = useCallback(() => {
        setHistoryInfo({ pastCount: pastRef.current.length, futureCount: futureRef.current.length });
        setPastEntries([...pastRef.current]);
    }, []);

    const takeSnapshot = useCallback((nodes: Node[], edges: Edge[], label?: string) => {
        snapshotCounter.current += 1;
        const currentState = deepClone({ nodes, edges });

        if (!baseStateRef.current || !lastStateRef.current) {
            baseStateRef.current = currentState;
            lastStateRef.current = currentState;
            return;
        }

        const patch = compare(lastStateRef.current, currentState);

        if (patch.length > 0) {
            pastRef.current.push({
                patch,
                timestamp: Date.now(),
                label: label || `操作 #${snapshotCounter.current}`,
            });

            if (pastRef.current.length > MAX_HISTORY) {
                const oldest = pastRef.current.shift()!;
                baseStateRef.current = applyPatch(baseStateRef.current, oldest.patch, false, false).newDocument;
            }
        }

        lastStateRef.current = currentState;
        futureRef.current = [];
        updateInfo();
    }, [updateInfo]);

    const undo = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        if (!baseStateRef.current || !lastStateRef.current) return null;

        const currentState = deepClone({ nodes: currentNodes, edges: currentEdges });
        const diffToCurrent = compare(lastStateRef.current, currentState);

        if (diffToCurrent.length > 0) {
            futureRef.current.push({
                patch: diffToCurrent,
                timestamp: Date.now(),
                label: '恢复当前状态',
            });
            const stateToRestore = deepClone(lastStateRef.current);
            updateInfo();
            return stateToRestore;
        }

        if (pastRef.current.length === 0) return null;

        const latestPast = pastRef.current.pop()!;
        futureRef.current.push(latestPast);

        let rebuild = deepClone(baseStateRef.current);
        pastRef.current.forEach(entry => {
            rebuild = applyPatch(rebuild, entry.patch, false, false).newDocument;
        });

        lastStateRef.current = rebuild;
        updateInfo();
        return deepClone(rebuild);
    }, [updateInfo]);

    const redo = useCallback((_currentNodes: Node[], _currentEdges: Edge[]) => {
        if (futureRef.current.length === 0 || !lastStateRef.current) return null;

        const nextEntry = futureRef.current.pop()!;
        const newState = applyPatch(lastStateRef.current, nextEntry.patch, false, false).newDocument;

        pastRef.current.push(nextEntry);
        lastStateRef.current = newState;
        updateInfo();
        return deepClone(newState);
    }, [updateInfo]);

    const jumpTo = useCallback((index: number, currentNodes: Node[], currentEdges: Edge[]) => {
        if (!baseStateRef.current || index < 0 || index >= pastRef.current.length) return null;

        const currentState = deepClone({ nodes: currentNodes, edges: currentEdges });
        if (lastStateRef.current) {
            const diffToCurrent = compare(lastStateRef.current, currentState);
            if (diffToCurrent.length > 0) {
                futureRef.current.push({
                    patch: diffToCurrent,
                    timestamp: Date.now(),
                    label: '跳回前状态',
                });
            }
        }

        const discarded = pastRef.current.slice(index + 1);
        const reversedDiscarded = [...discarded].reverse();
        futureRef.current = [...futureRef.current, ...reversedDiscarded];
        pastRef.current = pastRef.current.slice(0, index + 1);

        let rebuild = deepClone(baseStateRef.current);
        pastRef.current.forEach(entry => {
            rebuild = applyPatch(rebuild, entry.patch, false, false).newDocument;
        });

        lastStateRef.current = rebuild;
        updateInfo();
        return deepClone(rebuild);
    }, [updateInfo]);

    return {
        takeSnapshot,
        undo,
        redo,
        canUndo,
        canRedo,
        pastEntries,
        jumpTo,
        historyDeep: historyInfo.pastCount,
        getPreviousState: () => lastStateRef.current,
    };
};
