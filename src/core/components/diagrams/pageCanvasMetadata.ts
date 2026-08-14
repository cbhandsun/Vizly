import type { Edge, Node } from '@xyflow/react';

const PAGE_CONTENT_METRICS_VERSION = 1;
const MAX_PAGE_CONTENT_ITEM_COUNT = 1_000_000;

export const PRESERVE_PAGE_COPY_NODE_ID = 'preserve' as const;

export interface PageContentMetrics {
    nodeCount: number;
    edgeCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseContentCount = (value: unknown): number | null => {
    if (
        typeof value !== 'number'
        || !Number.isSafeInteger(value)
        || value < 0
        || value > MAX_PAGE_CONTENT_ITEM_COUNT
    ) {
        return null;
    }
    return value;
};

export const shouldPreservePageCopyNodeId = (data: unknown): boolean => (
    isRecord(data) && data.pageCopyIdPolicy === PRESERVE_PAGE_COPY_NODE_ID
);

export const parsePageContentMetrics = (value: unknown): PageContentMetrics | null => {
    if (!isRecord(value) || value.version !== PAGE_CONTENT_METRICS_VERSION) return null;
    const nodeCount = parseContentCount(value.nodeCount);
    const edgeCount = parseContentCount(value.edgeCount);
    if (nodeCount === null || edgeCount === null) return null;
    return { nodeCount, edgeCount };
};

export const createPageContentMetrics = (
    nodeCount: number,
    edgeCount: number,
): Record<string, number> => ({
    version: PAGE_CONTENT_METRICS_VERSION,
    nodeCount,
    edgeCount,
});

const resolveFallbackCount = (candidate: unknown, fallback: number): number => (
    parseContentCount(candidate) ?? fallback
);

export const resolvePageContentMetrics = (
    nodes: readonly Node[],
    edges: readonly Edge[],
    liveNodeCount?: number,
    liveEdgeCount?: number,
): PageContentMetrics => {
    for (const node of nodes) {
        if (!isRecord(node.data)) continue;
        const metrics = parsePageContentMetrics(node.data.pageContentMetrics);
        if (metrics) return metrics;
    }

    return {
        nodeCount: resolveFallbackCount(liveNodeCount, nodes.length),
        edgeCount: resolveFallbackCount(liveEdgeCount, edges.length),
    };
};
