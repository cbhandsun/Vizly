export const shouldExpandDesignerRightSidebar = ({
    isCollapsed,
    hasSelection,
    isMobile,
    activeTab,
    aiChatVisible,
    previousAiChatVisible,
}: {
    isCollapsed: boolean;
    hasSelection: boolean;
    isMobile: boolean;
    activeTab: 'property' | 'ai';
    aiChatVisible: boolean;
    previousAiChatVisible: boolean;
}): boolean => (
    isCollapsed
    && (
        (hasSelection && !isMobile)
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
