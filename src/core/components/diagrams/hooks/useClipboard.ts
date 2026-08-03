import { useCallback } from 'react';
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

interface UseClipboardProps {
    nodesRef: React.RefObject<Node[]>;
    edgesRef: React.RefObject<Edge[]>;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    clipboardKey?: string;
}

const PASTE_OFFSET = 20;

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
    clipboardKey = 'flowchart-clipboard',
}: UseClipboardProps) => {

    const handleCopy = useCallback(() => {
        if (selectedNodes.length === 0) return;

        const clipboardData: ClipboardData = buildFlowchartClipboardData(selectedNodes, edgesRef.current);
        let serializedClipboard: string;

        try {
            serializedClipboard = JSON.stringify(clipboardData);
        } catch (error) {
            logClipboardWriteFailure(error);
            return;
        }

        try {
            localStorage.setItem(clipboardKey, serializedClipboard);
        } catch (error) {
            logClipboardWriteFailure(error);
        }

        // 两个剪贴板通道相互独立：本地存储失败时仍应保留跨应用复制能力。
        if (navigator.clipboard && window.isSecureContext) {
            void navigator.clipboard.writeText(serializedClipboard)
                .catch((error) => {
                    logClipboardSystemWriteFailure(error);
                });
        }
    }, [clipboardKey, edgesRef, selectedNodes]);

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
        // 1. 首先尝试系统剪贴板（跨应用粘贴）
        let clipboardData: ClipboardData | null = null;

        if (navigator.clipboard && window.isSecureContext) {
            try {
                const text = await navigator.clipboard.readText();
                clipboardData = parseClipboardText(text);
            } catch (error) {
                logClipboardReadFailure(error);
            }
        }

        // 2. 备选：从 localStorage 读取
        if (!clipboardData) {
            try {
                const saved = localStorage.getItem(clipboardKey);
                if (saved) clipboardData = parseClipboardText(saved);
            } catch (error) {
                logClipboardStorageReadFailure(error);
            }
        }

        if (!clipboardData || clipboardData.nodes.length === 0) return false;

        takeSnapshot(nodesRef.current, edgesRef.current);

        // 生成新 ID
        const idMap = new Map<string, string>();
        clipboardData.nodes.forEach(node => {
            idMap.set(node.id, `${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        });

        const newNodes = clipboardData.nodes.map(node => ({
            ...node,
            id: idMap.get(node.id)!,
            position: { x: node.position.x + PASTE_OFFSET, y: node.position.y + PASTE_OFFSET },
            selected: true,
            data: { ...node.data },
        }));

        const newEdges = clipboardData.edges.map(edge => ({
            ...edge,
            id: `${edge.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
            selected: true,
            data: edge.data ? { ...edge.data } : undefined,
        }));

        setNodes(nds => [
            ...nds.map(n => ({ ...n, selected: false })),
            ...newNodes,
        ]);
        setEdges(eds => [
            ...eds.map(e => ({ ...e, selected: false })),
            ...newEdges,
        ]);
        return true;
    }, [clipboardKey, edgesRef, nodesRef, parseClipboardText, setEdges, setNodes, takeSnapshot]);

    const handleCut = useCallback(() => {
        // 连线没有可独立粘贴的载荷；与右键菜单一致，禁止仅剪切连线后不可恢复地删除。
        if (selectedNodes.length === 0) return;
        if (hasMutationLockedNode(selectedNodes)) return;

        handleCopy();
        takeSnapshot(nodesRef.current, edgesRef.current);

        const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
        const selectedEdgeIds = new Set(selectedEdges.map(e => e.id));

        setNodes(nds => nds.filter(n => !selectedNodeIds.has(n.id)));
        setEdges(eds => eds.filter(e =>
            !selectedEdgeIds.has(e.id) &&
            !selectedNodeIds.has(e.source) &&
            !selectedNodeIds.has(e.target)
        ));
    }, [edgesRef, handleCopy, nodesRef, selectedEdges, selectedNodes, setEdges, setNodes, takeSnapshot]);

    return { handleCopy, handlePaste, handleCut };
};
