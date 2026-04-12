import { useState, useCallback } from 'react';
import { Node } from '@xyflow/react';

interface CopiedStyle {
    shape?: string;
    theme?: Record<string, unknown>;
    style?: Record<string, unknown>;
    icon?: string;
}

/**
 * 样式刷 — 复制一个节点的视觉样式，粘贴到其他节点
 * 支持：形状、主题色、边框样式、图标
 */
export const useStylePainter = (
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    takeSnapshot?: (nodes: Node[], edges: unknown[]) => void,
    nodesRef?: React.MutableRefObject<Node[]>,
    edgesRef?: React.MutableRefObject<unknown[]>,
) => {
    const [copiedStyle, setCopiedStyle] = useState<CopiedStyle | null>(null);

    /** 从选中节点拷贝样式 */
    const copyStyle = useCallback((node: Node) => {
        const data = node.data as Record<string, unknown>;
        setCopiedStyle({
            shape: data.shape as string | undefined,
            theme: data.theme as Record<string, unknown> | undefined,
            style: data.style as Record<string, unknown> | undefined,
            icon: typeof data.icon === 'string' ? data.icon : undefined,
        });
    }, []);

    /** 将已拷贝样式应用到目标节点 */
    const pasteStyle = useCallback((targetIds: string[]) => {
        if (!copiedStyle || targetIds.length === 0) return;

        // 快照
        if (takeSnapshot && nodesRef && edgesRef) {
            takeSnapshot(nodesRef.current, edgesRef.current as unknown[]);
        }

        setNodes(nds => nds.map(n => {
            if (!targetIds.includes(n.id)) return n;
            const data = { ...(n.data as Record<string, unknown>) };
            if (copiedStyle.shape) data.shape = copiedStyle.shape;
            if (copiedStyle.theme) data.theme = copiedStyle.theme;
            if (copiedStyle.style) data.style = { ...(data.style as Record<string, unknown> || {}), ...copiedStyle.style };
            if (copiedStyle.icon) data.icon = copiedStyle.icon;
            return { ...n, data };
        }));
    }, [copiedStyle, setNodes, takeSnapshot, nodesRef, edgesRef]);

    /** 清除已拷贝样式 */
    const clearStyle = useCallback(() => setCopiedStyle(null), []);

    return {
        copiedStyle,
        hasCopiedStyle: copiedStyle !== null,
        copyStyle,
        pasteStyle,
        clearStyle,
    };
};
