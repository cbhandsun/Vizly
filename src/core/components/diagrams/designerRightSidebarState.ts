export const shouldExpandDesignerRightSidebar = ({
    isCollapsed,
    hasSelection,
    previousHasSelection = false,
    isMobile,
    activeTab,
    aiChatVisible,
    previousAiChatVisible,
}: {
    isCollapsed: boolean;
    hasSelection: boolean;
    previousHasSelection?: boolean;
    isMobile: boolean;
    activeTab: 'property' | 'ai';
    aiChatVisible: boolean;
    previousAiChatVisible: boolean;
}): boolean => (
    isCollapsed
    && (
        (hasSelection && !previousHasSelection && !isMobile)
        || (activeTab === 'ai' && aiChatVisible && !previousAiChatVisible)
    )
);

export const shouldActivateDesignerPropertyTab = ({
    activeTab,
    hasSelection,
    isMobile,
    previousHasSelection,
}: {
    activeTab: 'property' | 'ai';
    hasSelection: boolean;
    isMobile: boolean;
    previousHasSelection: boolean;
}): boolean => (
    !isMobile
    && activeTab !== 'property'
    && hasSelection
    && !previousHasSelection
);

export const shouldOpenDesignerAiSidebar = (
    activeTab: 'property' | 'ai',
    aiChatVisible: boolean,
): boolean => activeTab !== 'ai' || !aiChatVisible;

export const shouldFreezeDesignerRightSidebarDuringDrag = (
    previous: { isDraggingNode: boolean },
    next: { isDraggingNode: boolean },
): boolean => previous.isDraggingNode && next.isDraggingNode;

type DesignerRightSidebarMemoInput = Readonly<{
    isDraggingNode: boolean;
    selectedNodes: readonly unknown[];
    selectedEdges: readonly unknown[];
}> & Readonly<Record<string, unknown>>;

const haveSameItemReferences = (
    previous: readonly unknown[],
    next: readonly unknown[],
): boolean => previous.length === next.length
    && previous.every((item, index) => item === next[index]);

const ROUTING_GEOMETRY_KEYS = new Set([
    'computed',
    'dragging',
    'height',
    'measured',
    'position',
    'positionAbsolute',
    'width',
]);

const haveSameNodeBusinessProjection = (previous: unknown, next: unknown): boolean => {
    if (previous === next) return true;
    if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return false;
    const previousRecord = previous as Readonly<Record<string, unknown>>;
    const nextRecord = next as Readonly<Record<string, unknown>>;
    const keys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
    for (const key of keys) {
        if (ROUTING_GEOMETRY_KEYS.has(key)) continue;
        if (!Object.is(previousRecord[key], nextRecord[key])) return false;
    }
    return true;
};

const haveSameNodeBusinessProjections = (
    previous: readonly unknown[],
    next: readonly unknown[],
): boolean => previous.length === next.length
    && previous.every((item, index) => haveSameNodeBusinessProjection(item, next[index]));

const usesCustomPropertyPanel = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    return typeof (value as Readonly<Record<string, unknown>>).renderCustomPropertyPanel === 'function';
};

export const shouldReuseDesignerRightSidebar = <T extends DesignerRightSidebarMemoInput>(
    previous: T,
    next: T,
): boolean => {
    if (next.isDraggingNode) return true;
    const preserveFullNodeUpdates = usesCustomPropertyPanel(previous.activePlugin)
        || usesCustomPropertyPanel(next.activePlugin);
    const selectedNodesMatch = preserveFullNodeUpdates
        ? haveSameItemReferences(previous.selectedNodes, next.selectedNodes)
        : haveSameNodeBusinessProjections(previous.selectedNodes, next.selectedNodes);
    if (
        !selectedNodesMatch
        || !haveSameItemReferences(previous.selectedEdges, next.selectedEdges)
    ) return false;
    const previousKeys = Object.keys(previous) as Array<keyof T>;
    if (previousKeys.length !== Object.keys(next).length) return false;
    return previousKeys.every(key => (
        key === 'selectedNodes'
        || key === 'selectedEdges'
        || key === 'isDraggingNode'
        || (key === 'pluginCtx' && !preserveFullNodeUpdates)
        || Object.is(previous[key], next[key])
    ));
};

export const MOBILE_DESIGNER_PANEL_DOCK_CLEARANCE =
    'calc(88px + env(safe-area-inset-bottom, 0px))';
export const MOBILE_DESIGNER_PANEL_WIDTH =
    'calc(100vw / var(--commercial-ui-scale, 1))';

const LEFT_SIDEBAR_OFFSET_VARIABLE = 'var(--left-sidebar-offset, 0px)';

export const createDesignerRightSidebarOffsetVariables = (
    visibleWidth: number | null,
): Readonly<{ rightSidebarOffset: string; maxSidebarOffset: string }> => {
    const safeVisibleWidth = typeof visibleWidth === 'number'
        && Number.isFinite(visibleWidth)
        && visibleWidth >= 0
        && visibleWidth <= 10_000
        ? visibleWidth
        : null;
    if (safeVisibleWidth === null) {
        return {
            rightSidebarOffset: '0px',
            maxSidebarOffset: LEFT_SIDEBAR_OFFSET_VARIABLE,
        };
    }
    const rightSidebarOffset = `${safeVisibleWidth}px`;
    return {
        rightSidebarOffset,
        maxSidebarOffset: `max(${LEFT_SIDEBAR_OFFSET_VARIABLE}, ${rightSidebarOffset})`,
    };
};

export const createDesignerRightSidebarLayout = ({
    isCollapsed,
    isMobile,
    panelWidth,
}: {
    isCollapsed: boolean;
    isMobile: boolean;
    panelWidth: number;
}) => {
    if (isMobile) {
        return {
            position: 'fixed' as const,
            right: 0,
            left: 0,
            top: 'auto',
            bottom: MOBILE_DESIGNER_PANEL_DOCK_CLEARANCE,
            maxHeight: 'calc(100% - 176px)',
            height: isCollapsed ? 0 : 'min(85vh, calc(100% - 176px))',
            width: MOBILE_DESIGNER_PANEL_WIDTH,
        };
    }

    return {
        position: 'absolute' as const,
        right: 16,
        left: 'auto',
        top: 72,
        bottom: 'auto',
        maxHeight: 'calc(100% - 96px)',
        height: isCollapsed ? 'max-content' : 'calc(100% - 96px)',
        width: isCollapsed ? 'var(--commercial-touch-target, 44px)' : panelWidth,
    };
};
