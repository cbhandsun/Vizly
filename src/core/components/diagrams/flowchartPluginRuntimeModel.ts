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
    existingNodes?: readonly FlowchartPluginPlacementNode[];
}

interface FlowchartPluginPlacementNode {
    position?: { x?: unknown; y?: unknown };
    width?: unknown;
    height?: unknown;
    measured?: { width?: unknown; height?: unknown };
}

const DEFAULT_PLUGIN_NODE_WIDTH = 100;
const DEFAULT_PLUGIN_NODE_HEIGHT = 50;
const PLUGIN_NODE_PLACEMENT_GAP = 24;
const MAX_PLACEMENT_OBSTACLES = 500;

const toPositiveNodeSize = (value: unknown, fallback: number): number => {
    const number = toFiniteNumber(value, fallback);
    return number > 0 ? Math.min(number, 10_000) : fallback;
};

const overlapsPluginNode = (
    position: { x: number; y: number },
    node: FlowchartPluginPlacementNode,
): boolean => {
    const nodeX = toFiniteNumber(node.position?.x, Number.NaN);
    const nodeY = toFiniteNumber(node.position?.y, Number.NaN);
    if (!Number.isFinite(nodeX) || !Number.isFinite(nodeY)) return false;
    const nodeWidth = toPositiveNodeSize(node.measured?.width ?? node.width, DEFAULT_PLUGIN_NODE_WIDTH);
    const nodeHeight = toPositiveNodeSize(node.measured?.height ?? node.height, DEFAULT_PLUGIN_NODE_HEIGHT);
    return position.x < nodeX + nodeWidth + PLUGIN_NODE_PLACEMENT_GAP
        && position.x + DEFAULT_PLUGIN_NODE_WIDTH + PLUGIN_NODE_PLACEMENT_GAP > nodeX
        && position.y < nodeY + nodeHeight + PLUGIN_NODE_PLACEMENT_GAP
        && position.y + DEFAULT_PLUGIN_NODE_HEIGHT + PLUGIN_NODE_PLACEMENT_GAP > nodeY;
};

const createPluginNodePlacementCandidates = (
    center: { x: number; y: number },
): Array<{ x: number; y: number }> => {
    const candidates = [center];
    const stepX = DEFAULT_PLUGIN_NODE_WIDTH + PLUGIN_NODE_PLACEMENT_GAP * 2;
    const stepY = DEFAULT_PLUGIN_NODE_HEIGHT + PLUGIN_NODE_PLACEMENT_GAP * 2;
    for (let ring = 1; ring <= 8; ring += 1) {
        candidates.push(
            { x: center.x + stepX * ring, y: center.y },
            { x: center.x, y: center.y + stepY * ring },
            { x: center.x - stepX * ring, y: center.y },
            { x: center.x, y: center.y - stepY * ring },
            { x: center.x + stepX * ring, y: center.y + stepY * ring },
            { x: center.x - stepX * ring, y: center.y + stepY * ring },
        );
    }
    return candidates;
};

export const resolveFlowchartPluginNodePosition = ({
    requestedPosition,
    viewport,
    containerWidth,
    containerHeight,
    existingNodes = [],
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

    const center = {
        x: (width / 2 - viewportX) / zoom - 50,
        y: (height / 2 - viewportY) / zoom - 25,
    };
    const obstacles = existingNodes.slice(0, MAX_PLACEMENT_OBSTACLES);
    return createPluginNodePlacementCandidates(center).find(candidate => (
        obstacles.every(node => !overlapsPluginNode(candidate, node))
    )) ?? {
        x: center.x + (DEFAULT_PLUGIN_NODE_WIDTH + PLUGIN_NODE_PLACEMENT_GAP * 2),
        y: center.y + (DEFAULT_PLUGIN_NODE_HEIGHT + PLUGIN_NODE_PLACEMENT_GAP * 2)
            * (obstacles.length + 1),
    };
};

export const createFlowchartPluginNodeId = (
    type: string,
    now: () => number = Date.now,
    random: () => number = Math.random,
): string => `${type}-${now()}-${random().toString(36).slice(2, 9)}`;
