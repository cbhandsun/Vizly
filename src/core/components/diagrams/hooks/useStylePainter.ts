import { useState, useCallback } from 'react';
import type { CSSProperties, Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { hasMutationLockedNode, resolveTargetNodes } from '../nodeLockPolicy';

interface CopiedStyle {
    shape?: string;
    theme?: Record<string, unknown>;
    style?: CSSProperties;
    icon?: string;
    nodeStyle: CSSProperties;
}

interface UseStylePainterOptions {
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setSelectedNodes: Dispatch<SetStateAction<Node[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    nodesRef: MutableRefObject<Node[]>;
    edgesRef: MutableRefObject<Edge[]>;
}

const NODE_VISUAL_STYLE_KEYS = [
    'background', 'backgroundColor', 'border', 'borderColor', 'borderRadius',
    'borderStyle', 'borderWidth', 'boxShadow', 'color', 'fontFamily', 'fontSize',
    'fontStyle', 'fontWeight', 'opacity', 'stroke', 'strokeDasharray', 'strokeWidth',
    'textAlign',
] as const satisfies readonly (keyof CSSProperties)[];

const copyRecord = (value: unknown): Record<string, unknown> | undefined => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? { ...value as Record<string, unknown> }
        : undefined
);

const pickNodeVisualStyle = (style: CSSProperties | undefined): CSSProperties => {
    if (!style) return {};
    return NODE_VISUAL_STYLE_KEYS.reduce<CSSProperties>((result, key) => {
        const value = style[key];
        if (value !== undefined) {
            Object.assign(result, { [key]: value });
        }
        return result;
    }, {});
};

const recordsEqual = (
    left: Readonly<Record<string, unknown>> | undefined,
    right: Readonly<Record<string, unknown>> | undefined,
): boolean => {
    const leftEntries = Object.entries(left ?? {});
    const rightEntries = Object.entries(right ?? {});
    return leftEntries.length === rightEntries.length
        && leftEntries.every(([key, value]) => Object.is(right?.[key], value));
};

export const copyNodeVisualStyle = (node: Node): CopiedStyle => {
    const data = node.data as Record<string, unknown>;
    const dataStyle = copyRecord(data.style) as CSSProperties | undefined;
    return {
        shape: typeof data.shape === 'string' ? data.shape : undefined,
        theme: copyRecord(data.theme),
        style: pickNodeVisualStyle(dataStyle),
        icon: typeof data.icon === 'string' ? data.icon : undefined,
        nodeStyle: pickNodeVisualStyle(node.style),
    };
};

export const applyCopiedStyleToNodes = (
    nodes: readonly Node[],
    targetIds: ReadonlySet<string>,
    copiedStyle: CopiedStyle,
): { nodes: Node[]; changed: boolean } => {
    let changed = false;
    const nextNodes = nodes.map(node => {
        if (!targetIds.has(node.id)) return node;

        const currentData = node.data as Record<string, unknown>;
        const nextDataStyle = copiedStyle.style
            ? { ...(copyRecord(currentData.style) ?? {}), ...copiedStyle.style }
            : copyRecord(currentData.style);
        const nextData: Record<string, unknown> = { ...currentData };
        if (copiedStyle.shape !== undefined) nextData.shape = copiedStyle.shape;
        if (copiedStyle.theme !== undefined) nextData.theme = { ...copiedStyle.theme };
        if (nextDataStyle !== undefined) nextData.style = nextDataStyle;
        if (copiedStyle.icon !== undefined) nextData.icon = copiedStyle.icon;
        const nextNodeStyle = { ...(node.style ?? {}), ...copiedStyle.nodeStyle };

        const nodeChanged = (
            nextData.shape !== currentData.shape
            || nextData.icon !== currentData.icon
            || !recordsEqual(copyRecord(currentData.theme), copyRecord(nextData.theme))
            || !recordsEqual(copyRecord(currentData.style), copyRecord(nextData.style))
            || !recordsEqual(node.style as Record<string, unknown> | undefined, nextNodeStyle as Record<string, unknown>)
        );
        if (!nodeChanged) return node;

        changed = true;
        return { ...node, data: nextData, style: nextNodeStyle };
    });

    return { nodes: nextNodes, changed };
};

/**
 * 样式刷 — 复制一个节点的视觉样式，粘贴到其他节点
 * 支持：形状、主题色、边框样式、图标
 */
export const useStylePainter = (
    { setNodes, setSelectedNodes, takeSnapshot, nodesRef, edgesRef }: UseStylePainterOptions,
) => {
    const [copiedStyle, setCopiedStyle] = useState<CopiedStyle | null>(null);

    /** 从选中节点拷贝样式 */
    const copyStyle = useCallback((node: Node) => {
        setCopiedStyle(copyNodeVisualStyle(node));
    }, []);

    /** 将已拷贝样式应用到目标节点 */
    const pasteStyle = useCallback((targetIds: string[]) => {
        if (!copiedStyle || targetIds.length === 0) return;

        const currentNodes = nodesRef.current;
        const targetIdSet = new Set(targetIds);
        const targetNodes = resolveTargetNodes(currentNodes, targetIdSet);
        if (targetNodes.length === 0 || hasMutationLockedNode(targetNodes)) return;

        const result = applyCopiedStyleToNodes(currentNodes, targetIdSet, copiedStyle);
        if (!result.changed) return;

        takeSnapshot(currentNodes, edgesRef.current);
        nodesRef.current = result.nodes;
        setNodes(result.nodes);
        const nodeById = new Map(result.nodes.map(node => [node.id, node]));
        setSelectedNodes(current => current.map(node => nodeById.get(node.id) ?? node));
    }, [copiedStyle, edgesRef, nodesRef, setNodes, setSelectedNodes, takeSnapshot]);

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
