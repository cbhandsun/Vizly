const MAX_PLUGIN_NODE_TYPE_LENGTH = 80;
const SAFE_PLUGIN_NODE_TYPE = /^[A-Za-z0-9_.:-]+$/u;

const toFiniteNumber = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export const createStableFlowchartRendererMapResolver = <TPlugin extends object, TRenderer>(
    defaults: Readonly<Record<string, TRenderer>>,
    loadPluginRenderers: (plugin: TPlugin) => Record<string, TRenderer>,
) => {
    const cache = new WeakMap<TPlugin, Record<string, TRenderer>>();
    return (plugin?: TPlugin): Record<string, TRenderer> => {
        if (!plugin) return defaults;
        const cached = cache.get(plugin);
        if (cached) return cached;
        const renderers = { ...defaults, ...loadPluginRenderers(plugin) };
        cache.set(plugin, renderers);
        return renderers;
    };
};

export const normalizeFlowchartPluginNodeType = (value: unknown): string => {
    if (typeof value !== 'string') return 'custom';
    const normalized = value.trim().slice(0, MAX_PLUGIN_NODE_TYPE_LENGTH);
    return normalized && SAFE_PLUGIN_NODE_TYPE.test(normalized) ? normalized : 'custom';
};

export const normalizeFlowchartPluginNodeData = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {}
);

interface ResolveFlowchartPluginNodePositionOptions {
    requestedPosition?: { x?: unknown; y?: unknown };
    viewport?: { x?: unknown; y?: unknown; zoom?: unknown };
    containerWidth: unknown;
    containerHeight: unknown;
}

export const resolveFlowchartPluginNodePosition = ({
    requestedPosition,
    viewport,
    containerWidth,
    containerHeight,
}: ResolveFlowchartPluginNodePositionOptions): { x: number; y: number } => {
    if (
        requestedPosition
        && typeof requestedPosition.x === 'number'
        && Number.isFinite(requestedPosition.x)
        && typeof requestedPosition.y === 'number'
        && Number.isFinite(requestedPosition.y)
    ) {
        return { x: requestedPosition.x, y: requestedPosition.y };
    }

    const width = Math.max(0, toFiniteNumber(containerWidth, 0));
    const height = Math.max(0, toFiniteNumber(containerHeight, 0));
    const viewportX = toFiniteNumber(viewport?.x, 0);
    const viewportY = toFiniteNumber(viewport?.y, 0);
    const requestedZoom = toFiniteNumber(viewport?.zoom, 1);
    const zoom = requestedZoom > 0 ? requestedZoom : 1;

    return {
        x: (width / 2 - viewportX) / zoom - 50,
        y: (height / 2 - viewportY) / zoom - 25,
    };
};

export const createFlowchartPluginNodeId = (
    type: string,
    now: () => number = Date.now,
    random: () => number = Math.random,
): string => `${type}-${now()}-${random().toString(36).slice(2, 9)}`;
