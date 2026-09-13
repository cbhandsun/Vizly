import type { Node } from '@xyflow/react';
import type { FlowchartLayoutDirection as LayoutDirection } from './flowchartLayoutStrategyMode';
import type { LayoutScopeRequest } from './hooks/layoutScopeBoundary';

const FLOWCHART_COMMAND_TEXT_MAX_CHARS = 80;
const FLOWCHART_COMMAND_TEXT_PATTERN = /^[A-Za-z0-9 _+.-]+$/;
const FLOWCHART_COMMAND_SCOPE_MAX_IDS = 1_000;
const FLOWCHART_COMMAND_SCOPE_ID_MAX_CHARS = 512;
const FLOWCHART_EDITOR_ACTIONS: ReadonlySet<string> = new Set([
    'smart-layout',
    'apply-layout',
    'export-png',
    'toggle-ai-chat',
    'add-node',
    'clear-canvas',
]);

type ReactFlowViewportApi = {
    getViewport: () => {
        x: number;
        y: number;
        zoom: number;
    };
};

type NodeTypePlugin = {
    getNodeTypes?: () => Record<string, unknown>;
};

type ToolbarExportButton = {
    click: () => void;
};

export type FlowchartEditorCommandDetail = {
    action: string;
    strategy?: string;
    nodeLayout?: string | undefined;
    direction?: string;
    scope?: LayoutScopeRequest;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
);

const coerceCommandText = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (
        !normalized
        || normalized.length > FLOWCHART_COMMAND_TEXT_MAX_CHARS
        || !FLOWCHART_COMMAND_TEXT_PATTERN.test(normalized)
    ) {
        return undefined;
    }
    return normalized;
};

const coerceLayoutScopeRequest = (
    value: unknown,
    depthValue: unknown,
    selectedNodeIdsValue?: unknown,
    selectedEdgeIdsValue?: unknown,
): LayoutScopeRequest | undefined | null => {
    if (
        value === undefined
        && depthValue === undefined
        && selectedNodeIdsValue === undefined
        && selectedEdgeIdsValue === undefined
    ) return undefined;
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized !== 'selection' && normalized !== 'selection-neighborhood') return null;
    const depth = typeof depthValue === 'number' && Number.isFinite(depthValue)
        ? Math.floor(depthValue)
        : undefined;
    const selectedNodeIds = coerceScopeIds(selectedNodeIdsValue);
    const selectedEdgeIds = coerceScopeIds(selectedEdgeIdsValue);
    if (selectedNodeIds === null || selectedEdgeIds === null) return null;
    return {
        mode: normalized,
        ...(depth !== undefined ? { neighborhoodDepth: depth } : {}),
        ...(selectedNodeIds ? { selectedNodeIds } : {}),
        ...(selectedEdgeIds ? { selectedEdgeIds } : {}),
    };
};

const isScopeId = (value: unknown): value is string => {
    if (
        typeof value !== 'string'
        || value.length === 0
        || value.length > FLOWCHART_COMMAND_SCOPE_ID_MAX_CHARS
    ) return false;
    return !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1F || codePoint === 0x7F;
    });
};

const coerceScopeIds = (value: unknown): readonly string[] | undefined | null => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return null;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of value.slice(0, FLOWCHART_COMMAND_SCOPE_MAX_IDS)) {
        if (!isScopeId(item) || seen.has(item)) continue;
        seen.add(item);
        ids.push(item);
    }
    return ids;
};

export const coerceFlowchartEditorCommandDetail = (value: unknown): FlowchartEditorCommandDetail | null => {
    if (!isRecord(value)) return null;

    const action = coerceCommandText(value.action);
    if (!action || !FLOWCHART_EDITOR_ACTIONS.has(action)) return null;

    const strategy = coerceCommandText(value.strategy);
    const nodeLayout = coerceCommandText(value.nodeLayout);
    const direction = coerceCommandText(value.direction);
    const scope = coerceLayoutScopeRequest(
        value.scope,
        value.neighborhoodDepth,
        value.selectedNodeIds,
        value.selectedEdgeIds,
    );
    if (value.strategy !== undefined && !strategy) return null;
    if (value.nodeLayout !== undefined && !nodeLayout) return null;
    if (value.direction !== undefined && !direction) return null;
    if (scope === null) return null;

    return {
        action,
        ...(strategy ? { strategy } : {}),
        ...(nodeLayout ? { nodeLayout } : {}),
        ...(direction ? { direction } : {}),
        ...(scope ? { scope } : {}),
    };
};

export const readFlowchartEditorCommandWindowSize = (): { width: number; height: number } => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
});

export const findFlowchartEditorCommandExportButton = (): ToolbarExportButton | null => (
    document.querySelector('[data-id="toolbar-export-btn"]') as HTMLButtonElement | null
);

const defaultCreateNodeId = (): string => (
    `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
);

const normalizeStrategyName = (strategy: unknown): string => (
    typeof strategy === 'string'
        ? strategy.trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
        : ''
);

export const resolveFlowchartLayoutDirection = (direction: unknown): LayoutDirection => {
    const rawDirection = typeof direction === 'string' ? direction.trim().toUpperCase() : '';
    return rawDirection === 'LR' || rawDirection === 'RL' || rawDirection === 'BT'
        ? rawDirection
        : 'TB';
};

export const resolveFlowchartLayoutEngine = (strategy: unknown): string => {
    const map: Record<string, string> = {
        domainverticallayout: 'domain-vertical',
        domainvertical: 'domain-vertical',
        domainhorizontallayout: 'domain-horizontal',
        domainhorizontal: 'domain-horizontal',
        domainelklayout: 'domain-elk',
        domainelk: 'domain-elk',
        domaindagrelayout: 'dagre',
        domaindagre: 'dagre',
        dagre: 'dagre',
        elk: 'domain-elk',
    };

    return map[normalizeStrategyName(strategy)] || 'domain-vertical';
};

const getInitialNodeType = (activePlugin?: NodeTypePlugin): string => {
    const nodeTypes = activePlugin?.getNodeTypes?.();
    const [firstNodeType] = nodeTypes ? Object.keys(nodeTypes) : [];
    return firstNodeType || 'custom';
};

export const createViewportCenteredNode = ({
    reactFlowInstance,
    activePlugin,
    label,
    windowWidth,
    windowHeight,
    createNodeId = defaultCreateNodeId,
}: {
    reactFlowInstance: ReactFlowViewportApi | null | undefined;
    activePlugin?: NodeTypePlugin;
    label: string;
    windowWidth: number;
    windowHeight: number;
    createNodeId?: () => string;
}): Node | null => {
    if (!reactFlowInstance) {
        return null;
    }

    const { x, y, zoom } = reactFlowInstance.getViewport();
    const centerX = (windowWidth / 2 - x) / zoom;
    const centerY = (windowHeight / 2 - y) / zoom;

    return {
        id: createNodeId(),
        type: getInitialNodeType(activePlugin),
        position: { x: centerX, y: centerY },
        data: { label },
        selected: true,
    } as Node;
};

export const handleFlowchartEditorCommand = ({
    detail,
    handleSmartLayout,
    handleStrategyLayout,
    handleExport,
    findToolbarExportButton,
    setAiChatVisible,
    setActiveRightTab,
    reactFlowInstance,
    activePlugin,
    setNodes,
    newNodeLabel,
    windowWidth,
    windowHeight,
    confirmClearCanvas,
}: {
    detail: unknown;
    handleSmartLayout: () => void;
    handleStrategyLayout: (
        engineName: string,
        nodeLayout: string | undefined,
        direction: LayoutDirection,
        laneRankPreference?: undefined,
        layoutScope?: LayoutScopeRequest,
    ) => void;
    handleExport: () => void;
    findToolbarExportButton: () => ToolbarExportButton | null;
    setAiChatVisible: (visible: boolean) => void;
    setActiveRightTab: (tab: string) => void;
    reactFlowInstance: ReactFlowViewportApi | null | undefined;
    activePlugin?: NodeTypePlugin;
    setNodes: (updater: (nodes: Node[]) => Node[]) => void;
    newNodeLabel: string;
    windowWidth: number;
    windowHeight: number;
    confirmClearCanvas: () => void;
}): boolean => {
    const safeDetail = coerceFlowchartEditorCommandDetail(detail);
    if (!safeDetail) return false;

    const action = safeDetail.action;

    if (action === 'smart-layout') {
        handleSmartLayout();
        return true;
    }

    if (action === 'apply-layout') {
        const engineName = resolveFlowchartLayoutEngine(safeDetail.strategy);
        const layoutDirection = resolveFlowchartLayoutDirection(safeDetail.direction);
        if (safeDetail.scope) {
            handleStrategyLayout(engineName, safeDetail.nodeLayout, layoutDirection, undefined, safeDetail.scope);
        } else {
            handleStrategyLayout(engineName, safeDetail.nodeLayout, layoutDirection);
        }
        return true;
    }

    if (action === 'export-png') {
        const downloadButton = findToolbarExportButton();
        if (downloadButton) {
            downloadButton.click();
        } else {
            handleExport();
        }
        return true;
    }

    if (action === 'toggle-ai-chat') {
        setAiChatVisible(true);
        setActiveRightTab('ai');
        return true;
    }

    if (action === 'add-node') {
        const newNode = createViewportCenteredNode({
            reactFlowInstance,
            activePlugin,
            label: newNodeLabel,
            windowWidth,
            windowHeight,
        });

        if (!newNode) {
            return false;
        }

        setNodes((nodes) => [...nodes, newNode]);
        return true;
    }

    if (action === 'clear-canvas') {
        confirmClearCanvas();
        return true;
    }

    return false;
};

export const createFlowchartEditorCommandEventHandler = ({
    handleSmartLayout,
    handleStrategyLayout,
    handleExport,
    findToolbarExportButton,
    setAiChatVisible,
    setActiveRightTab,
    reactFlowInstance,
    activePlugin,
    setNodes,
    newNodeLabel,
    windowWidth,
    windowHeight,
    confirmClearCanvas,
}: Omit<Parameters<typeof handleFlowchartEditorCommand>[0], 'detail'>) => (
    event: { detail?: unknown }
): boolean => handleFlowchartEditorCommand({
    detail: event.detail,
    handleSmartLayout,
    handleStrategyLayout,
    handleExport,
    findToolbarExportButton,
    setAiChatVisible,
    setActiveRightTab,
    reactFlowInstance,
    activePlugin,
    setNodes,
    newNodeLabel,
    windowWidth,
    windowHeight,
    confirmClearCanvas,
});
