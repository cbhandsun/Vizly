import type { Edge, Node } from '@xyflow/react';

import { coerceClipboardData } from '../../utils/flowchartClipboard';

import type { DiagramPage } from './hooks/useMultiPage';

const MULTI_PAGE_VERSION = 1;
const MAX_PAGES = 50;
const MAX_PAGE_ID_LENGTH = 120;
const MAX_PAGE_NAME_LENGTH = 80;

export interface PersistedMultiPageState {
    version: typeof MULTI_PAGE_VERSION;
    activePageId: string;
    pages: DiagramPage[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const coerceBoundedText = (value: unknown, maxLength: number): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) return null;
    return normalized;
};

const coercePage = (value: unknown): DiagramPage | null => {
    if (!isRecord(value)) return null;
    const id = coerceBoundedText(value.id, MAX_PAGE_ID_LENGTH);
    const name = coerceBoundedText(value.name, MAX_PAGE_NAME_LENGTH);
    if (!id || !name || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;

    if (value.nodes.length === 0) {
        return value.edges.length === 0 ? { id, name, nodes: [], edges: [] } : null;
    }

    const canvas = coerceClipboardData({ nodes: value.nodes, edges: value.edges });
    return canvas ? { id, name, nodes: canvas.nodes, edges: canvas.edges } : null;
};

export const parseMultiPageMetadata = (metadata: unknown): PersistedMultiPageState | null => {
    if (!isRecord(metadata) || !isRecord(metadata.multiPage)) return null;
    const candidate = metadata.multiPage;
    if (candidate.version !== MULTI_PAGE_VERSION || !Array.isArray(candidate.pages)) return null;
    if (candidate.pages.length === 0 || candidate.pages.length > MAX_PAGES) return null;

    const pages: DiagramPage[] = [];
    const pageIds = new Set<string>();
    for (const rawPage of candidate.pages) {
        const page = coercePage(rawPage);
        if (!page || pageIds.has(page.id)) return null;
        pageIds.add(page.id);
        pages.push(page);
    }

    const activePageId = coerceBoundedText(candidate.activePageId, MAX_PAGE_ID_LENGTH);
    if (!activePageId || !pageIds.has(activePageId)) return null;
    return { version: MULTI_PAGE_VERSION, activePageId, pages };
};

export const createMultiPageMetadata = (
    pages: DiagramPage[],
    activePageId: string,
    activeNodes: Node[],
    activeEdges: Edge[],
): { multiPage: PersistedMultiPageState } | null => {
    const snapshot = pages.map(page => page.id === activePageId
        ? { ...page, nodes: activeNodes, edges: activeEdges }
        : page);
    const parsed = parseMultiPageMetadata({
        multiPage: {
            version: MULTI_PAGE_VERSION,
            activePageId,
            pages: snapshot,
        },
    });
    return parsed ? { multiPage: parsed } : null;
};
