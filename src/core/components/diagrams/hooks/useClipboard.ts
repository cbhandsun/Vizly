import { useCallback, useEffect, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { fromMermaid } from '../../../utils/mermaidConverter';
import {
    coerceClipboardData,
    buildFlowchartClipboardData,
    isFlowchartClipboardTextWithinBounds,
    parseClipboardJson,
    type ClipboardData,
} from '../../../utils/flowchartClipboard';
import {
    logClipboardReadFailure,
    logClipboardStorageReadFailure,
    logClipboardSystemWriteFailure,
    logClipboardWriteFailure,
} from './clipboardLogging';
import { hasMutationLockedNode } from '../nodeLockPolicy';
import {
    advanceClipboardPasteCursor,
    buildFlowchartPasteBatch,
    createClipboardTextSignature,
    resolveFlowchartPasteOffset,
    type ClipboardPasteCursor,
} from '../../../utils/flowchartClipboardPaste';
import {
    resolveFlowchartCutFocusNodeId,
    scheduleFlowchartEmptyStateFocus,
    scheduleFlowchartSelectedNodeFocus,
} from '../flowchartDeletionFocus';

interface UseClipboardProps {
    nodesRef: React.RefObject<Node[]>;
    edgesRef: React.RefObject<Edge[]>;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[], label?: string) => void;
    getOperationScope: () => string;
    getPasteHistoryLabel?: (summary: ClipboardPasteSummary) => string;
    clipboardKey?: string;
}

export type ClipboardPasteResult = 'pasted' | 'empty' | 'unsupported' | 'scope-changed';
export type ClipboardCutResult = 'cut' | 'empty' | 'locked' | 'failed' | 'scope-changed';
export interface ClipboardPasteSummary {
    nodes: number;
    edges: number;
}

/**
 * 剪贴板操作 Hook
 * 支持：
 * 1. 内部 Copy/Cut/Paste（localStorage + 系统剪贴板双写）
 * 2. 跨应用粘贴：从系统剪贴板读取 JSON 或 Mermaid 文本
 */
export const useClipboard = ({
    nodesRef,
    edgesRef,
    selectedNodes,
    selectedEdges,
    setNodes,
    setEdges,
    takeSnapshot,
    getOperationScope,
    getPasteHistoryLabel,
    clipboardKey = 'flowchart-clipboard',
}: UseClipboardProps) => {
    const pasteCursorRef = useRef<ClipboardPasteCursor | null>(null);
    const clipboardFocusRequestRef = useRef<{ cancel: () => void } | null>(null);

    useEffect(() => () => {
        clipboardFocusRequestRef.current?.cancel();
        clipboardFocusRequestRef.current = null;
    }, []);

    const writeSelectedNodesToClipboard = useCallback(async (targetNodeIds?: string[]): Promise<boolean> => {
        const targetIds = targetNodeIds ? new Set(targetNodeIds) : null;
        const nodesToCopy = targetIds
            ? nodesRef.current.filter(node => targetIds.has(node.id))
            : selectedNodes;
        if (nodesToCopy.length === 0) return false;

        const clipboardData: ClipboardData = buildFlowchartClipboardData(
            nodesToCopy,
            edgesRef.current,
            nodesRef.current,
        );
        let serializedClipboard: string;

        try {
            serializedClipboard = JSON.stringify(clipboardData);
        } catch (error) {
            logClipboardWriteFailure(error);
            return false;
        }

        let persistedLocally = false;

        try {
            localStorage.setItem(clipboardKey, serializedClipboard);
            persistedLocally = true;
        } catch (error) {
            logClipboardWriteFailure(error);
        }

        // 本地通道成功即可立即完成；系统通道继续独立写入以支持跨应用粘贴。
        if (navigator.clipboard && window.isSecureContext) {
            let systemWrite: Promise<void>;
            try {
                systemWrite = navigator.clipboard.writeText(serializedClipboard);
            } catch (error) {
                logClipboardSystemWriteFailure(error);
                if (persistedLocally) pasteCursorRef.current = null;
                return persistedLocally;
            }
            if (persistedLocally) {
                pasteCursorRef.current = null;
                void systemWrite.catch(logClipboardSystemWriteFailure);
                return true;
            }

            try {
                await systemWrite;
                pasteCursorRef.current = null;
                return true;
            } catch (error) {
                logClipboardSystemWriteFailure(error);
            }
        }

        if (persistedLocally) pasteCursorRef.current = null;
        return persistedLocally;
    }, [clipboardKey, edgesRef, nodesRef, selectedNodes]);

    const handleCopy = useCallback((targetNodeIds?: string[]) => {
        void writeSelectedNodesToClipboard(targetNodeIds);
    }, [writeSelectedNodesToClipboard]);

    /**
     * 尝试解析文本为 ClipboardData
     * 支持：JSON 格式 或 Mermaid flowchart 语法
     */
    const parseClipboardText = useCallback((text: string): ClipboardData | null => {
        if (!text?.trim()) return null;
        if (!isFlowchartClipboardTextWithinBounds(text)) return null;

        // 1. 尝试 JSON 解析（内部格式）
        const jsonData = parseClipboardJson(text);
        if (jsonData) return jsonData;

        // 2. 尝试 Mermaid 解析
        const trimmed = text.trim();
        if (/^(flowchart|graph)\s+(TB|TD|LR|RL|BT)/i.test(trimmed) || trimmed.includes('-->') || trimmed.includes('---')) {
            try {
                const result = fromMermaid(trimmed);
                return coerceClipboardData(result);
            } catch { /* not valid Mermaid */ }
        }

        return null;
    }, []);

    const handlePaste = useCallback(async () => {
        const operationScope = getOperationScope();

        // 1. 首先尝试系统剪贴板（跨应用粘贴）
        let clipboardData: ClipboardData | null = null;
        let clipboardText: string | null = null;

        if (navigator.clipboard?.readText && window.isSecureContext) {
            try {
                const text = await navigator.clipboard.readText();
                clipboardText = text;
                clipboardData = parseClipboardText(text);
                if (operationScope !== getOperationScope()) return 'scope-changed';

                // A successful system read is authoritative. Falling back to the
                // persisted internal clipboard here can paste stale content that
                // the user did not ask for when the current clipboard is empty or
                // contains unrelated text.
                if (!text.trim()) return 'empty';
                if (!clipboardData || clipboardData.nodes.length === 0) return 'unsupported';
            } catch (error) {
                logClipboardReadFailure(error);
            }
        }

        // 2. 备选：从 localStorage 读取
        if (!clipboardData) {
            try {
                const saved = localStorage.getItem(clipboardKey);
                if (saved) {
                    clipboardText = saved;
                    clipboardData = parseClipboardText(saved);
                }
            } catch (error) {
                logClipboardStorageReadFailure(error);
            }
        }

        // 系统剪贴板读取可能等待权限或跨进程响应。期间页面或图表若已切换，
        // 旧请求不得把结果提交到新的操作上下文。
        if (operationScope !== getOperationScope()) return 'scope-changed';
        if (!clipboardData || clipboardData.nodes.length === 0 || clipboardText === null) return 'empty';

        const signature = createClipboardTextSignature(clipboardText);
        const pasteCursor = advanceClipboardPasteCursor(
            pasteCursorRef.current,
            signature,
            operationScope,
        );
        const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pasteBatch = buildFlowchartPasteBatch({
            clipboardData,
            batchId,
            offset: resolveFlowchartPasteOffset(clipboardData.nodes, pasteCursor.sequence),
        });

        const pasteSummary = {
            nodes: pasteBatch.nodes.length,
            edges: pasteBatch.edges.length,
        };
        const historyLabel = getPasteHistoryLabel?.(pasteSummary);
        if (historyLabel) {
            takeSnapshot(nodesRef.current, edgesRef.current, historyLabel);
        } else {
            takeSnapshot(nodesRef.current, edgesRef.current);
        }
        pasteCursorRef.current = pasteCursor;

        setNodes(nds => [
            ...nds.map(n => ({ ...n, selected: false })),
            ...pasteBatch.nodes,
        ]);
        setEdges(eds => [
            ...eds.map(e => ({ ...e, selected: false })),
            ...pasteBatch.edges,
        ]);
        clipboardFocusRequestRef.current?.cancel();
        clipboardFocusRequestRef.current = pasteBatch.nodes[0]
            ? scheduleFlowchartSelectedNodeFocus(pasteBatch.nodes[0].id)
            : null;
        return 'pasted';
    }, [clipboardKey, edgesRef, getOperationScope, getPasteHistoryLabel, nodesRef, parseClipboardText, setEdges, setNodes, takeSnapshot]);

    const handleCut = useCallback(async (): Promise<ClipboardCutResult> => {
        // 连线没有可独立粘贴的载荷；与右键菜单一致，禁止仅剪切连线后不可恢复地删除。
        if (selectedNodes.length === 0) return 'empty';
        if (hasMutationLockedNode(selectedNodes)) return 'locked';

        const operationScope = getOperationScope();
        const copied = await writeSelectedNodesToClipboard();
        if (operationScope !== getOperationScope()) return 'scope-changed';
        if (!copied) return 'failed';

        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;

        const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
        const selectedEdgeIds = new Set(selectedEdges.map(e => e.id));
        const currentSelection = currentNodes.filter(node => selectedNodeIds.has(node.id));
        if (currentSelection.length === 0) return 'empty';
        if (hasMutationLockedNode(currentSelection)) return 'locked';

        const currentSelectedNodeIds = new Set(currentSelection.map(node => node.id));
        const cutFocusNodeId = resolveFlowchartCutFocusNodeId(
            currentNodes,
            currentSelectedNodeIds,
        );

        takeSnapshot(currentNodes, currentEdges);

        const nextNodes = currentNodes
            .filter(node => !currentSelectedNodeIds.has(node.id))
            .map(node => ({
                ...node,
                selected: cutFocusNodeId === node.id,
            }));
        const nextEdges = currentEdges.filter(edge =>
            !selectedEdgeIds.has(edge.id) &&
            !currentSelectedNodeIds.has(edge.source) &&
            !currentSelectedNodeIds.has(edge.target)
        ).map(edge => ({ ...edge, selected: false }));

        nodesRef.current = nextNodes;
        edgesRef.current = nextEdges;
        setNodes(nextNodes);
        setEdges(nextEdges);

        clipboardFocusRequestRef.current?.cancel();
        clipboardFocusRequestRef.current = cutFocusNodeId
            ? scheduleFlowchartSelectedNodeFocus(cutFocusNodeId)
            : nextNodes.length === 0
                ? scheduleFlowchartEmptyStateFocus()
                : null;
        return 'cut';
    }, [edgesRef, getOperationScope, nodesRef, selectedEdges, selectedNodes, setEdges, setNodes, takeSnapshot, writeSelectedNodesToClipboard]);

    return { handleCopy, handlePaste, handleCut };
};
