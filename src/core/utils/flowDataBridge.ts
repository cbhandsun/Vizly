export interface FlowDataBridgeCloudMetadata {
    provider?: string;
    id?: string;
    title?: string;
    openedAt?: string;
}

export interface FlowDataBridgeMetadata {
    title?: string;
    cloud?: FlowDataBridgeCloudMetadata;
    [key: string]: unknown;
}

export interface FlowDataBridgeEntry extends Record<string, unknown> {
    id?: string;
    name?: string;
    nodes?: unknown[];
    edges?: unknown[];
    metadata?: FlowDataBridgeMetadata;
    addNode?: (payload: unknown) => unknown;
    addChild?: (payload: unknown) => unknown;
    deleteNodes?: (ids: string[]) => unknown;
    collapse?: (id: string, collapsed: boolean) => unknown;
    exportMindmapMd?: () => unknown;
    export?: (payload: unknown) => unknown;
    connectNodes?: (payload: unknown) => unknown;
    getCanvasSnapshot?: () => unknown;
    replaceCanvasSnapshot?: (snapshot: unknown) => unknown;
}

type FlowDataBridgeRegistry = Record<string, FlowDataBridgeEntry | undefined>;

declare global {
    interface Window {
        __flowDataBridge?: FlowDataBridgeRegistry;
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const getFlowDataBridgeRegistry = (): FlowDataBridgeRegistry | undefined => {
    if (typeof window === 'undefined') return undefined;
    return isRecord(window.__flowDataBridge) ? window.__flowDataBridge : undefined;
};

export const getFlowDataBridge = (diagramId: string): FlowDataBridgeEntry | undefined => {
    if (!diagramId) return undefined;
    return getFlowDataBridgeRegistry()?.[diagramId];
};

export const getStandardFlowDataBridge = (diagramId: string): StandardDiagramData | undefined => {
    const entry = getFlowDataBridge(diagramId);
    if (!entry) return undefined;
    try {
        return coerceStandardDiagramImport(entry, {
            id: entry.id || diagramId,
            title: entry.name || entry.metadata?.title || diagramId,
        });
    } catch {
        return undefined;
    }
};

export const getFlowDataBridgeNodes = (diagramId: string): unknown[] => {
    const nodes = getFlowDataBridge(diagramId)?.nodes;
    return Array.isArray(nodes) ? nodes : [];
};

export const getFlowDataBridgeEdges = (diagramId: string): unknown[] => {
    const edges = getFlowDataBridge(diagramId)?.edges;
    return Array.isArray(edges) ? edges : [];
};

export const registerFlowDataBridge = (
    diagramId: string,
    entry: FlowDataBridgeEntry,
): (() => void) => {
    if (typeof window === 'undefined' || !diagramId || diagramId.length > 200) return () => {};
    window.__flowDataBridge ??= {};
    window.__flowDataBridge[diagramId] = entry;
    return () => {
        if (window.__flowDataBridge?.[diagramId] === entry) {
            delete window.__flowDataBridge[diagramId];
        }
    };
};

export const removeFlowDataBridge = (diagramId: string): void => {
    const registry = getFlowDataBridgeRegistry();
    if (!registry || !diagramId) return;
    delete registry[diagramId];
};

export const registerFlowDesignerCloudOpener = (
    opener: NonNullable<Window['__flowDesignerOpenCloud']>,
): (() => void) => {
    if (typeof window === 'undefined') return () => {};
    window.__flowDesignerOpenCloud = opener;
    return () => {
        if (window.__flowDesignerOpenCloud === opener) {
            delete window.__flowDesignerOpenCloud;
        }
    };
};
import type { StandardDiagramData } from '../models/DiagramModels';
import { coerceStandardDiagramImport } from './diagramJsonImport';
