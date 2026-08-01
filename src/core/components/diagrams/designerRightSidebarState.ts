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

export const MOBILE_DESIGNER_PANEL_DOCK_CLEARANCE =
    'calc(88px + env(safe-area-inset-bottom, 0px))';

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
            width: '100%',
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
