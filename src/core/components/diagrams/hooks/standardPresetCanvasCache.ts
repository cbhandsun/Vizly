import type { Edge, Node } from '@xyflow/react';
import { EDGE_ROUTING_CACHE_VERSION } from '../../../routing/routingVersion';

export type CanvasData = { nodes: Node[]; edges: Edge[] };
export type StandardPresetCanvasConverter = (preset: any) => Promise<CanvasData>;

export const STANDARD_PRESET_CANVAS_CACHE_VERSION = EDGE_ROUTING_CACHE_VERSION;
const STANDARD_PRESET_TRUNK_POLISH_VERSION = 2;
const STORAGE_KEY_PREFIX = 'vizly:standard-preset-canvas';
const INTERACTIVE_EDGE_ROUTING_NODE_THRESHOLD = 36;
const INTERACTIVE_EDGE_ROUTING_EDGE_THRESHOLD = 36;

export const resolveStandardPresetEdgeRoutingQuality = (preset: any): 'full' | 'interactive' => {
    const nodeCount = Array.isArray(preset?.nodes) ? preset.nodes.length : 0;
    const edgeCount = Array.isArray(preset?.edges) ? preset.edges.length : 0;
    return nodeCount > INTERACTIVE_EDGE_ROUTING_NODE_THRESHOLD
        || edgeCount > INTERACTIVE_EDGE_ROUTING_EDGE_THRESHOLD
        ? 'interactive'
        : 'full';
};

const defaultStandardPresetCanvasConverter: StandardPresetCanvasConverter = async (preset) => {
    const { standardDataToCanvas } = await import('../designerUtils');
    return standardDataToCanvas(preset, undefined, {
        edgeRoutingQuality: resolveStandardPresetEdgeRoutingQuality(preset),
    });
};

export const cloneCanvasData = (canvas: CanvasData): CanvasData => {
    try {
        if (typeof structuredClone === 'function') return structuredClone(canvas);
    } catch {
        // Fall back to a targeted clone below when structuredClone cannot handle a value.
    }
    return {
        nodes: canvas.nodes.map((node) => ({
            ...node,
            position: node.position ? { ...node.position } : node.position,
            measured: (node as any).measured ? { ...(node as any).measured } : (node as any).measured,
            style: node.style ? { ...(node.style as any) } : node.style,
            data: node.data && typeof node.data === 'object' ? { ...(node.data as any) } : node.data,
        })),
        edges: canvas.edges.map((edge) => ({
            ...edge,
            data: edge.data && typeof edge.data === 'object' ? { ...(edge.data as any) } : edge.data,
        })),
    };
};

const hashString = (input: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};

const createPresetSignature = (id: string, preset: any): string => {
    let serialized: string;
    try {
        serialized = JSON.stringify({
            nodes: preset?.nodes,
            edges: preset?.edges,
            groups: preset?.groups,
            layout: preset?.layout,
            theme: preset?.theme,
            metadata: preset?.metadata,
        });
    } catch {
        serialized = String(id || '');
    }
    return `${String(id || '')}:${hashString(serialized || '')}`;
};

const getStorage = (): Storage | null => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage;
    } catch {
        return null;
    }
};

const isRecord = (value: unknown): value is Record<string, any> => (
    !!value && typeof value === 'object' && !Array.isArray(value)
);

const isFinitePosition = (position: unknown): position is { x: number; y: number } => (
    isRecord(position)
    && typeof position.x === 'number'
    && Number.isFinite(position.x)
    && typeof position.y === 'number'
    && Number.isFinite(position.y)
);

const parseCachedCanvasData = (raw: string | null): CanvasData | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed) || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
        const nodes = parsed.nodes;
        const edges = parsed.edges;
        const hasValidNodes = nodes.every((node: unknown) => (
            isRecord(node)
            && typeof node.id === 'string'
            && isFinitePosition(node.position)
            && isRecord(node.data)
        ));
        const hasValidEdges = edges.every((edge: unknown) => (
            isRecord(edge)
            && typeof edge.id === 'string'
            && typeof edge.source === 'string'
            && typeof edge.target === 'string'
        ));
        return hasValidNodes && hasValidEdges ? { nodes: nodes as Node[], edges: edges as Edge[] } : null;
    } catch {
        return null;
    }
};

const getNodeDataString = (node: Node, key: string): string => (
    typeof (node.data as any)?.[key] === 'string'
        ? String((node.data as any)[key]).trim()
        : ''
);

const isPersistedTitleGroupNode = (node: Node): boolean => (
    String(node.type || '') === 'titleGroup' || String(node.id || '').startsWith('titlegroup-')
);

const isPersistedSubGroupNode = (node: Node): boolean => (
    String(node.type || '') === 'subGroup' || String(node.id || '').startsWith('subgroup-')
);

const isPersistedCanvasCompatibleWithPreset = (canvas: CanvasData, preset: any): boolean => {
    const layout = preset?.layout as any;
    const nodes = canvas.nodes;
    if (layout?.generateDomainGroups === false && nodes.some(isPersistedTitleGroupNode)) {
        return false;
    }
    if (layout?.generateSubDomainGroups === false && nodes.some(isPersistedSubGroupNode)) {
        return false;
    }

    if (Array.isArray(layout?.domainWhitelist)) {
        const allowedDomains = new Set(layout.domainWhitelist.map((item: unknown) => String(item).trim()));
        const hasOutOfContractDomain = nodes.some(node => (
            isPersistedTitleGroupNode(node)
            && !allowedDomains.has(getNodeDataString(node, 'domain'))
        ));
        if (hasOutOfContractDomain) return false;
    }

    if (Array.isArray(layout?.subDomainWhitelist)) {
        const allowedSubDomains = new Set(layout.subDomainWhitelist.map((item: unknown) => String(item).trim()));
        const hasOutOfContractSubDomain = nodes.some(node => (
            isPersistedSubGroupNode(node)
            && !allowedSubDomains.has(getNodeDataString(node, 'subDomain'))
        ));
        if (hasOutOfContractSubDomain) return false;
    }

    if (resolveStandardPresetEdgeRoutingQuality(preset) === 'interactive') {
        const hasLegacyFullEdgeRouting = canvas.edges.some(edge => (
            ((edge.data || {}) as Record<string, any>).algorithm !== 'domain-dagre-interactive'
            || ((edge.data || {}) as Record<string, any>).trunkPolishVersion !== STANDARD_PRESET_TRUNK_POLISH_VERSION
        ));
        if (hasLegacyFullEdgeRouting) return false;
    }

    return true;
};

const readPersistedCanvas = (storageKey: string, preset: any): CanvasData | null => {
    const storage = getStorage();
    if (!storage) return null;
    const parsed = parseCachedCanvasData(storage.getItem(storageKey));
    const isCompatible = parsed ? isPersistedCanvasCompatibleWithPreset(parsed, preset) : false;
    if (!parsed || !isCompatible) {
        try { storage.removeItem(storageKey); } catch { /* ignore storage cleanup failures */ }
        if (parsed) return null;
    }
    return parsed;
};

const persistCanvas = (storageKey: string, canvas: CanvasData): void => {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(storageKey, JSON.stringify(canvas));
    } catch {
        // Storage can be unavailable or full; in-memory de-duplication still applies.
    }
};

export const createStandardPresetCanvasLoader = (
    convertStandardDataToCanvas: StandardPresetCanvasConverter = defaultStandardPresetCanvasConverter,
) => {
    const cache = new Map<string, Promise<CanvasData>>();

    return async (id: string, preset: any): Promise<CanvasData> => {
        const signature = createPresetSignature(id, preset);
        const cacheKey = `${STORAGE_KEY_PREFIX}:${STANDARD_PRESET_CANVAS_CACHE_VERSION}:${signature}`;
        const persisted = readPersistedCanvas(cacheKey, preset);
        if (persisted) return cloneCanvasData(persisted);

        let cached = cache.get(cacheKey);
        if (!cached) {
            cached = convertStandardDataToCanvas(preset).then((canvas) => {
                persistCanvas(cacheKey, canvas);
                return canvas;
            }).catch((error) => {
                cache.delete(cacheKey);
                throw error;
            });
            cache.set(cacheKey, cached);
        }
        const canvas = await cached;
        if (isPersistedCanvasCompatibleWithPreset(canvas, preset)) {
            return cloneCanvasData(canvas);
        }

        cache.delete(cacheKey);
        const refreshed = await convertStandardDataToCanvas(preset);
        persistCanvas(cacheKey, refreshed);
        cache.set(cacheKey, Promise.resolve(refreshed));
        return cloneCanvasData(refreshed);
    };
};

export const loadStandardPresetCanvas = createStandardPresetCanvasLoader();
